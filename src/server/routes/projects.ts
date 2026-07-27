import type { FastifyInstance } from 'fastify';
import { listProjects, addProject, removeProject, renameProject, reorderProjects, getLastProject, setLastProject } from '../../core/projects.js';
import { resolve } from 'path';
import type { WatchManager } from '../watch-manager.js';

export function registerProjectRoutes(fastify: FastifyInstance, watchManager: WatchManager): void {
  fastify.get('/api/projects', async () => ({
    projects: listProjects(),
    // 返回 lastProject，供前端刷新/重开时恢复上次打开的项目（0003）
    lastProject: getLastProject(),
  }));

  fastify.post('/api/projects', async (req) => {
    const { path } = req.body as { path: string };
    const abs = resolve(path);
    addProject(abs);
    // 联动监听：通过 Web UI 添加的项目也必须纳入 watcher，
    // 否则该项目的 .kanban 变更不会推送 board:changed，前端新建任务后看板不刷新（0002）。
    watchManager.start(abs);
    return { ok: true };
  });

  fastify.delete('/api/projects', async (req) => {
    const { path } = req.body as { path: string };
    const abs = resolve(path);
    removeProject(abs);
    // 移除监听，释放 chokidar 句柄，避免对已移除项目的空转监听。
    watchManager.stop(abs);
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

  // 项目列表重排序：body.paths 为期望的完整新顺序（绝对路径数组）
  fastify.post('/api/projects/reorder', async (req) => {
    const { paths } = req.body as { paths: string[] };
    reorderProjects(Array.isArray(paths) ? paths : []);
    return { ok: true };
  });

  // 记录最后打开的项目（0003）：用 `path` 字段（与 /api/projects 一致，不经 preHandler 校验），
  // setLastProject 内部会校验仍是已注册项目，未注册则忽略，避免脏值。
  fastify.post('/api/last-project', async (req) => {
    const { path } = req.body as { path: string };
    setLastProject(resolve(path));
    return { ok: true };
  });
}
