import { Pool, PoolClient } from 'pg';

export async function validateTradeRoute(pgPool: Pool|PoolClient, tokenIn: string, tokenOut: string) {
    // 1. First, verify both tokens exist individually
    const tokenCheck = await pgPool.query(
        'SELECT symbol, decimals FROM trading.tokens WHERE symbol IN ($1, $2)',
        [tokenIn.toUpperCase(), tokenOut.toUpperCase()]
    );

    const foundSymbols = tokenCheck.rows.map(r => r.symbol);
    
    if (tokenCheck.rows.length < 2) {
        if (!foundSymbols.includes(tokenIn.toUpperCase())) {
            throw new Error(`Token not supported: ${tokenIn}`);
        }
        if (!foundSymbols.includes(tokenOut.toUpperCase())) {
            throw new Error(`Token not supported: ${tokenOut}`);
        }
    }

    // 2. If tokens exist, check for a valid pool
    const poolCheck = await pgPool.query(`
        SELECT p.pool_address, p.exchange_name, t1.decimals as in_decimals
        FROM trading.pools p
        JOIN trading.tokens t1 ON p.token_in_id = t1.token_id
        JOIN trading.tokens t2 ON p.token_out_id = t2.token_id
        WHERE t1.symbol = $1 AND t2.symbol = $2 AND p.is_active = true
        LIMIT 1
    `, [tokenIn.toUpperCase(), tokenOut.toUpperCase()]);

    if (poolCheck.rows.length === 0) {
        throw new Error(`No active pool route found for ${tokenIn} -> ${tokenOut}`);
    }

    return poolCheck.rows[0];
}