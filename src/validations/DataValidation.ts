export class DataValidator {
  /**
   * Validates a Token Symbol (e.g., SOL, USDC, BONK)
   * Pattern: 2-10 uppercase alphanumeric characters
   */
  static validateToken(symbol: string): boolean {
    const tokenRegex = /^[A-Z0-9]{2,10}$/;
    return tokenRegex.test(symbol.toUpperCase());
  }

  /**
   * Validates a Trade Amount
   * Pattern: Positive integer or float (e.g., 10, 0.5, 100.25)
   */
  static validateAmount(amount: number): boolean {
    // Check if it's a number and greater than zero
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return false;
    }
    
    // Regex to ensure it's a valid positive decimal format string
    const amountRegex = /^\d+(\.\d+)?$/;
    return amountRegex.test(amount.toString());
  }
}