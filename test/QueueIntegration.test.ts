import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { orderWorker } from '../src/queue/OrderWorker';

// 1. Define a plain config object for BullMQ constructors
const redisOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null, // Required for BullMQ
};

describe('OrderWorker Integration Suite', () => {
  // Use the config object for Queues to avoid 'overload' errors
  const testQueue = new Queue('order-execution', { connection: redisOptions });
  const auditQueue = new Queue('audit-log', { connection: redisOptions });
  const queueEvents = new QueueEvents('order-execution', { connection: redisOptions });
  
  // Use a real Redis instance only for direct data checks
  const redisClient = new Redis(redisOptions);

  beforeEach(async () => {
    await testQueue.drain();
    await auditQueue.drain();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await testQueue.close();
    await auditQueue.close();
    await queueEvents.close();
    await orderWorker.close();
    await redisClient.quit();
  });

  it('should complete a trade and persist state in Redis hash', async () => {
    const orderId = 'test-order-123';
    
    // 2. Add job to queue
    const job = await testQueue.add('trade', {
      orderId,
      tokenIn: 'USDC',
      tokenOut: 'SOL',
      amount: 10
    });

    // 3. Wait for BullMQ to process the job
    const result = await job.waitUntilFinished(queueEvents);
    
    expect(result.signature).toBeDefined();

    // 4. Verify the side-effect (HSET) using our direct redis client
    const savedState = await redisClient.hgetall(`order:${orderId}`);
    expect(savedState.status).toBe('confirmed');
  }, 10000);

 it('should hand off data to the audit-log queue', async () => {
    const orderId = 'audit-check-456';
    await testQueue.add('trade', { orderId, tokenIn: 'USDC', tokenOut: 'SOL', amount: 5 });

    // INCREASE THIS DELAY: 
    // Your retry delay is 1.5s. Let's wait 4s to be safe.
    await new Promise(r => setTimeout(r, 4000));

    const auditJobs = await auditQueue.getJobs(['waiting', 'completed']);
    
    // Find the LATEST state for this order
    const match = auditJobs
      .filter(j => j.data.orderId === orderId)
      .find(j => j.data.state === 'confirmed');
    
    expect(match).toBeDefined();
    expect(match?.data.state).toBe('confirmed');
  }, 10000); // Also ensure the test timeout is long enough
});
