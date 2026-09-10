import type { FastifyInstance } from 'fastify';
import { searchTasks } from '../../core/search.js';

export function registerSearchRoutes(fastify: FastifyInstance): void {
  // 0002：全项目任务搜索。project 经 preHandler 守卫（须为已注册项目）；
  // 空白关键词返回空 ids（正常不会发生——前端空串不发起请求）。
  fastify.get('/api/search', async (req) => {
    const { project, q } = req.query as { project: string; q?: string };
    return { ids: searchTasks(project, q ?? '') };
  });
}
