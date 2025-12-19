import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { io as Client } from 'socket.io-client';
import Redis from 'ioredis';

describe('WebSocket Lifecycle', () => {
  let client: any;
  let pub: Redis;

// test/WSLifeCycle.test.ts
beforeAll(async () => {
  pub = new Redis();
  client = Client('http://localhost:3000', {
    transports: ['websocket'],
    reconnection: false // Don't hang the test if it fails
  });
  
  return new Promise((resolve, reject) => {
    client.on('connect', resolve);
    client.on('connect_error', (err: Error) => reject(new Error('Server not running on port 3000')));
  });
}, 15000); // Increase Vitest hook timeout

  afterAll(() => {
    client.disconnect();
    pub.disconnect();
  });

  it('should receive real-time updates from orders_broadcast channel', async () => {
    const mockPayload = { orderId: 'ws-123', status: 'confirmed' };
    
    const messagePromise = new Promise((resolve) => {
      client.on('orders_broadcast', (data: string) => resolve(JSON.parse(data)));
    });

    // Simulate the Worker's Redis publish
    await pub.publish('orders_broadcast', JSON.stringify(mockPayload));

    const received = await messagePromise;
    expect(received).toMatchObject(mockPayload);
  });
});