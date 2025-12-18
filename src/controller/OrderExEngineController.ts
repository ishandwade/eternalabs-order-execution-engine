// order-controller.ts
import { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';

interface ExecuteOrderBody {
  tokenIn: string;
  tokenOut: string;
  amount: number;
}

//POST API to execute an order
export async function OrderController(app: FastifyInstance) {
  app.post('/orders/execute', async (request, reply) => {
    const body = request.body as ExecuteOrderBody;

    // Basic validation
    if (!body.tokenIn || !body.tokenOut || !body.amount) {
      return reply.status(400).send({
        error: 'tokenIn, tokenOut, and amount are required',
      });
    }

    // Mock Solana-style transaction hash
    const txHash = randomBytes(32).toString('hex');

    const response = {
      hash: txHash,
      status: 'submitted', 
      tokenIn: body.tokenIn,
      tokenOut: body.tokenOut,
      amount: body.amount,
      createdAt: Date.now(),
    };

    return reply.status(200).send(response);
  });

}
