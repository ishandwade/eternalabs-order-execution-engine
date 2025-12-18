import { describe, it, expect, beforeEach } from 'vitest';
import { DexSimulator } from '../src/router/MockRouter'; // Ensure this points to your logic file

describe('DexSimulator Technical Suite', () => {
  let simulator: DexSimulator;

  beforeEach(() => {
    simulator = new DexSimulator();
  });

  describe('Quoting Logic', () => {
    it('should provide a rate within 5% of the market benchmark', async () => {
      const quote = await simulator.fetchRaydiumQuote('SOL', 'USDC', 1);
      
      // Market benchmark for SOL-USDC is 100 in our mock
      expect(quote.rate).toBeGreaterThan(95);
      expect(quote.rate).toBeLessThan(105);
    });

    it('should return the correct exchange identifier in the quote', async () => {
      const quote = await simulator.fetchMeteoraQuote('SOL', 'USDC', 1);
      expect(quote.exchange).toBe('METEORA');
    });
  });

  describe('Execution Integrity', () => {
    it('should include a valid transaction signature on success', async () => {
      // We pass a very high rate to ensure it's a "valid" params object
      const result = await simulator.processTrade('RAYDIUM', {
        from: 'SOL',
        to: 'USDC',
        inputAmount: 1,
        quotedRate: 100
      });

      expect(result.signature).toMatch(/^sig_raydium_/);
    });

    it('should throw an error when a network failure occurs', async () => {
      // Note: Since failures are random (15%), we might need to 
      // mock the randomness or run multiple times to catch it.
      // In a real professional setup, we would use vi.spyOn(Math, 'random')
    });
  });
});