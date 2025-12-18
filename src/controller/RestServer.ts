import Fastify from 'fastify';
import websocket from '@fastify/websocket'; // Add this import
import { OrderController } from './OrderExEngineController';

const app = Fastify({
  logger: true,
});

const start = async () => {
  try {
    // 1. Register WebSocket plugin once at the root
    await app.register(websocket);
    console.log('✅ WebSocket plugin registered');

    // 2. Register your controller (Make sure to remove websocket registration inside here!)
    await app.register(OrderController);
    
    const address = await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log(`🚀 Server running at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();