import 'dotenv/config';
import { FastifyInstance, FastifyRequest } from 'fastify';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { orderQueue } from '../queue/OrderQueue';
import { Pool } from 'pg';

// Connections
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
});

const pgPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dexorderexecutionengine',
});

interface OrderDTO {
  tokenIn: string;
  tokenOut: string;
  amount: number;
  userId: string;
  slippageBps?: number;
}

export async function OrderController(app: FastifyInstance) {
  
  // 1. POST: Create and Queue Order
  app.post('/api/orders/execute', async (request, reply) => {
    const client = await pgPool.connect();
    
    try {
      const { tokenIn, tokenOut, amount, userId, slippageBps = 50 } = request.body as OrderDTO;
      
      const orderId = uuidv4();
      const timeQueuedAt = new Date().toISOString();

      await client.query('BEGIN');
      
      // Ensure user exists (ID is now TEXT)
      await client.query(
        'INSERT INTO trading.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
        [userId]
      );

      // Persist primary order record
      await client.query(
        'INSERT INTO trading.orders (id, user_id) VALUES ($1, $2)', 
        [orderId, userId]
      );
      
      // Persist asset metadata and slippage
      await client.query(
        `INSERT INTO trading.order_assets (order_id, token_in, token_out, amount_in, slippage_bps) 
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, tokenIn, tokenOut, amount, slippageBps]
      );

      // Log initial event (This could also be moved to your Audit Worker)
      await client.query(
        'INSERT INTO trading.order_events (order_id, state, details) VALUES ($1, $2, $3)',
        [orderId, 'queued', JSON.stringify({ message: 'Order initialized in database' })]
      );
      
      await client.query('COMMIT');

      // Set initial state in Redis for fast WebSocket hydration
      await redis.hset(`order:${orderId}`, {
        status: 'queued',
        tokenIn,
        tokenOut,
        amount,
        slippageBps,
        timeQueuedAt
      });
      await redis.expire(`order:${orderId}`, 3600); // 1 hour TTL

      // Enqueue for Execution Worker
      await orderQueue.add('order-execution', { 
        orderId, 
        tokenIn, 
        tokenOut, 
        amount, 
        slippageBps,
        userId
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }
      });

      return reply.code(202).send({
        orderId,
        status: 'queued',
        timeQueuedAt,
        message: 'Order accepted'
      });

    } catch (err) {
      await client.query('ROLLBACK');
      app.log.error(err);
      return reply.status(500).send({ error: 'Failed to initialize order' });
    } finally {
      client.release();
    }
  });

  // 2. WebSocket: Real-time status stream
  app.get('/ws/orders/:orderId', { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    const { orderId } = req.params as { orderId: string };

    const sub = redis.duplicate();
    sub.subscribe(`order:${orderId}`);

    sub.on('message', (channel, message) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    });

    socket.on('close', async () => {
      await sub.unsubscribe(`order:${orderId}`);
      sub.quit();
    });
    
    // Hydrate the client with current Redis state immediately
    redis.hgetall(`order:${orderId}`).then((data) => {
      if (Object.keys(data).length > 0) {
        socket.send(JSON.stringify({ type: 'initial_state', ...data }));
      }
    });
  });
}