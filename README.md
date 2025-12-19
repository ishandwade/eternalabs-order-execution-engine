This is a live order execution engine that we have made using typescript to simulate a live transaction

Reason Behind Market Order - The variation of fluctuation of the prices being dependent on the volumes moving, and the handling of slippage at multiple intervals (I had tried the SDK as well but faced problems creating my own liquidity pools on devnet) and how the price fluctuation handling has to work at multiple intervals.


Learnings :-

Slippage(Financial) - When you trade it is not a stright line but curves i.e the more you trade with or against the pool the curve moves against you i.e If youre Selling 10000 tokens you might not get all of them at the exact same price .
- Calculated in 2 intervals
    P initial - Initial Price at the queue
    P intermediate - Price at the time of the routing
    P Actual - When the order is getting executed (which usually takes 2/3 seconds) The Price fluctuates and hence a final price

    So Slippage has to be checked in 2 places that being the Worker (before exec at the time of p intermediate) and the Router (At the time of trade execution)

Initial Attempt - Tried with API's to get live data from Raydium and Jupiter Exchanges and redis based caching
Observations :-
    Rate Limiters set - Safe interval was 5 seconds (429 error)
    Upon Research crypto trade fluctuations are at 1s
    Slippage cannot be calculated accurately (as on the time of execution to calculate the slippage the live prices are needed)
    Redis cannot be taken as a good choice to store price of tokens (functionally)


Validations
    We added 2 Validations to ensure only valid ones are added to the queue and sent to the worker for processing

    - Syntactic Analysis : Added Pattern validations for both Amount and the TokenIn and TokenOut fields so only valid amounts and Token names are added
    - Semantic Validation: Added checks for Token -> As The addresses are used by raydium and meteora to identify corrext liquidity pools and prevent transactions on pairs that dont exist
    Added Checks in db for checking if liquidity pool is existent and active and continuing the transaction




Table Design: -
The following tables have been created with the schema trading;

    User Data (users): (id, created_at)

    Order History for User (orders): (id, user_id, created_at)

    Order Metadata (order_assets): (order_id, token_in, token_out, amount_in, amount_out, slippage_bps, created_at)

    Order Audit Trail (order_events): (id, order_id, state, details, event_time)

    Token Registry (tokens): (token_id, symbol, mint_address, decimals, token_name, created_at)

    Liquidity Pools (pools): (pool_id, token_in_id, token_out_id, exchange_name, pool_address, is_active)



    We also indexed columns for faster data retrieval


Events 
- order:orderId - Order Specific Event 
- orders:all - Event containing all the orders currently going on
- auditlog - Event for persistence of logs to postgres 


Deployment
    This Project is deployed on Amazon Cloud in an EC2 Instance, which uses Github Actions and Github Container Repository for the Build pipeline



✅ Order type: Market order
✅ Execution: Mock DEX
✅ Routing: Raydium vs Meteora (mocked)
✅ Queue: BullMQ + Redis
✅ Realtime: WebSocket + Redis Pub/Sub
✅ API: Fastify + TypeScript
✅ DB: PostgreSQL (history)
✅ Workers: Multiple BullMQ workers 
