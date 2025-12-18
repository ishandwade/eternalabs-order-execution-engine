import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// 1. Dedicated Redis connection for BullMQ
// Setting maxRetriesPerRequest to null is mandatory for BullMQ
export const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
});

// 2. Define the Queue with your Agenda's requirements
export const orderQueue = new Queue('order-execution', { 
  connection,
  defaultJobOptions: {
    // Required: Exponential back-off retry (≤3 attempts)
    attempts: 3,             
    backoff: {
      type: 'exponential',
      delay: 1000, // 1s, 2s, 4s...
    },
    removeOnComplete: true, // Keep Redis clean
    removeOnFail: false     // Keep failed jobs for "post-mortem analysis" (per agenda)
  }
});

//Added Audit Queue Initialization 
export const auditQueue = new Queue('audit-log', { connection });

console.log('[QUEUE] Order execution queue initialized with retry logic');