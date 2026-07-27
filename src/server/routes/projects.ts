import type { FastifyInstance } from 'fastify';
import { listProjects, addProject, removeProject, renameProject } from '../../core/projects.js';
import { resolve } from 'path';

export function registerProjectRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/projects', async () => ({ projects: listProjects() }));

  fastify.post('/api/projects', async (req) => {
    const { path } = req.body as { path: string };
    addProject(resolve(path));
    return { ok: true };
  });

  fastify.delete('/api/projects', async (req) => {
    const { path } = req.body as { path: string };
    removeProject(resolve(path));
    return { ok: true };
  });

  // 修改项目显示名（只改 config.json 的 name，不动磁盘）
  fastify.patch('/api/projects', async (req, reply) => {
    const { path, name } = req.body as { path: string; name: string };
    try {
      renameProject(resolve(path), name);
      return { ok: true };
    } catch (e) {
      reply.code(400);
      return { ok: false, error: (e as Error).message };
    }
  });
}
