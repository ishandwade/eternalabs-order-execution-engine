import { FastifyInstance, FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { orderQueue } from '../queue/OrderQueue';
import { Pool } from 'pg';

// --- FIXED REDIS CONFIGURATION ---
const redisConfig = {
  host: process.env.REDIS_HOST || 'redis', // Critical: Use 'redis' for Docker
  port: Number(process.env.REDIS_PORT) || 6379,
  retryStrategy(times: number) {
    // Slow down retries to once every 5 seconds to save CPU
    return Math.min(times * 50, 5000); 
  },
  maxRetriesPerRequest: null,
};

const redis = new Redis(redisConfig);

// Catch errors to prevent "Unhandled error event" crashes
redis.on('error', (err) => {
  if (err.message === 'ECONNREFUSED') return; // Silence connection spam
  console.error('[REDIS_ERROR]', err);
});

const pgPool = new Pool({ /* your config */ });

export async function OrderController(app: FastifyInstance) {
  await app.register(websocket);

  app.post('/api/orders/execute', async (request, reply) => {
    const client = await pgPool.connect();
    try {
      const { tokenIn, tokenOut, amount, userId } = request.body as any;
      const orderId = uuidv4();
      const timeQueuedAt = new Date().toISOString();
      const mockHash = `0x${uuidv4().replace(/-/g, '')}`;

      const orderData = {
        orderId,
        status: 'queued',
        hash: mockHash,
        tokenIn,
        tokenOut,
        amount: amount.toString(),
        timeQueuedAt
      };

      await client.query('BEGIN');
      await client.query('INSERT INTO trading.orders(id, user_id) VALUES($1, $2)', [orderId, userId]);
      await client.query('COMMIT');

      // 2. Redis State
      await redis.hset(`order:${orderId}`, orderData);

      // 3. 📣 NOTIFY GLOBAL BROADCAST
      // Note: Make sure your worker publishes to 'orders' or 'orders:all' consistently
      await redis.publish('orders:all', JSON.stringify({
        event: 'ORDER_CREATED',
        ...orderData
      }));

      // 4. Enqueue for Worker
      await orderQueue.add('execute-order', orderData);

      return orderData;
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      app.log.error(err);
      return reply.status(500).send({ error: 'Failed' });
    } finally {
      client.release();
    }
  });

  // Direct WebSocket (Port 80/3000)
  app.get('/ws/orders/:orderId', { websocket: true }, (connection: any, req: FastifyRequest) => {
    const { orderId } = req.params as { orderId: string };
    const socket: WebSocket = connection.socket;
    
    // Use the safe config for the duplicate subscriber
    const sub = new Redis(redisConfig);

    sub.subscribe(`order:${orderId}`, (err) => {
      if (err) app.log.error(`Failed to subscribe: ${err.message}`);
    });

    sub.on('message', (_, msg) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(msg);
      }
    });

    socket.on('close', () => { 
      sub.quit(); 
    });

    // Error handling for the subscriber connection
    sub.on('error', (err) => {
      if (err.message === 'ECONNREFUSED') return;
    });
  });
}