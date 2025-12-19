import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import { connection } from '../queue/OrderQueue'; // Reusing shared Redis connection

const pgPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dexorderexecutionengine',
});

interface AuditJobData {
  orderId: string;
  state: string;
  details?: any;
}

/**
 * AuditWorker: Responsible for persisting order lifecycles and final results.
 * Separating this from the Execution Worker allows for high-throughput trading.
 */
export const auditWorker = new Worker(
  'audit-log',
  async (job: Job<AuditJobData>) => {
    const { orderId, state, details } = job.data;
    const client = await pgPool.connect();

   try {
  await client.query('BEGIN');

  // 1. Log to history
  await client.query(
    'INSERT INTO trading.order_events (order_id, state, details) VALUES ($1, $2, $3)',
    [orderId, state, details ? JSON.stringify(details) : null]
  );

  // 2. Update the main Order "State" (The column you should add)
  await client.query(
    'UPDATE trading.orders SET current_state = $1 WHERE id = $2',
    [state, orderId]
  );

  // 3. Update amount_out on success
  if (state === 'confirmed' && details?.receivedAmount) {
    await client.query(
      'UPDATE trading.order_assets SET amount_out = $1 WHERE order_id = $2',
      [details.receivedAmount, orderId]
    );
  }

  await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[AUDIT ERROR] Failed to log event for ${orderId}:`, error);
      throw error; // Let BullMQ handle the retry
    } finally {
      client.release();
    }
  },
  { 
    connection,
    concurrency: 5 // Adjust based on DB write capacity
  }
);

// Worker Lifecycle Events
auditWorker.on('completed', (job) => {
  console.log(`[AUDIT] Event '${job.data.state}' logged for order ${job.data.orderId}`);
});

auditWorker.on('failed', (job, err) => {
  console.error(`[AUDIT] Logging failed for job ${job?.id}:`, err.message);
});