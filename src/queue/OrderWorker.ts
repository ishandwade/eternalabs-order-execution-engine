import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { DexSimulator } from '../router/MockRouter';

const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null,
});

const simulator = new DexSimulator();

export const orderWorker = new Worker('order-execution', async (job: Job) => {
  const { orderId, amount, tokenIn, tokenOut, observedPrice, maxSlippage = 0.01 } = job.data;

  const updateState = async (status: string, extraData = {}) => {
    const statusUpdate = { orderId, status, ...extraData };
    await job.updateData({ ...job.data, ...statusUpdate });
    await redis.set(`order:status:${orderId}`, JSON.stringify(statusUpdate), 'EX', 3600);
  };

  try {
    console.log(`starting work on order ${orderId}: ${amount} ${tokenIn} to ${tokenOut}`);
    
    await updateState('routing');
    const rayQuote = await simulator.fetchRaydiumQuote(tokenIn, tokenOut, amount);
    const metQuote = await simulator.fetchMeteoraQuote(tokenIn, tokenOut, amount);
    
    const bestQuote = rayQuote.rate > metQuote.rate ? rayQuote : metQuote;
    console.log(`picked ${bestQuote.exchange} - it offered a better rate than the alternative`);

    await updateState('building', { dex: bestQuote.exchange });
    
    if (observedPrice) {
      const slippage = (observedPrice - bestQuote.rate) / observedPrice;
      if (slippage > maxSlippage) {
        throw new Error(`price moved too much: ${ (slippage * 100).toFixed(2) }% difference`);
      }
    }

    await updateState('submitted');
    console.log(`sending transaction to ${bestQuote.exchange} now...`);
    
    const execution = await simulator.processTrade(bestQuote.exchange, {
      from: tokenIn,
      to: tokenOut,
      inputAmount: amount,
      quotedRate: bestQuote.rate
    });

    await updateState('confirmed', {
      txHash: execution.signature,
      finalPrice: execution.finalRate
    });
    
    console.log(`order ${orderId} is confirmed. tx: ${execution.signature}`);
    return execution;

  } catch (error: any) {
    await updateState('failed', { error: error.message });
    console.error(`order ${orderId} ran into an issue: ${error.message}`);
    throw error; 
  }
}, {
  connection: { host: '127.0.0.1', port: 6379 },
  concurrency: 8
});

// Startup logs
console.log('worker is up and listening for jobs on port 6379');
console.log('handling up to 8 orders at a time');

orderWorker.on('failed', (job, err) => {
  if (job) {
    console.log(`job ${job.id} failed, but bullmq will handle the retry if configured`);
  }
});