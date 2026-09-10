import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Fastify from 'fastify';
import { registerRoutes } from './index.js';
import { WatchManager } from '../watch-manager.js';
import { addProject } from '../../core/projects.js';
import { initBoard } from '../../core/init-board.js';
import { createTask } from '../../core/task-crud.js';

// ---- GET /api/search 路由 ----
// HOME 隔离 + fake io 套路同 project-guard.test.ts（listProjects 读 ~/.kanban/config.json）。
describe('GET /api/search', () => {
  let origHome: string | undefined;
  let tmpHome: string;
  let projectDir: string;
  let rogueDir: string;

  beforeEach(async () => {
    origHome = process.env.HOME;
    tmpHome = mkdtempSync(join(tmpdir(), 'kb-home-'));
    process.env.HOME = tmpHome;
    projectDir = mkdtempSync(join(tmpdir(), 'kb-proj-'));
    rogueDir = mkdtempSync(join(tmpdir(), 'kb-rogue-'));
    addProject(projectDir);
    await initBoard(projectDir);
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env.HOME = origHome;
    rmSync(tmpHome, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(rogueDir, { recursive: true, force: true });
  });

  async function buildApp() {
    const io = { to(_room: string) { return { emit(_e: string, _p?: unknown) { /* no-op */ } }; } };
    const watchManager = new WatchManager(io as any);
    const app = Fastify();
    await registerRoutes(app, { watchManager });
    return app;
  }

  it('返回命中任务的 id 数组（main.md 正文 + 任务文档正文）', async () => {
    const t1 = await createTask(projectDir, '修复分页');
    const t2 = await createTask(projectDir, '别的任务');
    writeFileSync(join(t1.path, 'main.md'), '# 修复分页\n\n## 描述\n\n\n## 提示词\n\n\n## 子任务\n');
    writeFileSync(join(t2.path, 'design.md'), '# 设计\n遗留分页性能问题\n');

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/search?project=${encodeURIComponent(projectDir)}&q=${encodeURIComponent('分页')}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ids: ['0001', '0002'] });
  });

  it('未注册项目 → 403', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/search?project=${encodeURIComponent(rogueDir)}&q=x`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('空白关键词 → 空 ids', async () => {
    await createTask(projectDir, '任意');
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/search?project=${encodeURIComponent(projectDir)}&q=%20%20`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ids: [] });
  });
});
