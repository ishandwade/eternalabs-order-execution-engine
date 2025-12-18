import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import Redis from 'ioredis';

// Database & Redis configuration (Matches your worker config)
const pgPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  database: process.env.DB_NAME || 'dexorderexecutionengine',
  port: 5432,
});

const redis = new Redis();
const API_URL = 'http://localhost:3000';

describe('Order Execution Integration', () => {
  
  afterAll(async () => {
    await pgPool.end();
    await redis.quit();
  });

  it('should process a trade and log "confirmed" in the database', async () => {
    const tradeRequest = {
      userId: 'test_user_v1',
      tokenIn: 'USDC',
      tokenOut: 'SOL',
      amount: 10,
      slippageBps: 100
    };

    // 1. Act: Trigger the order
    const res = await request(API_URL).post('/api/orders/execute').send(tradeRequest);
    expect(res.status).toBe(202);
    const { orderId } = res.body;

    // 2. Wait & Assert: Poll for database updates
    let statusFound = false;
    for (let i = 0; i < 10; i++) {
      const result = await pgPool.query(
        'SELECT state FROM trading.order_events WHERE order_id = $1 AND state = $2',
        [orderId, 'confirmed']
      );

      if (result.rowCount && result.rowCount > 0) {
        statusFound = true;
        break;
      }
      await new Promise(r => setTimeout(r, 1000)); // Polling interval
    }

    expect(statusFound, "Order failed to reach CONFIRMED state in time").toBe(true);
  }, 15000); // 15s timeout for async worker latency

  it('should log "failed" if slippage is set to zero', async () => {
    const riskyTrade = {
      userId: 'test_user_v1',
      tokenIn: 'USDC',
      tokenOut: 'SOL',
      amount: 100,
      slippageBps: 0 // Will trigger a slippage error in MockRouter
    };

    const res = await request(API_URL).post('/api/orders/execute').send(riskyTrade);
    const { orderId } = res.body;

    let failureLogged = false;
    for (let i = 0; i < 10; i++) {
      const result = await pgPool.query(
        'SELECT state FROM trading.order_events WHERE order_id = $1 AND state = $2',
        [orderId, 'failed']
      );

      if (result.rowCount && result.rowCount > 0) {
        failureLogged = true;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    expect(failureLogged).toBe(true);
  }, 15000);
});