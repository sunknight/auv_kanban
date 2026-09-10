import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initBoard } from './init-board.js';
import { createTask } from './task-crud.js';
import { searchTasks } from './search.js';

describe('search', () => {
  let tmp: string;
  beforeEach(async () => { tmp = mkdtempSync(join(tmpdir(), 'kb-search-')); await initBoard(tmp); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('按任务标题命中（main.md H1）', async () => {
    await createTask(tmp, '实现分页');
    await createTask(tmp, '导出优化');
    expect(searchTasks(tmp, '分页')).toEqual(['0001']);
  });

  it('按描述 / 提示词 / 子任务文本命中（main.md 全文）', async () => {
    const t = await createTask(tmp, '普通任务');
    writeFileSync(join(t.path, 'main.md'),
      '# 普通任务\n\n## 描述\n用户点了记住我\n\n## 提示词\n参考 TokenRefresh 流程\n\n## 子任务\n- [ ] 补单元测试\n');
    expect(searchTasks(tmp, '记住我')).toEqual(['0001']);
    expect(searchTasks(tmp, 'TokenRefresh')).toEqual(['0001']);
    expect(searchTasks(tmp, '单元测试')).toEqual(['0001']);
  });

  it('按任务文档正文命中（含子目录递归）', async () => {
    const t = await createTask(tmp, '某任务');
    writeFileSync(join(t.path, 'design.md'), '# 设计\n瓶颈在图片体积\n');
    mkdirSync(join(t.path, 'assets', 'notes'), { recursive: true });
    writeFileSync(join(t.path, 'assets', 'notes', 'a.log'), 'memory leak at shutdown\n');
    expect(searchTasks(tmp, '图片体积')).toEqual(['0001']);
    expect(searchTasks(tmp, 'shutdown')).toEqual(['0001']);
  });

  it('不区分大小写；关键词前后空白忽略；空关键词返回空', async () => {
    const t = await createTask(tmp, 'Fix Login');
    writeFileSync(join(t.path, 'notes.md'), 'see AUTH flow\n');
    expect(searchTasks(tmp, 'fix login')).toEqual(['0001']);
    expect(searchTasks(tmp, 'auth')).toEqual(['0001']);
    expect(searchTasks(tmp, '  auth  ')).toEqual(['0001']);
    expect(searchTasks(tmp, '   ')).toEqual([]);
  });

  it('白名单外文件与软链内容不参与匹配', async () => {
    const t = await createTask(tmp, '任务A');
    await createTask(tmp, '任务B');
    const b = await createTask(tmp, '任务C');
    writeFileSync(join(t.path, 'blob.bin'), 'hidden-secret-keyword\n');      // 白名单外
    writeFileSync(join(b.path, 'real.md'), 'link-target-secret\n');
    symlinkSync(join(b.path, 'real.md'), join(t.path, 'alias.md'));          // 软链不跟随
    expect(searchTasks(tmp, 'secret')).toEqual(['0003']);                   // 只有 C 的实体文件命中
  });

  it('无命中返回空数组', async () => {
    await createTask(tmp, 'a');
    expect(searchTasks(tmp, '不存在的词')).toEqual([]);
  });
});
