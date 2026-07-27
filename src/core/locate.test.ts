import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { locateById, locateAll } from './locate.js';
import { writeBoardConfig } from './board-yml.js';

function buildFixture(tmp: string) {
  // 实体建在 .kanban/tasks/（新模型：实体统一目录）
  mkdirSync(join(tmp, '.kanban', 'tasks'), { recursive: true });
  for (const dir of ['0001-任务A', '0002-任务B', '0003-任务C']) {
    mkdirSync(join(tmp, '.kanban', 'tasks', dir), { recursive: true });
    // 写 main.md 的 H1（显示名来自 H1）
    const name = dir.slice(5);
    writeFileSync(join(tmp, '.kanban', 'tasks', dir, 'main.md'), `# ${name}\n\n## 描述\n\n## 提示词\n\n## 子任务\n`);
  }
  // board.yml.order 记录归属（归属的唯一来源）
  writeBoardConfig(tmp, {
    'next-id': 4,
    columns: [
      { name: 'backlog', display: '待办' },
      { name: 'ready', display: '允许执行' },
    ],
    order: { backlog: ['0001', '0002'], ready: ['0003'] },
    tasks: {},
  });
}

describe('locate', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'kb-'));
    buildFixture(tmp);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('locateById 在 backlog 栏找到任务', () => {
    const r = locateById(tmp, '0002');
    expect(r).not.toBeNull();
    expect(r!.column).toBe('backlog');
    expect(r!.dirName).toBe('0002-任务B');
  });

  it('locateById 在 ready 栏找到任务', () => {
    const r = locateById(tmp, '0003');
    expect(r!.column).toBe('ready');
  });

  it('locateById 改 order 归属后重新定位到新栏（实体不动）', () => {
    const before = locateById(tmp, '0002')!;
    const entityPath = before.path;
    expect(entityPath).toContain(join('.kanban', 'tasks')); // 实体在 tasks/
    // 改 order：0002 从 backlog 移到 ready
    writeBoardConfig(tmp, {
      'next-id': 4,
      columns: [
        { name: 'backlog', display: '待办' },
        { name: 'ready', display: '允许执行' },
      ],
      order: { backlog: ['0001'], ready: ['0003', '0002'] },
      tasks: {},
    });
    const after = locateById(tmp, '0002')!;
    expect(after.column).toBe('ready');
    expect(after.path).toBe(entityPath); // 实体路径不变
  });

  it('locateById 找不到返回 null', () => {
    expect(locateById(tmp, '9999')).toBeNull();
  });

  it('locateAll 列出所有任务', () => {
    const all = locateAll(tmp);
    expect(all).toHaveLength(3);
    expect(all.map(t => t.id).sort()).toEqual(['0001', '0002', '0003']);
  });

  it('locateById 孤儿任务（实体在但不在 order）临时归 backlog', () => {
    // 0001 从 order 移除，但实体保留 → 应被当作孤儿归 backlog
    writeBoardConfig(tmp, {
      'next-id': 4,
      columns: [
        { name: 'backlog', display: '待办' },
        { name: 'ready', display: '允许执行' },
      ],
      order: { backlog: ['0002'], ready: ['0003'] },
      tasks: {},
    });
    const r = locateById(tmp, '0001');
    expect(r).not.toBeNull();
    expect(r!.column).toBe('backlog'); // 孤儿兜底
  });
});
