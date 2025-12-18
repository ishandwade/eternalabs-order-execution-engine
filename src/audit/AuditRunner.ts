import { auditWorker } from './AuditWorker';

console.log('--- Audit Service Initializing ---');

auditWorker.on('ready', () => {
  console.log('✅ Audit Worker is connected and listening for events...');
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down Audit Worker...');
  await auditWorker.close();
  process.exit(0);
});