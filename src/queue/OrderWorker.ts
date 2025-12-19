import 'dotenv/config';
import { Worker, Job, Queue } from 'bullmq';
import Redis from 'ioredis';
import { connection } from './OrderQueue';
import { DexSimulator, SwapResult } from '../router/MockRouter';

const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

const pub = new Redis(redisConfig);
const dex = new DexSimulator();
const auditQueue = new Queue('audit-log', { connection });

export const orderWorker = new Worker(
  'order-execution',
  async (job: Job) => {
    const { orderId, tokenIn, tokenOut, amount, slippageBps = 50 } = job.data;

    // Enhanced status emitter with console logging for simulation
    const emitStatus = async (status: 'routing' | 'building' | 'confirmed' | 'failed', details = {}) => {
      console.log(`[STATE_CHANGE] Order: ${orderId} -> Status: ${status.toUpperCase()}`);
      
      if (Object.keys(details).length > 0) {
        console.log(`[DETAILS]`, JSON.stringify(details, null, 2));
      }

      // 1. Hand off to Audit Worker for DB persistence
      await auditQueue.add('log-event', { orderId, state: status, details });
      console.log(`[AUDIT_SENT] Event queued for ${orderId}`);

      // 2. Broadcast for WebSocket clients
      const payload = JSON.stringify({
        orderId,
        status,
        ...details,
        timestamp: Date.now()
      });

      await pub.hset(`order:${orderId}`, { 
    status, 
    ...details 
        });

      

      await Promise.all([
        pub.publish(`order:${orderId}`, payload),
        pub.publish('orders_broadcast', payload),
        pub.publish('orders:all', payload)
      ]);
      console.log(`[PUB_SUB] Broadcasted ${status} for ${orderId}`);
      console.log('---------------------------------------------------');
    };

    try {
      console.log(`\n--- Processing Order: ${orderId} ---`);

      // Step 1: Routing
      await emitStatus('routing');
      const [raydium, meteora] = await Promise.all([
        dex.getQuote('RAYDIUM', tokenIn, tokenOut, amount),
        dex.getQuote('METEORA', tokenIn, tokenOut, amount)
      ]);

      const bestQuote = raydium.rate >= meteora.rate ? raydium : meteora;
      console.log(`[ROUTER] Best venue found: ${bestQuote.exchange} at rate ${bestQuote.rate}`);

      // Step 2: Building
      await emitStatus('building', { 
        venue: bestQuote.exchange, 
        quotedRate: bestQuote.rate,
        priceImpact: bestQuote.priceImpact 
      });

      // Step 3: Execution with Slippage Check
      console.log(`[EXECUTION] Attempting swap on ${bestQuote.exchange}...`);
      const result = await retryAction<SwapResult>(() => 
        dex.processTrade(bestQuote.exchange, {
          amount,
          quotedRate: bestQuote.rate,
          slippageBps
        }), 2);

      // Step 4: Finalization
      await emitStatus('confirmed', {
        txHash: result.signature,
        finalRate: result.finalRate,
        receivedAmount: result.receivedAmount
      });

      console.log(`--- Order ${orderId} Finished Successfully ---\n`);
      return result;

    } catch (error: any) {
      console.error(`[ERROR] Trade execution failed for ${orderId}: ${error.message}`);
      await emitStatus('failed', { error: error.message });
      throw error; 
    }
  },
  { 
    connection, 
    concurrency: 10 
  }
);

async function retryAction<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    console.warn(`[RETRY] Action failed. Retrying... (${retries} attempts left)`);
    await new Promise(r => setTimeout(r, 1500));
    return retryAction(fn, retries - 1);
  }
}

orderWorker.on('failed', (job, err) => {
  console.error(`[WORKER_EVENT] Job ${job?.id} failed permanently: ${err.message}`);
});

orderWorker.on('completed', (job) => {
  console.log(`[WORKER_EVENT] Job ${job.id} marked as COMPLETED by BullMQ`);
});
