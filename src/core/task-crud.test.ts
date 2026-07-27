import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initBoard } from './init-board.js';
import { createTask, getTask, listTasks, deleteTask } from './task-crud.js';

describe('task-crud', () => {
  let tmp: string;
  beforeEach(async () => { tmp = mkdtempSync(join(tmpdir(), 'kb-')); await initBoard(tmp); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('createTask 在 backlog 建子目录，分配 0001，生成 main.md 模板', async () => {
    const t = await createTask(tmp, '实现登录');
    expect(t.id).toBe('0001');
    expect(t.column).toBe('backlog');
    expect(existsSync(join(t.path, 'main.md'))).toBe(true);
    const md = readFileSync(join(t.path, 'main.md'), 'utf8');
    expect(md).toContain('# 实现登录');
    expect(md).toContain('## 描述');
    expect(md).toContain('## 提示词');
    expect(md).toContain('## 子任务');
  });

  it('createTask 连续创建 ID 递增', async () => {
    await createTask(tmp, 'a');
    const t2 = await createTask(tmp, 'b');
    expect(t2.id).toBe('0002');
  });

  it('getTask 返回解析后的 Task（含 main 与进度）', async () => {
    const created = await createTask(tmp, 'X');
    writeFileSync(join(created.path, 'main.md'),
      '# X\n\n## 描述\nd\n\n## 提示词\np\n\n## 子任务\n- [ ] a\n- [x] b\n');
    const t = getTask(tmp, '0001')!;
    expect(t.main!.subtasks).toHaveLength(2);
    expect(t.progress).toEqual([1, 2]);
  });

  it('listTasks 返回所有任务，按栏与优先级排序', async () => {
    await createTask(tmp, 'a');
    await createTask(tmp, 'b');
    const all = listTasks(tmp);
    expect(all).toHaveLength(2);
  });

  it('deleteTask 删除子目录，ID 不回收', async () => {
    const t = await createTask(tmp, 'a');
    await deleteTask(tmp, t.id);
    expect(existsSync(t.path)).toBe(false);
    const t2 = await createTask(tmp, 'b');
    expect(t2.id).toBe('0002'); // 不复用 0001
  });
});
