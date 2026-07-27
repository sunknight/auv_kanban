import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
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
});
