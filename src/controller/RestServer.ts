// src/index.ts
import Fastify from 'fastify';
import { OrderController } from './OrderExEngineController';

const app = Fastify({
  logger: true, // logs requests to console
});

// Register your controller
OrderController(app);

// Start server
const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('🚀 Server running at http://localhost:3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();