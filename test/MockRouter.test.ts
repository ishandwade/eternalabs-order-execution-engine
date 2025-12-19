import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DexSimulator } from '../src/router/MockRouter';

describe('DexSimulator Technical Suite', () => {
  let simulator: DexSimulator;

  beforeEach(() => {
    simulator = new DexSimulator();
    vi.restoreAllMocks(); 
  });

  describe('Quoting Logic', () => {
    it('should reflect higher price impact on shallower pools (METEORA)', async () => {
      const amount = 500;
      const raydium = await simulator.getQuote('RAYDIUM', 'SOL', 'USDC', amount);
      const meteora = await simulator.getQuote('METEORA', 'SOL', 'USDC', amount);
      
      expect(meteora.priceImpact).toBeGreaterThan(raydium.priceImpact);
    });

    it('should return a valid SwapQuote object structure', async () => {
      const quote = await simulator.getQuote('RAYDIUM', 'USDC', 'SOL', 1000);
      expect(quote).toHaveProperty('rate');
      expect(quote.exchange).toBe('RAYDIUM');
    });
  });

  describe('Execution Integrity', () => {
    it('should include a valid transaction signature starting with sig_', async () => {
      const result = await simulator.processTrade('RAYDIUM', {
        amount: 1,
        quotedRate: 100,
        slippageBps: 500 
      });
      expect(result.signature).toMatch(/^sig_[a-f0-9]/);
    });

    it('should throw an error when slippage tolerance is exceeded', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0); // Forces 1% drop (100bps)
      await expect(simulator.processTrade('RAYDIUM', {
        amount: 10,
        quotedRate: 100,
        slippageBps: 10 // Only 0.1% allowed
      })).rejects.toThrow('Slippage tolerance exceeded');
    });
  });
});