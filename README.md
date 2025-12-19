# Mock DEX Order Execution Engine

## Overview

This project is a TypeScript-based order execution engine that simulates live cryptocurrency trading in a decentralized exchange (DEX) environment. It is designed to behave like a real trading system by accounting for real-time price fluctuations, slippage, queue-based execution delays, and smart routing across multiple exchanges.

Rather than relying on rate-limited external APIs, the system uses a mock DEX model to accurately reproduce how prices move during the lifecycle of a trade. This makes it ideal for learning, experimentation, and system design validation without the operational risks of live trading.

---

## Why Market Orders?

Market orders were chosen as the primary order type because they best reflect real-world execution complexity. Although they appear simple, market orders are highly sensitive to:

* Execution latency
* Liquidity depth
* Price movement during routing and execution

This makes them an excellent vehicle for modeling slippage, execution uncertainty, and real-time coordination between distributed systems and thats why here were using market orders

---

## Solution Summary

The solution provides a fully mocked DEX trading environment that mirrors real market behavior while remaining deterministic and testable.

### Core Capabilities

* **Market Order Execution**
  Processes market orders with realistic price movement and execution delays.

* **Multi-Interval Slippage Tracking**
  Slippage is calculated at three critical stages:

  * **P_initial**: Price when the order enters the queue
  * **P_intermediate**: Price during routing and validation
  * **P_actual**: Price at final execution (typically 2–3 seconds later)

* **Dual-Layer Validation**

  * *Syntactic validation*: Ensures correct formats for token symbols and trade amounts
  * *Semantic validation*: Confirms the existence and activity of liquidity pools

* **Real-Time Updates**
  WebSocket-based streaming of order state changes for instant frontend feedback.

* **Smart Routing**
  Automatically selects the best route between Raydium and Meteora (mocked).

* **Comprehensive Audit Trail**
  Every stage of the order lifecycle is persisted in PostgreSQL for traceability.

---

## Software Requirements

### Runtime Environment

* Node.js v18+
* TypeScript v5+
* PostgreSQL v14+
* Redis v7+

### Core Dependencies

* Fastify (API framework)
* BullMQ (queue and worker management)
* ioredis (Redis client)
* PostgreSQL client
* WebSocket (real-time communication)

### Development & Deployment Tools

* Docker (containerization)
* GitHub Actions (CI/CD pipeline)
* AWS EC2 (deployment environment)

---

## Architecture

An architecture diagram is available here:

* [https://drive.google.com/file/d/1PRVDmRd-ao8zCJUcGPGfVDVvrj4La_zZ/view](https://drive.google.com/file/d/1PRVDmRd-ao8zCJUcGPGfVDVvrj4La_zZ/view)

```mermaid
flowchart TD
    %% Entry
    A[Port 80] --> B["/api/orders/execute"]

    %% Validation
    B -->|Req| C{isOrderValid}
    C -->|Check pool id and token id| D[(Postgres)]
    D --> C

    C -->|Invalid (400)| E[Websocket Health]
    C -->|Valid| F[Publish to Queue]

    %% Queue + Worker
    F --> G[TRS Worker Start Execution]

    %% DEX Interaction
    G -->|Initial Price| H[Decentralised Exchange]
    H -->|Actual Price| G
    G -->|Intermediary Price| I[Websockets orders/all]
    G -->|Intermediary Price| J[Websocket orders/orderid]

    %% Status + Redis
    G --> K[(Redis)]
    K -->|Status Updates| G

    %% Audit + Completion
    G -->|Audit Event| L[Audit Worker]
    L -->|Writing Audit Logs| D

    G --> M[Worker End Execution]

```


At a high level:

* API requests enqueue jobs
* BullMQ workers process orders asynchronously
* Redis handles pub/sub and short-lived state
* PostgreSQL stores the source of truth
* WebSockets stream updates to clients

---

## Key Challenges and Solutions

### 1. Accurate Slippage Calculation

**Problem**
Crypto prices change every second, while execution takes 2–3 seconds. Slippage must reflect the actual execution window, not just the request time.

**Solution**
Implemented three-point price tracking:

* Capture **P_initial** when the order enters the queue
* Capture **P_intermediate** during routing (worker-level validation)
* Capture **P_actual** at execution (router-level validation)

This ensures slippage is validated both before and during execution.

---

### 2. API Rate Limiting

**Problem**
External APIs (Raydium/Jupiter) enforce rate limits, with safe refresh intervals around 5 seconds, while crypto prices fluctuate at 1-second intervals.

**Solution**

* Replaced live API dependency with a mock DEX simulation
* Modeled realistic price movement using liquidity curves and volume impact
* Removed rate-limit bottlenecks entirely

---

### 3. Distributed State Management

**Problem**
Multiple workers processing orders concurrently require consistent state and coordination.

**Solution**

* Redis Pub/Sub for real-time event broadcasting
* PostgreSQL as the persistent source of truth
* BullMQ for reliable queue processing with retries and backoff

---

### 4. Liquidity Pool Validation

**Problem**
Preventing trades on invalid or inactive token pairs without slowing down execution.

**Solution**

* Pre-seeded token registry with mint addresses
* Liquidity pool table with `is_active` flags
* Indexed lookups for sub-millisecond validation

---

## System Limitations

* **Fixed Token Registry**
  Only pre-seeded tokens and pools are supported. Unknown pairs are rejected.

* **In-Memory Liquidity Simulation**
  Price impact is calculated using fixed constants instead of a live order book.

* **Redis Volatility**
  Redis uses a 1-hour TTL. If Redis restarts, cached order status is lost and clients must fall back to PostgreSQL.

* **Local Secret Management**
  Secrets are stored in `.env` files, suitable for development but not production-grade security.

* **Single Worker Bottleneck**
  Although BullMQ supports scaling, the current setup runs a single Node.js worker process.

---

## Future Improvements

* **Advanced Order Types**
  Add limit orders and stop-loss logic using a dedicated price-watcher service.

* **Dynamic Route Discovery**
  Integrate Jupiter Aggregator or Raydium SDK for real-time route optimization.

* **Real-Time Audit Dashboard**
  Build a React + Tailwind UI that consumes WebSocket firehose events for live monitoring.

* **Transaction Batching**
  Implement Jito-style bundles for fee optimization and better inclusion during congestion.

---

## Order Execution Flow

1. User calls `/api/orders/execute`
2. System returns an `orderId`
3. User polls `/api/orders/status/:orderId` or subscribes to WebSockets
4. Order lifecycle updates stream via:

   * `ws/orders/all`
   * `ws/orders/:orderId`

---

## Deployment Flow

1. Developer pushes code to GitHub
2. GitHub Actions builds Docker image
3. Image is pushed to GitHub Container Registry
4. EC2 instance pulls the image
5. `docker-compose up` deploys the application

```
curl --location 'http://13.53.197.50/api/orders/execute' \
--header 'Content-Type: application/json' \
--data '{
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amount": 0.5,
  "userId": "central_test_01",
  "slippageBps": 50
}'
```
---

## Key Learnings

* Slippage is non-linear and follows liquidity curves, not straight lines
* Slippage must be validated at multiple execution stages
* External APIs are unsuitable for sub-second trading simulations
* Redis is excellent for coordination, not price storage
* Queue-based execution closely mirrors real trading infrastructure

---

## Database Design (Schema: `trading`)

* **users**: `id`, `created_at`
* **orders**: `id`, `user_id`, `created_at`
* **order_assets**: `order_id`, `token_in`, `token_out`, `amount_in`, `amount_out`, `slippage_bps`, `created_at`
* **order_events**: `id`, `order_id`, `state`, `details`, `event_time`
* **tokens**: `token_id`, `symbol`, `mint_address`, `decimals`, `token_name`, `created_at`
* **pools**: `pool_id`, `token_in_id`, `token_out_id`, `exchange_name`, `pool_address`, `is_active`

All frequently queried columns are indexed for performance.

---

## Technology Stack Summary

* Order Type: Market orders
* Execution: Mock DEX
* Routing: Raydium vs Meteora (mocked)
* Queue: BullMQ + Redis
* Real-Time Updates: WebSockets + Redis Pub/Sub
* API: Fastify + TypeScript
* Database: PostgreSQL
* Workers: BullMQ workers

---

This project demonstrates how real-world trading systems handle uncertainty, latency, and coordination while remaining observable, auditable, and scalable.
