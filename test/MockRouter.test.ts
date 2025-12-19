import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DexSimulator } from '../src/router/MockRouter';

describe('DexSimulator Technical Suite', () => {
  let simulator: DexSimulator;

  beforeEach(() => {
    simulator = new DexSimulator();
    vi.restoreAllMocks();
  });

  describe('Section 1: AMM Pricing & Math Logic', () => {
    // Test 1: Constant Product Formula Accuracy
    it('should apply a 0.3% fee to the input amount', async () => {
      const amount = 100;
      const quote = await simulator.getQuote('RAYDIUM', 'SOL', 'USDC', amount);
      // Fee should be exactly 0.3
      expect(quote.providerFee).toBe(0.3);
    });

    // Test 2: Price Impact vs Liquidity Depth
    it('should show higher price impact on METEORA due to lower liquidity', async () => {
      const amount = 100;
      const raydium = await simulator.getQuote('RAYDIUM', 'SOL', 'USDC', amount);
      const meteora = await simulator.getQuote('METEORA', 'SOL', 'USDC', amount);
      
      // Raydium ($1M depth) should have lower impact than Meteora ($500k depth)
      expect(meteora.priceImpact).toBeGreaterThan(raydium.priceImpact);
    });

    // Test 3: Slippage Scaling
    it('should increase price impact as trade size increases', async () => {
      const smallQuote = await simulator.getQuote('RAYDIUM', 'SOL', 'USDC', 10);
      const largeQuote = await simulator.getQuote('RAYDIUM', 'SOL', 'USDC', 1000);
      
      expect(largeQuote.priceImpact).toBeGreaterThan(smallQuote.priceImpact);
    });

    // Test 4: Default Pool Fallback
    it('should use default reserves for unknown token pairs', async () => {
      const quote = await simulator.getQuote('RAYDIUM', 'UNKNOWN', 'TOKEN', 10);
      expect(quote.rate).toBeDefined();
      expect(quote.poolId).toContain('raydium');
    });
  });

  describe('Section 2: Execution & Slippage Guards', () => {
    // Test 5: Signature Formatting
    it('should generate a signature with the correct sig_ prefix', async () => {
      const result = await simulator.processTrade('RAYDIUM', {
        amount: 1,
        quotedRate: 100,
        slippageBps: 1000
      });
      expect(result.signature).toMatch(/^sig_[a-f0-9]/);
    });

    // Test 6: Successful Execution (Favorable Market)
    it('should succeed when market shift is within slippage bounds', async () => {
      // Mock Math.random to return 1 (market shift becomes 1.01, a price INCREASE)
      vi.spyOn(Math, 'random').mockReturnValue(1);

      const result = await simulator.processTrade('METEORA', {
        amount: 1,
        quotedRate: 100,
        slippageBps: 50
      });

      expect(result.receivedAmount).toBeGreaterThan(100);
    });

    // Test 7: Failed Execution (Slippage Breach)
    it('should throw "Slippage tolerance exceeded" when price drops too fast', async () => {
      // Mock Math.random to return 0 (market shift becomes 0.99, a 1% drop)
      // 1% drop = 100bps slippage.
      vi.spyOn(Math, 'random').mockReturnValue(0);

      await expect(simulator.processTrade('RAYDIUM', {
        amount: 1,
        quotedRate: 100,
        slippageBps: 10 // Only 0.1% allowed
      })).rejects.toThrow('Slippage tolerance exceeded');
    });

    // Test 8: Latency Simulation
    it('should respect simulated blockchain latency', async () => {
      const start = Date.now();
      await simulator.processTrade('RAYDIUM', { amount: 1, quotedRate: 100, slippageBps: 500 });
      const duration = Date.now() - start;
      
      // Should be at least 1500ms based on your delay()
      expect(duration).toBeGreaterThanOrEqual(1500);
    });
  });

  describe('Section 3: Data Integrity', () => {
    // Test 9: Quote-to-Trade calculation consistency
    it('should calculate receivedAmount correctly based on finalRate', async () => {
      const amount = 5;
      const result = await simulator.processTrade('RAYDIUM', {
        amount,
        quotedRate: 200,
        slippageBps: 1000
      });

      expect(result.receivedAmount).toBe(amount * result.finalRate);
    });

    // Test 10: Unique Pool IDs
    it('should generate unique pool IDs for every quote', async () => {
      const quote1 = await simulator.getQuote('RAYDIUM', 'SOL', 'USDC', 1);
      const quote2 = await simulator.getQuote('RAYDIUM', 'SOL', 'USDC', 1);
      
      expect(quote1.poolId).not.toBe(quote2.poolId);
    });
  });
});
