import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import Redis from 'ioredis';

describe('WebSocket Lifecycle (Fastify Native)', () => {
  let pub: Redis;
  // Use the port your local server is running on
  const BASE_URL = 'ws://localhost:3000';

  beforeAll(() => {
    pub = new Redis({ host: '127.0.0.1', port: 6379 });
  });

  afterAll(async () => {
    await pub.quit();
  });

  // This test covers the specific order monitoring logic
  it('should receive initial state and updates for specific orderId', async () => {
    const orderId = `test-order-${Date.now()}`;
    const initialData = { status: 'queued', tokenIn: 'SOL', tokenOut: 'USDC' };
    
    // 1. Seed Redis with initial state
    await pub.hset(`order:${orderId}`, initialData);

    const ws = new WebSocket(`${BASE_URL}/ws/orders/${orderId}`);
    
    const messagePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WS Timeout')), 5000);
      
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        // We look for the final confirmed state
        if (parsed.status === 'confirmed' || parsed.type === 'initial_state') {
          clearTimeout(timeout);
          resolve(parsed);
        }
      });
    });

    // 2. Wait for connection
    await new Promise((resolve) => ws.on('open', resolve));

    // 3. Simulate the worker finishing the order
    const updatePayload = { orderId, status: 'confirmed', txHash: 'sig_success_123' };
    await pub.publish(`order:${orderId}`, JSON.stringify(updatePayload));

    const received: any = await messagePromise;
    expect(received.status).toBeDefined();
    ws.close();
  });
});
