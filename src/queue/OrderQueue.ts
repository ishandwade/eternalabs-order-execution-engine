import { Queue } from 'bullmq';

export const orderQueue = new Queue('order-execution', {
  connection: { host: 'localhost', port: 6379 },
  defaultJobOptions: {
    attempts: 3,             //Retry Mechanism
    backoff: {
      type: 'exponential',   //increasing delay between retries
      delay: 1000,           //initial delay of 1 second
    },
    removeOnComplete: true,  
  }
});