import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Fastify from 'fastify';
import { sortDocs, DOC_ORDER } from './tasks.js';
import { registerRoutes } from './index.js';
import { WatchManager } from '../watch-manager.js';
import { addProject } from '../../core/projects.js';
import { initBoard } from '../../core/init-board.js';

describe('sortDocs', () => {
  it('按语义优先级排序：main > todo > logs > design > plan > readme > notes', () => {
    const docs = [
      { name: 'notes.md' },
      { name: 'design.md' },
      { name: 'logs.md' },
      { name: 'plan.md' },
      { name: 'readme.md' },
      { name: 'main.md' },
      { name: 'todo.md' },
    ];
    const sorted = sortDocs(docs).map(d => d.name);
    expect(sorted).toEqual(['main.md', 'todo.md', 'logs.md', 'design.md', 'plan.md', 'readme.md', 'notes.md']);
  });

  it('未列入 DOC_ORDER 的文档按字母序补在末尾', () => {
    const docs = [
      { name: 'zzz.md' },
      { name: 'design.md' },
      { name: 'aaa.md' },
      { name: 'logs.md' },
    ];
    const sorted = sortDocs(docs).map(d => d.name);
    // 语义优先的在前，其余按字母序
    expect(sorted).toEqual(['logs.md', 'design.md', 'aaa.md', 'zzz.md']);
  });

  it('相同优先级（如多个未列出文档）之间按字母序', () => {
    const docs = [{ name: 'b.md' }, { name: 'a.md' }, { name: 'c.md' }];
    const sorted = sortDocs(docs).map(d => d.name);
    expect(sorted).toEqual(['a.md', 'b.md', 'c.md']);
  });

  it('空数组返回空数组', () => {
    expect(sortDocs([])).toEqual([]);
  });

  it('单个文档保持不变', () => {
    expect(sortDocs([{ name: 'logs.md' }])).toEqual([{ name: 'logs.md' }]);
  });

  it('DOC_ORDER 符合约定顺序', () => {
    expect(DOC_ORDER).toEqual(['main.md', 'todo.md', 'logs.md', 'design.md', 'plan.md', 'readme.md', 'notes.md', 'files.md']);
  });

  it('不修改原数组（返回新数组）', () => {
    const docs = [{ name: 'notes.md' }, { name: 'logs.md' }];
    const snapshot = docs.map(d => ({ ...d }));
    sortDocs(docs);
    expect(docs).toEqual(snapshot);
  });
});

// ---- POST /api/tasks/:id/open-dir 路由 ----
// 只覆盖不触发真实 spawn 的分支：404（任务不存在）与 403（未注册项目，preHandler 守卫）。
// 命令映射与 spawn 行为由 src/server/open-dir.test.ts 用注入 fake 覆盖；
// 真实打开 Finder 的成功路径走人工验收（macOS 实机）。
// HOME 隔离 + fake io 套路同 project-guard.test.ts（listProjects 读 ~/.kanban/config.json）。
describe('POST /api/tasks/:id/open-dir', () => {
  let origHome: string | undefined;
  let tmpHome: string;
  let projectDir: string;
  let rogueDir: string;

  beforeEach(async () => {
    origHome = process.env.HOME;
    tmpHome = mkdtempSync(join(tmpdir(), 'kb-home-'));
    process.env.HOME = tmpHome;
    projectDir = mkdtempSync(join(tmpdir(), 'kb-proj-'));
    rogueDir = mkdtempSync(join(tmpdir(), 'kb-rogue-'));
    addProject(projectDir);
    await initBoard(projectDir);
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env.HOME = origHome;
    rmSync(tmpHome, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(rogueDir, { recursive: true, force: true });
  });

  async function buildApp() {
    const io = { to(_room: string) { return { emit(_e: string, _p?: unknown) { /* no-op */ } }; } };
    const watchManager = new WatchManager(io as any);
    const app = Fastify();
    await registerRoutes(app, { watchManager });
    return { app, watchManager };
  }

  it('任务不存在 → 404（不触发 spawn）', async () => {
    const { app, watchManager } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks/9999/open-dir',
      payload: { project: projectDir },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('任务不存在');

    await app.close();
    watchManager.stopAll();
  });

  it('未注册项目 → 403（preHandler 守卫，不触碰文件系统）', async () => {
    const { app, watchManager } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks/0001/open-dir',
      payload: { project: rogueDir },
    });
    expect(res.statusCode).toBe(403);

    await app.close();
    watchManager.stopAll();
  });
});

// ---- GET /api/tasks/:id/docs：files.md 目录清单按需生成 ----
// HOME 隔离 + fake io 套路同 open-dir 测试块；任务经 API 创建后在实体目录落文件再拉 docs。
describe('GET /api/tasks/:id/docs（files.md 目录清单）', () => {
  let origHome: string | undefined;
  let tmpHome: string;
  let projectDir: string;

  beforeEach(async () => {
    origHome = process.env.HOME;
    tmpHome = mkdtempSync(join(tmpdir(), 'kb-home-'));
    process.env.HOME = tmpHome;
    projectDir = mkdtempSync(join(tmpdir(), 'kb-proj-'));
    addProject(projectDir);
    await initBoard(projectDir);
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env.HOME = origHome;
    rmSync(tmpHome, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  async function buildApp() {
    const io = { to(_room: string) { return { emit(_e: string, _p?: unknown) { /* no-op */ } }; } };
    const watchManager = new WatchManager(io as any);
    const app = Fastify();
    await registerRoutes(app, { watchManager });
    return { app, watchManager };
  }

  /** 建任务并往实体目录落若干文件，返回 app / 任务 id / 实体目录路径 */
  async function newTaskWithFiles(files: Record<string, string>) {
    const { app, watchManager } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { project: projectDir, name: '清单任务' },
    });
    const task = res.json();
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(task.path, name), content, 'utf8');
    }
    return { app, watchManager, id: task.id, dir: task.path };
  }

  async function getDocs(app: ReturnType<typeof Fastify>, id: string) {
    return app.inject({
      method: 'GET',
      url: `/api/tasks/${id}/docs?project=${encodeURIComponent(projectDir)}`,
    });
  }

  it('目录含白名单外文件 → 生成 files.md 并随本次 docs 返回', async () => {
    const { app, watchManager, id, dir } = await newTaskWithFiles({ 'report.html': '<h1>hi</h1>' });
    const res = await getDocs(app, id);
    const listing = readFileSync(join(dir, 'files.md'), 'utf8');
    expect(listing).toContain('```'); // tree 块在代码围栏内，markdown 渲染换行不丢
    expect(listing).toContain('├── main.md');
    expect(listing).toContain('└── report.html');
    const docs = res.json().docs.map((d: { name: string }) => d.name);
    expect(docs).toContain('files.md'); // 刚生成的清单随本次响应返回，免等 socket 回流
    await app.close();
    watchManager.stopAll();
  });

  it('目录全是可预览文档 → 不生成 files.md，docs 不含它', async () => {
    const { app, watchManager, id, dir } = await newTaskWithFiles({ 'notes.md': 'x' });
    const res = await getDocs(app, id);
    expect(() => readFileSync(join(dir, 'files.md'))).toThrow();
    const docs = res.json().docs.map((d: { name: string }) => d.name);
    expect(docs).not.toContain('files.md');
    await app.close();
    watchManager.stopAll();
  });

  it('子目录内容递归进 files.md；docs 列表仍只含顶层文件', async () => {
    const { app, watchManager, id, dir } = await newTaskWithFiles({ 'report.html': '<h1>hi</h1>' });
    mkdirSync(join(dir, 'assets', 'data'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'logo.png'), 'png', 'utf8');
    writeFileSync(join(dir, 'assets', 'data', 'x.json'), '{}', 'utf8');
    const res = await getDocs(app, id);
    const listing = readFileSync(join(dir, 'files.md'), 'utf8');
    expect(listing).toContain('├── assets/\n│   ├── data/\n│   │   └── x.json\n│   └── logo.png');
    const docs = res.json().docs.map((d: { name: string }) => d.name);
    expect(docs).toEqual(expect.arrayContaining(['main.md', 'files.md']));
    expect(docs).not.toContain('assets/logo.png'); // 白名单内但位于子目录：不进可预览列表
    expect(docs.some((n: string) => n.includes('/'))).toBe(false); // 子目录文件不进可预览列表
    await app.close();
    watchManager.stopAll();
  });

  it('隐藏文件不触发生成', async () => {
    const { app, watchManager, id, dir } = await newTaskWithFiles({ '.DS_Store': 'junk' });
    await getDocs(app, id);
    expect(() => readFileSync(join(dir, 'files.md'))).toThrow();
    await app.close();
    watchManager.stopAll();
  });

  it('幂等：内容无变化不重写（mtime 不变）', async () => {
    const { app, watchManager, id, dir } = await newTaskWithFiles({ 'report.html': '<h1>hi</h1>' });
    await getDocs(app, id);
    const before = statSync(join(dir, 'files.md')).mtimeMs;
    await new Promise(r => setTimeout(r, 25));
    await getDocs(app, id);
    expect(statSync(join(dir, 'files.md')).mtimeMs).toBe(before);
    await app.close();
    watchManager.stopAll();
  });

  it('智能体补的说明在下次生成时按文件名保留', async () => {
    const { app, watchManager, id, dir } = await newTaskWithFiles({ 'report.html': '<h1>hi</h1>' });
    await getDocs(app, id);
    // 模拟智能体给 report.html 补作用说明（首屏生成时它是末行 └──）
    const gen1 = readFileSync(join(dir, 'files.md'), 'utf8');
    writeFileSync(join(dir, 'files.md'), gen1.replace('└── report.html', '└── report.html —— 压测报告导出页'), 'utf8');
    // 目录新增文件 → 结构刷新，说明应保留
    writeFileSync(join(dir, 'data.json'), '{}', 'utf8');
    await getDocs(app, id);
    const gen2 = readFileSync(join(dir, 'files.md'), 'utf8');
    expect(gen2).toContain('report.html —— 压测报告导出页');
    expect(gen2).toContain('├── data.json');
    await app.close();
    watchManager.stopAll();
  });
});
