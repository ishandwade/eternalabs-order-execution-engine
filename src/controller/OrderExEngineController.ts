import 'dotenv/config';
import { FastifyInstance, FastifyRequest } from 'fastify';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { orderQueue } from '../queue/OrderQueue';
import { DataValidator } from '../validations/DataValidation';
import { validateTradeRoute } from '../validations/TradeValidator';

// Shared Connections
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
  
  // WebSocket Health API (Echo Service)
  app.get('/ws/health', { websocket: true }, (socket: WebSocket) => {
    socket.on('message', (message) => {
      if (message.toString() === 'ping') {
        socket.send(JSON.stringify({ status: 'alive', message: 'pong', timestamp: new Date() }));
      }
    });
  });

  // Order Execution
  app.post('/api/orders/execute', async (request, reply) => {
    const { tokenIn, tokenOut, amount, userId, slippageBps = 50 } = request.body as OrderDTO;

    // STAGE 1: Syntax Validation (Regex)
    if (!DataValidator.validateToken(tokenIn) || !DataValidator.validateToken(tokenOut)) {
      return reply.status(400).send({ error: 'Invalid token symbol format' });
    }
    if (!DataValidator.validateAmount(amount)) {
      return reply.status(400).send({ error: 'Amount must be a positive number' });
    }

    const client = await pgPool.connect();
    
    try {
      // Business Validations
      const route = await validateTradeRoute(pgPool, tokenIn, tokenOut);

      const orderId = uuidv4();
      const atomicAmount = Math.floor(amount * Math.pow(10, route.in_decimals));
      const timeQueuedAt = new Date().toISOString();

      // Database Persistence
      await client.query('BEGIN');
      await client.query('INSERT INTO trading.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [userId]);
      await client.query('INSERT INTO trading.orders (id, user_id) VALUES ($1, $2)', [orderId, userId]);
      await client.query(
        `INSERT INTO trading.order_assets (order_id, token_in, token_out, amount_in, slippage_bps) 
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, tokenIn, tokenOut, amount, slippageBps]
      );
      await client.query('COMMIT');

      // Redis Hydration for WebSockets
      await redis.hset(`order:${orderId}`, {
        status: 'queued',
        tokenIn,
        tokenOut,
        exchange: route.exchange_name,
        timeQueuedAt
      });
      await redis.expire(`order:${orderId}`, 3600);

      // Queue for Background Execution
      await orderQueue.add('order-execution', { 
        orderId, 
        tokenIn, 
        tokenOut, 
        amount: atomicAmount, 
        poolAddress: route.pool_address,
        exchange: route.exchange_name,
        slippageBps,
        userId
      });

      return reply.code(202).send({ orderId, status: 'queued', message: 'Order accepted' });

    } catch (err: any) {
      if (client) await client.query('ROLLBACK');
      if (err.message.includes('not supported') || err.message.includes('No active pool')) {
        return reply.status(400).send({ error: err.message });
      }
      app.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  //WebSocket: Real-time status stream
  app.get('/ws/orders/:orderId', { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    const { orderId } = req.params as { orderId: string };
    const sub = redis.duplicate();
    sub.subscribe(`order:${orderId}`);

    sub.on('message', (channel, message) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    });

    socket.on('close', () => {
      sub.unsubscribe(`order:${orderId}`);
      sub.quit();
    });
    
    redis.hgetall(`order:${orderId}`).then((data) => {
      if (Object.keys(data).length > 0) {
        socket.send(JSON.stringify({ type: 'initial_state', ...data }));
      }
    });
  });
}
