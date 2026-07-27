import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Fastify from 'fastify';
import { registerRoutes } from './index.js';
import { WatchManager } from '../watch-manager.js';

/**
 * 录制式 fake io：WatchManager 只用到 io.to(room).emit(event, payload)。
 * 这里把 socket.io 当作外部协作者用测试替身接管，被测对象 WatchManager 与路由本身均为真实代码。
 */
function makeFakeIo() {
  const emits: { room: string; event: string }[] = [];
  const io = {
    to(room: string) {
      return {
        emit(event: string, _payload?: unknown) {
          emits.push({ room, event });
        },
      };
    },
  };
  return { emits, io };
}

describe('项目增删联动 WatchManager（修复 0002：新建任务不显示）', () => {
  let origHome: string | undefined;
  let tmpHome: string;
  let projectDir: string;

  beforeEach(() => {
    // 隔离 HOME，避免污染全局 ~/.kanban/config.json
    origHome = process.env.HOME;
    tmpHome = mkdtempSync(join(tmpdir(), 'kb-home-'));
    process.env.HOME = tmpHome;
    projectDir = mkdtempSync(join(tmpdir(), 'kb-proj-'));
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env.HOME = origHome;
    rmSync(tmpHome, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('POST /api/projects 添加项目后，WatchManager 开始监听该项目', async () => {
    const fake = makeFakeIo();
    const watchManager = new WatchManager(fake.io as any);
    const app = Fastify();
    await registerRoutes(app, { watchManager });

    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { path: projectDir },
    });
    expect(res.statusCode).toBe(200);
    // 关键断言：新增项目必须被监听，否则其 .kanban 变更不会推送 board:changed，
    // 前端新建任务后看板永远不刷新（0002 的根因）。
    expect(watchManager.isWatching(projectDir)).toBe(true);

    await app.close();
    watchManager.stopAll();
  });

  it('DELETE /api/projects 移除项目后，WatchManager 停止监听该项目', async () => {
    const fake = makeFakeIo();
    const watchManager = new WatchManager(fake.io as any);
    watchManager.start(projectDir); // 预先监听，模拟 server 启动时已纳入
    const app = Fastify();
    await registerRoutes(app, { watchManager });

    await app.inject({
      method: 'DELETE',
      url: '/api/projects',
      payload: { path: projectDir },
    });
    expect(watchManager.isWatching(projectDir)).toBe(false);

    await app.close();
    watchManager.stopAll();
  });
});
