import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initBoard } from './init-board.js';
import { createTask, getTask } from './task-crud.js';
import { setTodoDone, toggleTodo, appendTodo } from './todo.js';

const TODO_MD = `# 延后事项

- [ ] 01 支持导出 PDF
- [ ] 02 补充单元测试
- [x] 03 优化首屏速度
`;

describe('todo', () => {
  let tmp: string;
  let taskId: string;
  let taskPath: string;
  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'kb-'));
    await initBoard(tmp);
    const t = await createTask(tmp, 'T');
    taskId = t.id;
    taskPath = t.path;
    writeFileSync(join(taskPath, 'todo.md'), TODO_MD);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('setTodoDone 按 2 位编号定位，把未完成改为完成', async () => {
    await setTodoDone(tmp, taskId, '02', true);
    const md = readFileSync(join(taskPath, 'todo.md'), 'utf8');
    expect(md).toContain('- [x] 02 补充单元测试');
    // 其他行不受影响
    expect(md).toContain('- [ ] 01 支持导出 PDF');
    expect(md).toContain('- [x] 03 优化首屏速度');
  });

  it('setTodoDone 取消勾选（幂等方向明确）', async () => {
    await setTodoDone(tmp, taskId, '03', false);
    const md = readFileSync(join(taskPath, 'todo.md'), 'utf8');
    expect(md).toContain('- [ ] 03 优化首屏速度');
  });

  it('对已完成事项重复勾选仍是 [x]（幂等）', async () => {
    await setTodoDone(tmp, taskId, '03', true);
    const md = readFileSync(join(taskPath, 'todo.md'), 'utf8');
    expect(md).toContain('- [x] 03 优化首屏速度');
  });

  it('toggleTodo 翻转勾选状态', async () => {
    await toggleTodo(tmp, taskId, '01');
    expect(readFileSync(join(taskPath, 'todo.md'), 'utf8')).toContain('- [x] 01 支持导出 PDF');
    await toggleTodo(tmp, taskId, '01');
    expect(readFileSync(join(taskPath, 'todo.md'), 'utf8')).toContain('- [ ] 01 支持导出 PDF');
  });

  it('编号不存在时报错并列出现有编号', async () => {
    await expect(setTodoDone(tmp, taskId, '09', true)).rejects.toThrow(/09 不存在.*01\/02\/03/);
  });

  it('位置序号兜底定位（无编号格式）', async () => {
    writeFileSync(join(taskPath, 'todo.md'), '- [ ] 无编号甲\n- [ ] 无编号乙\n');
    await setTodoDone(tmp, taskId, '2', true);
    expect(readFileSync(join(taskPath, 'todo.md'), 'utf8')).toContain('- [x] 无编号乙');
  });

  it('无 todo.md 时报错提示', async () => {
    rmSync(join(taskPath, 'todo.md'));
    await expect(setTodoDone(tmp, taskId, '01', true)).rejects.toThrow('无 todo.md');
  });

  it('getTask 聚合 todos：有文件解析、无文件为空数组', async () => {
    const withTodo = getTask(tmp, taskId)!;
    expect(withTodo.todos).toHaveLength(3);
    expect(withTodo.todos[0]).toMatchObject({ no: '01', done: false, text: '支持导出 PDF' });

    rmSync(join(taskPath, 'todo.md'));
    const withoutTodo = getTask(tmp, taskId)!;
    expect(withoutTodo.todos).toEqual([]);
  });

  it('appendTodo 追加到现有文件末尾，编号 = 最大 +1，不动已有行', async () => {
    const no = await appendTodo(tmp, taskId, '新增事项', '第一行说明\n第二行说明');
    expect(no).toBe('04');
    const md = readFileSync(join(taskPath, 'todo.md'), 'utf8');
    expect(md).toContain('- [x] 03 优化首屏速度'); // 原有行原样
    expect(md.endsWith('- [ ] 04 新增事项\n  第一行说明\n  第二行说明\n')).toBe(true);
    // 解析回读：新事项计入且内容行不算事项
    expect(getTask(tmp, taskId)!.todos).toHaveLength(4);
  });

  it('appendTodo 文件不存在时新建带 H1 骨架', async () => {
    rmSync(join(taskPath, 'todo.md'));
    const no = await appendTodo(tmp, taskId, '第一条');
    expect(no).toBe('01');
    const md = readFileSync(join(taskPath, 'todo.md'), 'utf8');
    expect(md).toBe('# 延后事项\n\n- [ ] 01 第一条\n');
  });

  it('appendTodo 标题换行替换为空格；内容里的 checkbox 行被转义', async () => {
    await appendTodo(tmp, taskId, '带\n换行', '- [ ] 伪事项');
    const md = readFileSync(join(taskPath, 'todo.md'), 'utf8');
    expect(md).toContain('- [ ] 04 带 换行');
    expect(md).toContain('  \\- [ ] 伪事项');
    expect(getTask(tmp, taskId)!.todos).toHaveLength(4); // 伪事项未被解析
  });

  it('appendTodo 空标题报错', async () => {
    await expect(appendTodo(tmp, taskId, '  ')).rejects.toThrow('标题不能为空');
  });
});
