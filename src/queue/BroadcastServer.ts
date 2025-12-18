import { FastifyInstance, FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { orderQueue } from '../queue/OrderQueue';
import { Pool } from 'pg';

const redis = new Redis();
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

      // 1. Database Persistence
      await client.query('BEGIN');
      await client.query('INSERT INTO trading.orders(id, user_id) VALUES($1, $2)', [orderId, userId]);
      await client.query('COMMIT');

      // 2. Redis State
      await redis.hset(`order:${orderId}`, orderData);

      // 3. 📣 NOTIFY GLOBAL BROADCAST (Your Port 8080 Server)
      // We publish to the "orders" channel that your BroadcastServer is watching
      await redis.publish('orders', JSON.stringify({
        event: 'ORDER_CREATED',
        ...orderData
      }));

      // 4. Enqueue for Worker
      await orderQueue.add('execute-order', orderData);

      return orderData;
    } catch (err) {
      await client.query('ROLLBACK');
      return reply.status(500).send({ error: 'Failed' });
    } finally {
      client.release();
    }
  });

  // Direct WebSocket (Port 3000)
  app.get('/ws/orders/:orderId', { websocket: true }, (connection: any, req: FastifyRequest) => {
    const { orderId } = req.params as { orderId: string };
    const socket: WebSocket = connection.socket;
    const sub = redis.duplicate();

    // Listen to specific order updates
    sub.subscribe(`order:${orderId}`);
    sub.on('message', (_, msg) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(msg);
    });

    socket.on('close', () => { sub.quit(); });
  });
}