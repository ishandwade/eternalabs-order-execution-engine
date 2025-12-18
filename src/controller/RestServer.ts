import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { OrderController } from './OrderExEngineController';

// Use environment variables provided by Docker Compose with defaults
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = process.env.HOST || '0.0.0.0'; 

const app = Fastify({
  logger: true,
});

const start = async () => {
  try {
    // 1. Register WebSocket plugin
    await app.register(websocket);
    console.log('✅ WebSocket plugin registered');

    // 2. Register Controller
    await app.register(OrderController);
    
    // 3. Explicitly pass port and host as an object
    // Fastify requires '0.0.0.0' to accept external Docker/EC2 traffic
    const address = await app.listen({ 
      port: PORT, 
      host: HOST 
    });

    console.log(`🚀 Engine API is live at ${address}`);
  } catch (err) {
    app.log.error('Failed to start API server:', err);
    process.exit(1);
  }
};

start();
