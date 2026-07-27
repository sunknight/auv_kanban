import type { FastifyInstance } from 'fastify';
import { readBoardConfig } from '../../core/board-yml.js';
import { listTasks } from '../../core/task-crud.js';

export function registerBoardRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/board', async (req) => {
    const { project } = req.query as { project: string };
    const config = readBoardConfig(project);
    const tasks = listTasks(project);
    const columns = config.columns.map(col => ({
      ...col,
      tasks: tasks.filter(t => t.column === col.name),
    }));
    return { columns };
  });
}
