import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, lstatSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { archiveTask } from './archive.js';
import { locateAll } from './locate.js';
import { rebuildAllSymlinks } from './sync.js';
import { writeBoardConfig, readBoardConfig } from './board-yml.js';
import { tasksDir, archiveDir, taskEntityPath, archivedEntityPath } from './paths.js';

function buildFixture(tmp: string) {
  mkdirSync(join(tmp, '.kanban', 'tasks'), { recursive: true });
  mkdirSync(join(tmp, '.kanban', 'backlog'), { recursive: true });
  for (const dir of ['0001-任务A', '0002-任务B']) {
    mkdirSync(join(tmp, '.kanban', 'tasks', dir), { recursive: true });
    writeFileSync(join(tmp, '.kanban', 'tasks', dir, 'main.md'), `# ${dir.slice(5)}\n\n## 描述\n\n## 提示词\n\n## 子任务\n`);
    writeFileSync(join(tmp, '.kanban', 'tasks', dir, 'design.md'), '设计文档内容');
  }
  writeBoardConfig(tmp, {
    'next-id': 3,
    columns: [
      { name: 'backlog', display: '待办' },
      { name: 'done', display: '完成' },
    ],
    order: { backlog: ['0001', '0002'], done: [] },
    tasks: { '0001': { created: '2026-07-26T00:00:00.000Z' }, '0002': { created: '2026-07-26T00:00:00.000Z' } },
  });
}

describe('archive', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'kb-archive-'));
    buildFixture(tmp);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('archiveTask 把实体从 tasks/ 移到 archive/', async () => {
    await archiveTask(tmp, '0001');
    // tasks/ 不再有 0001
    expect(existsSync(taskEntityPath(tmp, '0001-任务A'))).toBe(false);
    // archive/ 有 0001，且文档完整保留
    const archived = archivedEntityPath(tmp, '0001-任务A');
    expect(existsSync(archived)).toBe(true);
    expect(existsSync(join(archived, 'main.md'))).toBe(true);
    expect(existsSync(join(archived, 'design.md'))).toBe(true);
  });

  it('archiveTask 从 board.yml 的 order/tasks 清理，ID 不回收', async () => {
    await archiveTask(tmp, '0001');
    // locateAll 不再列出 0001
    const all = locateAll(tmp);
    expect(all.map(t => t.id)).toEqual(['0002']);
    // next-id 不变（ID 不回收），tasks 元数据已清
    const cfg = readBoardConfig(tmp);
    expect(cfg['next-id']).toBe(3);
    expect(cfg.tasks?.['0001']).toBeUndefined();
  });

  it('archiveTask 任务不存在抛错', async () => {
    await expect(archiveTask(tmp, '9999')).rejects.toThrow(/不存在/);
  });

  it('存档后 rebuildAllSymlinks 不会把存档任务当孤儿复活', async () => {
    await archiveTask(tmp, '0001');
    // 实体已在 archive/，sync 只扫 tasks/，不会看到 0001，不会当孤儿
    const { changed } = rebuildAllSymlinks(tmp);
    // changed 反映 board.yml 是否被修正；存档任务不应触发孤儿修复
    const all = locateAll(tmp);
    expect(all.map(t => t.id)).toEqual(['0002']);
  });
});
