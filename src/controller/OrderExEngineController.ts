<<<<<<< Updated upstream
// order-controller.ts
import { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
=======
import 'dotenv/config';
import { FastifyInstance, FastifyRequest } from 'fastify';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { orderQueue } from '../queue/OrderQueue';
import { Pool } from 'pg';
import { DataValidator } from '../validations/DataValidation'; // Import your regex validator
import { validateTradeRoute } from '../validations/TradeValidator'; // Import your logic validator
>>>>>>> Stashed changes

interface ExecuteOrderBody {
  tokenIn: string;
  tokenOut: string;
  amount: number;
}

//POST API to execute an order
export async function OrderController(app: FastifyInstance) {
<<<<<<< Updated upstream
  app.post('/orders/execute', async (request, reply) => {
    const body = request.body as ExecuteOrderBody;

    // Basic validation
    if (!body.tokenIn || !body.tokenOut || !body.amount) {
      return reply.status(400).send({
        error: 'tokenIn, tokenOut, and amount are required',
      });
=======
  
  app.post('/api/orders/execute', async (request, reply) => {
    const { tokenIn, tokenOut, amount, userId, slippageBps = 50 } = request.body as OrderDTO;

    // --- STAGE 1: Data Validation (Regex & Syntax) ---
    if (!DataValidator.validateToken(tokenIn)) {
      return reply.status(400).send({ error: `Invalid format for tokenIn: ${tokenIn}` });
    }
    if (!DataValidator.validateToken(tokenOut)) {
      return reply.status(400).send({ error: `Invalid format for tokenOut: ${tokenOut}` });
    }
    if (!DataValidator.validateAmount(amount)) {
      return reply.status(400).send({ error: `Invalid amount: ${amount}. Must be positive.` });
    }

    const client = await pgPool.connect();
    
    try {
      //Common code Validation Logic
      const route = await validateTradeRoute(client, tokenIn, tokenOut);

      // Convert UI amount to atomic units based on DB decimals
      const atomicAmount = Math.floor(amount * Math.pow(10, route.in_decimals));

      const orderId = uuidv4();
      const timeQueuedAt = new Date().toISOString();

      await client.query('BEGIN');
      
      // Persist records
      await client.query(
        'INSERT INTO trading.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
        [userId]
      );

      await client.query(
        'INSERT INTO trading.orders (id, user_id) VALUES ($1, $2)', 
        [orderId, userId]
      );
      
      await client.query(
        `INSERT INTO trading.order_assets (order_id, token_in, token_out, amount_in, slippage_bps) 
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, tokenIn, tokenOut, amount, slippageBps]
      );

      await client.query(
        'INSERT INTO trading.order_events (order_id, state, details) VALUES ($1, $2, $3)',
        [orderId, 'queued', JSON.stringify({ 
          message: 'Order validated and initialized',
          exchange: route.exchange_name,
          pool: route.pool_address 
        })]
      );
      
      await client.query('COMMIT');

      // Redis state for WebSockets
      await redis.hset(`order:${orderId}`, {
        status: 'queued',
        tokenIn,
        tokenOut,
        amount,
        exchange: route.exchange_name,
        timeQueuedAt
      });
      await redis.expire(`order:${orderId}`, 3600);

      // Enqueue for Execution Worker with rich data from our validation
      await orderQueue.add('order-execution', { 
        orderId, 
        tokenIn, 
        tokenOut, 
        amount: atomicAmount, // Use atomic units here
        poolAddress: route.pool_address,
        exchange: route.exchange_name,
        slippageBps,
        userId
      });

      return reply.code(202).send({
        orderId,
        status: 'queued',
        exchange: route.exchange_name,
        message: 'Order validated and accepted'
      });

    } catch (err: any) {
      if (client) await client.query('ROLLBACK');
      
      // If the error came from our TradeValidator, send it as a 400
      if (err.message.includes('Token not supported') || err.message.includes('No active pool')) {
        return reply.status(400).send({ error: err.message });
      }

      app.log.error(err);
      return reply.status(500).send({ error: 'Failed to process order' });
    } finally {
      client.release();
>>>>>>> Stashed changes
    }

    // Mock Solana-style transaction hash
    const txHash = randomBytes(32).toString('hex');

    const response = {
      hash: txHash,
      status: 'submitted', 
      tokenIn: body.tokenIn,
      tokenOut: body.tokenOut,
      amount: body.amount,
      createdAt: Date.now(),
    };

    return reply.status(200).send(response);
  });

<<<<<<< Updated upstream
}
=======
  //Websocket: Health Check
  app.get('/ws/health', { websocket: true }, (socket: WebSocket) => {
    app.log.info('Health check WebSocket connected');

    socket.on('message', (message) => {
      const data = message.toString();
      if (data === 'ping') {
        socket.send(JSON.stringify({ 
          status: 'alive', 
          timestamp: new Date().toISOString(),
          message: 'pong' 
        }));
      }
    });

    socket.on('close', () => app.log.info('Health check WebSocket disconnected'));
  });

  // WebSocket: Real-time status stream
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
>>>>>>> Stashed changes
