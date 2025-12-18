import { randomUUID } from 'crypto';

// --- Domain Models ---

export interface SwapQuote {
  exchange: 'RAYDIUM' | 'METEORA';
  rate: number;         // Clearer than 'price' for swaps
  providerFee: number;  // More descriptive than 'fee'
}

export interface SwapResult {
  signature: string;    // Industry standard for Solana/Web3
  finalRate: number;    // The price actually achieved
}

export interface LimitOrder {
  id: string;
  sourceToken: string;  // Human-friendly 'tokenIn'
  targetToken: string;  // Human-friendly 'tokenOut'
  quantity: number;     // Human-friendly 'amount'
  platform: 'RAYDIUM' | 'METEORA';
}

// --- Mocking Helpers ---

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Using a more natural naming convention for mapping pairs to market values
const MARKET_BENCHMARKS: Record<string, number> = {
  'SOL-USDC': 100,
};

const getMarketPrice = (from: string, to: string) => 
  MARKET_BENCHMARKS[`${from}-${to}`] ?? 1;

// --- Service Layer ---

export class DexSimulator {
  
  async fetchRaydiumQuote(from: string, to: string, amount: number): Promise<SwapQuote> {
    await delay(200);
    const midPoint = getMarketPrice(from, to);
    // Simulate minor market spread (98% to 102% of benchmark)
    const variation = 0.98 + Math.random() * 0.04;
    
    return { 
      exchange: 'RAYDIUM', 
      rate: midPoint * variation, 
      providerFee: 0.003 
    };
  }

  async fetchMeteoraQuote(from: string, to: string, amount: number): Promise<SwapQuote> {
    await delay(200);
    const midPoint = getMarketPrice(from, to);
    // Slightly wider spread for Meteora in this simulation
    const variation = 0.97 + Math.random() * 0.05;
    
    return { 
      exchange: 'METEORA', 
      rate: midPoint * variation, 
      providerFee: 0.002 
    };
  }

  async processTrade(
    venue: 'RAYDIUM' | 'METEORA',
    tradeParams: {
      from: string;
      to: string;
      inputAmount: number;
      quotedRate: number;
    }
  ): Promise<SwapResult> {
    // Mimic the real-world latency of a blockchain transaction
    const networkLatency = 2000 + Math.random() * 1000;
    await delay(networkLatency);

    // 🎲 Reality check: Web3 transactions fail often
    const FAILURE_CHANCE = 0.15;

    if (Math.random() < FAILURE_CHANCE) {
      const errorLog = [
        'Network RPC timeout',
        'Expired blockhash',
        'Slippage protection triggered',
        'Price moved too fast (stale pool)',
        'Transaction pre-flight simulation failed',
      ];

      const specificError = errorLog[Math.floor(Math.random() * errorLog.length)];
      throw new Error(`[${venue} Engine] Trade Failed: ${specificError}`);
    }

    // Successful trade usually has a tiny bit of slippage from the quote
    const actualExecutionRate = tradeParams.quotedRate * (0.995 + Math.random() * 0.01);

    return {
      signature: `sig_${venue.toLowerCase()}_${randomUUID().split('-')[0]}`,
      finalRate: actualExecutionRate,
    };
  }
}