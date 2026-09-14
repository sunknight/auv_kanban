import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initBoard } from './init-board.js';
import { createTask, getTask, listTasks, deleteTask, updateTaskMeta, collectPeople } from './task-crud.js';
import { moveTask } from './move.js';

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

  it('updateTaskMeta 设置后 getTask 返回三项元数据', async () => {
    const t = await createTask(tmp, 'a');
    const updated = await updateTaskMeta(tmp, t.id, { due: '2026-09-20', people: ['张三', '李四'], type: '开发' });
    expect(updated.due).toBe('2026-09-20');
    expect(updated.people).toEqual(['张三', '李四']);
    expect(updated.type).toBe('开发');
    const read = getTask(tmp, t.id)!;
    expect(read.due).toBe('2026-09-20');
    expect(read.people).toEqual(['张三', '李四']);
    expect(read.type).toBe('开发');
  });

  it('updateTaskMeta 局部更新：undefined 不动原值', async () => {
    const t = await createTask(tmp, 'a');
    await updateTaskMeta(tmp, t.id, { due: '2026-09-20', type: '事务' });
    await updateTaskMeta(tmp, t.id, { people: ['王五'] });
    const read = getTask(tmp, t.id)!;
    expect(read.due).toBe('2026-09-20'); // 未提供的字段保持
    expect(read.type).toBe('事务');
    expect(read.people).toEqual(['王五']);
  });

  it('updateTaskMeta 清空语义：空串/空数组删除字段', async () => {
    const t = await createTask(tmp, 'a');
    await updateTaskMeta(tmp, t.id, { due: '2026-09-20', people: ['张三'], type: '开发' });
    await updateTaskMeta(tmp, t.id, { due: '', people: [], type: '' });
    const read = getTask(tmp, t.id)!;
    expect(read.due).toBeUndefined();
    expect(read.people).toBeUndefined();
    expect(read.type).toBeUndefined();
  });

  it('updateTaskMeta 对 people 去重去空白', async () => {
    const t = await createTask(tmp, 'a');
    const updated = await updateTaskMeta(tmp, t.id, { people: [' 张三 ', '张三', ''] });
    expect(updated.people).toEqual(['张三']);
  });

  it('move 等读改写回后元数据不丢（归一化保留验证）', async () => {
    const t = await createTask(tmp, 'a');
    await updateTaskMeta(tmp, t.id, { due: '2026-09-20', people: ['张三'], type: '提醒' });
    await moveTask(tmp, t.id, 'ready');
    const read = getTask(tmp, t.id)!;
    expect(read.column).toBe('ready');
    expect(read.due).toBe('2026-09-20');
    expect(read.people).toEqual(['张三']);
    expect(read.type).toBe('提醒');
  });

  it('collectPeople 汇总全项目相关人，去重按首现排序', async () => {
    const t1 = await createTask(tmp, 'a');
    const t2 = await createTask(tmp, 'b');
    await updateTaskMeta(tmp, t1.id, { people: ['张三', '李四'] });
    await updateTaskMeta(tmp, t2.id, { people: ['王五', '张三'] });
    expect(collectPeople(tmp)).toEqual(['张三', '李四', '王五']);
  });

  it('deleteTask 后其相关人退出候选池', async () => {
    const t1 = await createTask(tmp, 'a');
    await updateTaskMeta(tmp, t1.id, { people: ['张三'] });
    await deleteTask(tmp, t1.id);
    expect(collectPeople(tmp)).toEqual([]);
  });
});
