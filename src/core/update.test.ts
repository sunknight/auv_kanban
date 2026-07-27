import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendSubtask, nextSubtaskNo } from './update.js';
import { archiveTask } from './archive.js';
import { parseMainMd } from './main-md.js';
import { writeBoardConfig } from './board-yml.js';
import { rebuildAllSymlinks } from './sync.js';

function buildFixture(tmp: string) {
  mkdirSync(join(tmp, '.kanban', 'tasks'), { recursive: true });
  for (const dir of ['0001-任务A', '0002-任务B']) {
    mkdirSync(join(tmp, '.kanban', 'tasks', dir), { recursive: true });
    writeFileSync(
      join(tmp, '.kanban', 'tasks', dir, 'main.md'),
      `# ${dir.slice(5)}\n\n## 描述\n原始需求\n\n## 提示词\n\n## 子任务\n- [x] 01 已完成的拆解\n`,
    );
  }
  writeBoardConfig(tmp, {
    'next-id': 3,
    columns: [
      { name: 'backlog', display: '待办' },
      { name: 'done', display: '完成' },
    ],
    order: { backlog: ['0001'], done: ['0002'] },
    tasks: {
      '0001': { created: '2026-07-26T00:00:00.000Z' },
      '0002': { created: '2026-07-26T00:00:00.000Z' },
    },
  });
  rebuildAllSymlinks(tmp);
}

function readMain(tmp: string, dir: string) {
  return parseMainMd(readFileSync(join(tmp, '.kanban', 'tasks', dir, 'main.md'), 'utf8'));
}

describe('update nextSubtaskNo', () => {
  it('空列表从 01 开始', () => {
    expect(nextSubtaskNo([])).toBe('01');
  });
  it('取现有最大编号 +1', () => {
    expect(nextSubtaskNo(['01', '02', '04'])).toBe('05');
  });
  it('忽略无编号项（空字符串）', () => {
    expect(nextSubtaskNo(['', '01'])).toBe('02');
  });
});

describe('update appendSubtask', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'kb-update-'));
    buildFixture(tmp);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('追加一条 [补充] 子任务，编号递增', async () => {
    const no = await appendSubtask(tmp, '0001', '存档也要二次确认');
    expect(no).toBe('02'); // 已有 01，递增到 02
    const m = readMain(tmp, '0001-任务A');
    const appended = m.subtasks.find(s => s.no === '02');
    expect(appended).toMatchObject({ no: '02', done: false, tag: '补充', text: '存档也要二次确认' });
    // 已有子任务保留
    expect(m.subtasks[0]).toMatchObject({ no: '01', done: true, text: '已完成的拆解' });
  });

  it('连续追加多条，编号顺序递增不重复', async () => {
    await appendSubtask(tmp, '0001', '第一条补充');
    await appendSubtask(tmp, '0001', '第二条补充');
    const m = readMain(tmp, '0001-任务A');
    const nos = m.subtasks.map(s => s.no);
    expect(nos).toEqual(['01', '02', '03']);
  });

  it('tag 可自定义（传空字符串表示无标签）', async () => {
    const no = await appendSubtask(tmp, '0001', '普通追加', '');
    const m = readMain(tmp, '0001-任务A');
    const st = m.subtasks.find(s => s.no === no);
    expect(st?.tag).toBe('');
    expect(st?.text).toBe('普通追加');
  });

  it('不破坏人对 main.md 的格式编辑（行级追加）', async () => {
    const dir = join(tmp, '.kanban', 'tasks', '0001-任务A');
    writeFileSync(
      join(dir, 'main.md'),
      `# 任务A\n\n## 描述\n原始需求\n\n手编辑行\n\n## 提示词\n\n## 子任务\n- [x] 01 已完成\n`,
    );
    await appendSubtask(tmp, '0001', '新补充');
    const raw = readFileSync(join(dir, 'main.md'), 'utf8');
    expect(raw).toContain('手编辑行'); // 保留
    expect(raw).toContain('02 [补充] 新补充'); // 追加
  });

  it('空文本拒绝', async () => {
    await expect(appendSubtask(tmp, '0001', '   ')).rejects.toThrow(/不能为空/);
  });

  it('存档任务不可追加', async () => {
    await archiveTask(tmp, '0001');
    await expect(appendSubtask(tmp, '0001', '新补充')).rejects.toThrow(/不存在/);
  });
});
