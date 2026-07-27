import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initBoard } from './init-board.js';
import { createTask, getTask } from './task-crud.js';
import { toggleSubtask } from './check.js';

const MD = `# T

## 描述
d

## 提示词
p

## 子任务
- [ ] 01 第一
- [ ] 02 第二
- [ ] 03 第三
`;

describe('check', () => {
  let tmp: string;
  let taskId: string;
  let taskPath: string;
  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'kb-'));
    await initBoard(tmp);
    const t = await createTask(tmp, 'T');
    taskId = t.id;
    taskPath = t.path;
    writeFileSync(join(taskPath, 'main.md'), MD);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('toggleSubtask 按 2 位编号定位，把未完成改为完成', async () => {
    await toggleSubtask(tmp, taskId, '02');
    const md = readFileSync(join(taskPath, 'main.md'), 'utf8');
    expect(md).toContain('- [x] 02 第二');
    const t = getTask(tmp, taskId)!;
    expect(t.progress).toEqual([1, 3]);
  });

  it('toggleSubtask 再次调用取消勾选（toggle）', async () => {
    await toggleSubtask(tmp, taskId, '02');
    await toggleSubtask(tmp, taskId, '02');
    const md = readFileSync(join(taskPath, 'main.md'), 'utf8');
    expect(md).toContain('- [ ] 02 第二');
  });

  it('toggleSubtask 编号不存在报错', async () => {
    await expect(toggleSubtask(tmp, taskId, '99')).rejects.toThrow(/不存在/);
  });

  it('toggleSubtask 不影响其他行', async () => {
    await toggleSubtask(tmp, taskId, '02');
    const md = readFileSync(join(taskPath, 'main.md'), 'utf8');
    expect(md).toContain('- [ ] 01 第一');
    expect(md).toContain('- [ ] 03 第三');
    expect(md).toContain('# T');
    expect(md).toContain('## 描述');
  });

  it('toggleSubtask 兼容位置序号兜底（旧习惯 1/2/3）', async () => {
    // 传位置序号 2，应定位到第二项（02 第二）
    await toggleSubtask(tmp, taskId, 2);
    const md = readFileSync(join(taskPath, 'main.md'), 'utf8');
    expect(md).toContain('- [x] 02 第二');
  });
});
