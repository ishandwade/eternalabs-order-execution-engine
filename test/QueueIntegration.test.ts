import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { QueueEvents } from 'bullmq';
import { orderQueue, auditQueue, connection } from '../src/queue/OrderQueue';

describe('Queue & Worker Behavior', () => {
  let queueEvents: QueueEvents;

  beforeAll(() => {
    queueEvents = new QueueEvents('order-execution', { connection });
  });

  afterAll(async () => {
    await queueEvents.close();
  });

  it('should process a job and hand it off to the audit queue', async () => {
    const job = await orderQueue.add('test-trade', {
      orderId: 'q-test-1',
      tokenIn: 'USDC',
      tokenOut: 'SOL',
      amount: 5
    });

    const result = await job.waitUntilFinished(queueEvents);
    expect(result.signature).toBeDefined();

    // Verify Handoff to Audit Queue
    const auditJobs = await auditQueue.getJobs(['waiting']);
    expect(auditJobs.some(j => j.data.orderId === 'q-test-1')).toBe(true);
  }, 10000);

it('should respect the exponential backoff on failure', async () => {
  const job = await orderQueue.add('fail-trade', { orderId: 'retry-test', amount: -1 });

  // Wait a moment for the worker to process and fail the first time
  await new Promise(r => setTimeout(r, 2000)); 

  const state = await job.getState();
  const updatedJob = await orderQueue.getJob(job.id!);
  
  // In BullMQ, a job failing with attempts left moves to 'delayed'
  expect(state).toBe('delayed');
  expect(updatedJob?.attemptsMade).toBe(1);
});
});