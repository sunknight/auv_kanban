import type { FastifyInstance } from 'fastify';
import { registerProjectRoutes } from './projects.js';
import { registerBoardRoutes } from './board.js';
import { registerTaskRoutes } from './tasks.js';

export async function registerRoutes(fastify: FastifyInstance, opts: { watchManager: any }): Promise<void> {
  registerProjectRoutes(fastify);
  registerBoardRoutes(fastify);
  registerTaskRoutes(fastify);
}
