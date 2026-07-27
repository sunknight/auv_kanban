import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Fastify from 'fastify';
import { registerRoutes } from './index.js';
import { WatchManager } from '../watch-manager.js';
import { addProject } from '../../core/projects.js';
import { initBoard } from '../../core/init-board.js';

/**
 * 安全守卫测试（修复 F2）：请求里的 `project` 字段必须 ∈ 已注册项目，
 * 否则任意目录可被当作看板根读写。这里覆盖三条路径：
 * ①已注册 project → 放行；②未注册 project → 403；③无 project 字段的路由不受影响。
 *
 * 复用 projects.test.ts 的 HOME 隔离 + fake io 套路（listProjects 读 ~/.kanban/config.json）。
 */
function makeFakeIo() {
  const io = {
    to(_room: string) {
      return { emit(_event: string, _payload?: unknown) { /* no-op */ } };
    },
  };
  return { io };
}

describe('project 安全守卫（修复 F2）', () => {
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
    // 把 projectDir 注册进全局 config，并初始化看板骨架，使其成为合法项目
    addProject(projectDir);
    await initBoard(projectDir);
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env.HOME = origHome;
    rmSync(tmpHome, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(rogueDir, { recursive: true, force: true });
  });

  it('已注册的 project 放行（GET /api/board?project=...）', async () => {
    const fake = makeFakeIo();
    const watchManager = new WatchManager(fake.io as any);
    const app = Fastify();
    await registerRoutes(app, { watchManager });

    const res = await app.inject({
      method: 'GET',
      url: `/api/board?project=${encodeURIComponent(projectDir)}`,
    });
    expect(res.statusCode).toBe(200);

    await app.close();
    watchManager.stopAll();
  });

  it('未注册的 project 返回 403，不触碰其文件系统', async () => {
    const fake = makeFakeIo();
    const watchManager = new WatchManager(fake.io as any);
    const app = Fastify();
    await registerRoutes(app, { watchManager });

    // 试图用未注册目录作为 project 创建任务（这是 F2 的核心利用面）
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { project: rogueDir, name: 'evil' },
    });
    expect(res.statusCode).toBe(403);
    // rogueDir 下不应被创建任何 .kanban 结构
    expect(existsSync(join(rogueDir, '.kanban'))).toBe(false);

    await app.close();
    watchManager.stopAll();
  });

  it('无 project 字段的路由不受影响（POST /api/projects 用 path 字段）', async () => {
    const fake = makeFakeIo();
    const watchManager = new WatchManager(fake.io as any);
    const app = Fastify();
    await registerRoutes(app, { watchManager });

    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
    });
    expect(res.statusCode).toBe(200);

    await app.close();
    watchManager.stopAll();
  });
});
