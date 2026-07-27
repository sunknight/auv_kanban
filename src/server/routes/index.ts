import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { listProjects } from '../../core/projects.js';
import { registerProjectRoutes } from './projects.js';
import { registerBoardRoutes } from './board.js';
import { registerTaskRoutes } from './tasks.js';

export async function registerRoutes(fastify: FastifyInstance, opts: { watchManager: any }): Promise<void> {
  // 安全守卫（修复 F2）：请求里的 `project` 字段被直接当作文件系统路径用，
  // 必须校验它是已注册项目，否则可经 `POST /api/tasks {project:'/etc'}` 之类
  // 在任意目录创建/读取 .kanban 结构。/api/projects 系列用 `path` 字段，不受影响。
  fastify.addHook('preHandler', async (req, reply) => {
    const raw =
      (req.body as { project?: unknown } | undefined)?.project ??
      (req.query as { project?: unknown } | undefined)?.project;
    if (typeof raw !== 'string' || raw.trim() === '') return; // 无 project 字段的路由放行
    const abs = resolve(raw);
    const registered = listProjects().some(p => p.path === abs);
    if (!registered) {
      reply.code(403);
      return reply.send({ error: '未注册的项目' });
    }
  });

  registerProjectRoutes(fastify, opts.watchManager);
  registerBoardRoutes(fastify);
  registerTaskRoutes(fastify);
}
