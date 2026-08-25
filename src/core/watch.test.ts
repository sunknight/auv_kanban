import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initBoard } from './init-board.js';
import { watchBoard } from './watch.js';

describe('watch', () => {
  let tmp: string;
  beforeEach(async () => { tmp = mkdtempSync(join(tmpdir(), 'kb-')); await initBoard(tmp); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('watchBoard 检测到文件变化时触发回调', async () => {
    const events: string[] = [];
    const stop = watchBoard(tmp, () => events.push('change'));
    // 等待 watcher ready
    await new Promise(r => setTimeout(r, 300));
    mkdirSync(join(tmp, '.kanban', 'backlog', '0001-x'), { recursive: true });
    writeFileSync(join(tmp, '.kanban', 'backlog', '0001-x', 'main.md'), '# x');
    await new Promise(r => setTimeout(r, 500));
    stop();
    expect(events.length).toBeGreaterThan(0);
  });

  it('栏位软链布局（backlog/<任务> → ../tasks/<任务>）下仍能监视实体目录', async () => {
    const events: string[] = [];
    const stop = watchBoard(tmp, () => events.push('change'));
    await new Promise(r => setTimeout(r, 300));
    mkdirSync(join(tmp, '.kanban', 'tasks', '0001-x'), { recursive: true });
    symlinkSync('../tasks/0001-x', join(tmp, '.kanban', 'backlog', '0001-x'));
    writeFileSync(join(tmp, '.kanban', 'tasks', '0001-x', 'main.md'), '# x');
    await new Promise(r => setTimeout(r, 500));
    stop();
    expect(events.length).toBeGreaterThan(0);
  });

  it('任务目录里指向看板外的软链不被跟随：外部变化不触发、进程不崩、内部变化仍触发', async () => {
    const events: string[] = [];
    const outside = mkdtempSync(join(tmpdir(), 'kb-out-'));
    try {
      const taskDir = join(tmp, '.kanban', 'tasks', '0001-x');
      mkdirSync(taskDir, { recursive: true });
      symlinkSync(outside, join(taskDir, 'leak'));
      const stop = watchBoard(tmp, () => events.push('change'));
      // 多等一会让初始扫描的延迟 add（awaitWriteFinish 会把 ignoreInitial 的部分事件推迟）先冲完
      await new Promise(r => setTimeout(r, 800));
      events.length = 0;
      writeFileSync(join(outside, 'far.txt'), 'x');   // 看板外文件变化：不应触发
      await new Promise(r => setTimeout(r, 600));
      expect(events.length).toBe(0);
      writeFileSync(join(taskDir, 'main.md'), '# x'); // 看板内变化：应触发
      await new Promise(r => setTimeout(r, 600));
      stop();
      expect(events.length).toBeGreaterThan(0);
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });
});
