This is a live order execution engine that we have made using typescript to simulate a live transaction

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


✅ Order type: Market order
✅ Execution: Mock DEX
✅ Routing: Raydium vs Meteora (mocked)
✅ Queue: BullMQ + Redis
✅ Realtime: WebSocket + Redis Pub/Sub
✅ API: Fastify + TypeScript
✅ DB: PostgreSQL (history)
✅ Workers: Multiple BullMQ workers 
