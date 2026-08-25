import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, mkdirSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Fastify from 'fastify';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { sortDocs, DOC_ORDER, isSafeSubPath } from './tasks.js';
import { registerRoutes } from './index.js';
import { WatchManager } from '../watch-manager.js';
import { addProject } from '../../core/projects.js';
import { initBoard } from '../../core/init-board.js';

describe('isSafeSubPath', () => {
  it('拒绝穿越/绝对/反斜杠/空段变体，放行普通相对路径（含子目录）', () => {
    expect(isSafeSubPath('logs.md')).toBe(true);
    expect(isSafeSubPath('assets/data/x.json')).toBe(true);
    expect(isSafeSubPath('../secret.md')).toBe(false);
    expect(isSafeSubPath('a/../../b.md')).toBe(false);
    expect(isSafeSubPath('a/./b.md')).toBe(false);
    expect(isSafeSubPath('/etc/passwd')).toBe(false);
    expect(isSafeSubPath('a\\b.md')).toBe(false);
    expect(isSafeSubPath('a//b.md')).toBe(false);
    expect(isSafeSubPath('')).toBe(false);
  });
});

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
    const { app, watchManager, id, dir } = await newTaskWithFiles({ 'report.zip': '<h1>hi</h1>' });
    const res = await getDocs(app, id);
    const listing = readFileSync(join(dir, 'files.md'), 'utf8');
    expect(listing).toContain('```'); // tree 块在代码围栏内，markdown 渲染换行不丢
    expect(listing).toContain('├── main.md');
    expect(listing).toContain('└── report.zip');
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
    const { app, watchManager, id, dir } = await newTaskWithFiles({ 'report.zip': '<h1>hi</h1>' });
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
    const { app, watchManager, id, dir } = await newTaskWithFiles({ 'report.zip': '<h1>hi</h1>' });
    await getDocs(app, id);
    const before = statSync(join(dir, 'files.md')).mtimeMs;
    await new Promise(r => setTimeout(r, 25));
    await getDocs(app, id);
    expect(statSync(join(dir, 'files.md')).mtimeMs).toBe(before);
    await app.close();
    watchManager.stopAll();
  });

  it('智能体补的说明在下次生成时按文件名保留', async () => {
    const { app, watchManager, id, dir } = await newTaskWithFiles({ 'report.zip': '<h1>hi</h1>' });
    await getDocs(app, id);
    // 模拟智能体给 report.zip 补作用说明（首屏生成时它是末行 └──）
    const gen1 = readFileSync(join(dir, 'files.md'), 'utf8');
    writeFileSync(join(dir, 'files.md'), gen1.replace('└── report.zip', '└── report.zip —— 压测报告导出页'), 'utf8');
    // 目录新增文件 → 结构刷新，说明应保留
    writeFileSync(join(dir, 'data.bin'), '{}', 'utf8');
    await getDocs(app, id);
    const gen2 = readFileSync(join(dir, 'files.md'), 'utf8');
    expect(gen2).toContain('report.zip —— 压测报告导出页');
    expect(gen2).toContain('├── data.bin');
    await app.close();
    watchManager.stopAll();
  });
});

// ---- 子目录与多格式预览（0024）：tree 响应 + 通配读取 + 安全校验 + 格式转换 ----
describe('文档预览：子目录与多格式（0024）', () => {
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

  /** 建任务并返回 app / id / 实体目录；files 写在任务根 */
  async function newTask(files: Record<string, string> = {}) {
    const { app, watchManager } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/tasks', payload: { project: projectDir, name: '预览任务' } });
    const task = res.json();
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(task.path, name), content, 'utf8');
    }
    return { app, watchManager, id: task.id, dir: task.path };
  }

  async function readDoc(app: ReturnType<typeof Fastify>, id: string, sub: string) {
    // 整条路径一次性编码（/ → %2F 成单一段）：逐段编码留下的字面 / 会让 find-my-way
    // 在路由前就规范化 `..` 段（404 吞掉请求），测不到 handler 防线
    return app.inject({ method: 'GET', url: `/api/tasks/${id}/docs/${encodeURIComponent(sub)}?project=${encodeURIComponent(projectDir)}` });
  }

  it('tree 含子目录条目与 previewable 标记，与 files.md 同序；docs chips 仅顶层且带 path', async () => {
    const { app, watchManager, id, dir } = await newTask({ 'query.sql': 'SELECT 1;' });
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'logo.png'), 'png');
    writeFileSync(join(dir, 'assets', 'pack.zip'), 'zip');
    const res = await app.inject({ method: 'GET', url: `/api/tasks/${id}/docs?project=${encodeURIComponent(projectDir)}` });
    const { docs, tree } = res.json();
    // chips：仅顶层可预览文件，含新增的 sql；目录里有 zip → 触发生成清单，刚生成的 files.md 随本次响应进 chips
    const names = docs.map((d: { name: string }) => d.name);
    expect(names).toContain('query.sql');
    expect(names).toContain('files.md');
    expect(names.some((n: string) => n.includes('/'))).toBe(false); // 子目录文件不进 chips
    expect(docs.some((d: { path: string }) => d.path === 'query.sql')).toBe(true);
    // tree：全量、DFS 序与 files.md 一致
    const paths = tree.map((e: { path: string }) => e.path);
    expect(paths).toContain('assets');
    expect(paths).toContain('assets/logo.png');
    expect(paths).toContain('assets/pack.zip');
    type TreeItem = { path: string; previewable: boolean; isDir: boolean };
    const byPath = new Map<string, TreeItem>(tree.map((e: TreeItem) => [e.path, e] as [string, TreeItem]));
    expect(byPath.get('assets')?.isDir).toBe(true);
    expect(byPath.get('assets/logo.png')?.previewable).toBe(true);
    expect(byPath.get('assets/pack.zip')?.previewable).toBe(false);
    expect(byPath.get('query.sql')?.previewable).toBe(true);
    // 同序校验：tree 中 assets 相关条目顺序 = files.md 行序（assets/ 在 logo.png、pack.zip 前）
    expect(paths.indexOf('assets')).toBeLessThan(paths.indexOf('assets/logo.png'));
    expect(paths.indexOf('assets/logo.png')).toBeLessThan(paths.indexOf('assets/pack.zip'));
    await app.close();
    watchManager.stopAll();
  });

  it('读取子目录内白名单文件：markdown/json/sql/csv 各按类型返回', async () => {
    const { app, watchManager, id, dir } = await newTask();
    mkdirSync(join(dir, 'docs', 'sql'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'sub.md'), '# 子目录', 'utf8');
    writeFileSync(join(dir, 'docs', 'conf.json'), '{"a":1}', 'utf8');
    writeFileSync(join(dir, 'docs', 'sql', 'q.sql'), 'SELECT 1;', 'utf8');
    writeFileSync(join(dir, 'docs', 'rows.csv'), 'a,b\n1,2', 'utf8');

    const md = await readDoc(app, id, 'docs/sub.md');
    expect(md.statusCode).toBe(200);
    expect(md.json()).toEqual({ type: 'markdown', content: '# 子目录' });

    const json = await readDoc(app, id, 'docs/conf.json');
    expect(json.json().type).toBe('text');

    const sql = await readDoc(app, id, 'docs/sql/q.sql');
    expect(sql.json()).toEqual({ type: 'text', content: 'SELECT 1;' });

    const csv = await readDoc(app, id, 'docs/rows.csv');
    expect(csv.json()).toEqual({ type: 'csv', content: 'a,b\n1,2' });
    await app.close();
    watchManager.stopAll();
  });

  it('路径穿越（..）与白名单外扩展 → 400；不存在 → 404', async () => {
    const { app, watchManager, id } = await newTask({ 'main.md': 'x' });
    expect((await readDoc(app, id, '../secret.md')).statusCode).toBe(400);
    expect((await readDoc(app, id, 'a/../../secret.md')).statusCode).toBe(400);
    expect((await readDoc(app, id, 'pack.zip')).statusCode).toBe(400);
    expect((await readDoc(app, id, 'nope.md')).statusCode).toBe(404);
    await app.close();
    watchManager.stopAll();
  });

  it('软链指向任务目录外 → 400；指向任务目录内 → 放行', async () => {
    const { app, watchManager, id, dir } = await newTask({ 'target.md': '内文件' });
    const outside = mkdtempSync(join(tmpdir(), 'kb-out-'));
    try {
      writeFileSync(join(outside, 'secret.md'), '机密', 'utf8');
      symlinkSync(join(outside, 'secret.md'), join(dir, 'evil.md'));
      symlinkSync(join(dir, 'target.md'), join(dir, 'alias.md'));

      const evil = await readDoc(app, id, 'evil.md');
      expect(evil.statusCode).toBe(400);
      expect(evil.json().error).toBe('不支持的文件');

      const alias = await readDoc(app, id, 'alias.md');
      expect(alias.statusCode).toBe(200);
      expect(alias.json()).toEqual({ type: 'markdown', content: '内文件' });
    } finally {
      rmSync(outside, { recursive: true, force: true });
      await app.close();
      watchManager.stopAll();
    }
  });

  it('docx → html（mammoth 转换，含段落文本）', async () => {
    const { app, watchManager, id, dir } = await newTask();
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '</Types>');
    zip.folder('_rels')!.file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
      + '</Relationships>');
    zip.folder('word')!.file('document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
      + '<w:p><w:r><w:t>你好 docx</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t>第二段</w:t></w:r></w:p>'
      + '</w:body></w:document>');
    writeFileSync(join(dir, 'spec.docx'), await zip.generateAsync({ type: 'nodebuffer' }));

    const res = await readDoc(app, id, 'spec.docx');
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.type).toBe('html');
    expect(j.content).toContain('你好 docx');
    expect(j.content).toContain('<p>');
    await app.close();
    watchManager.stopAll();
  });

  it('xlsx → excel：各 sheet 行列数据（值字符串化）', async () => {
    const { app, watchManager, id, dir } = await newTask();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['姓名', '年龄'], ['张三', 30], ['李四', 25]]), 'Sheet1');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x'], [1]]), 'Sheet2');
    writeFileSync(join(dir, 'data.xlsx'), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);

    const res = await readDoc(app, id, 'data.xlsx');
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.type).toBe('excel');
    expect(j.sheets.map((s: { name: string }) => s.name)).toEqual(['Sheet1', 'Sheet2']);
    expect(j.sheets[0].rows[0]).toEqual(['姓名', '年龄']);
    expect(j.sheets[0].rows[1]).toEqual(['张三', '30']);
    await app.close();
    watchManager.stopAll();
  });

  it('文本超限（>2MB）→ 413 且带提示', async () => {
    const { app, watchManager, id, dir } = await newTask();
    writeFileSync(join(dir, 'big.txt'), 'x'.repeat(2 * 1024 * 1024 + 1), 'utf8');
    const res = await readDoc(app, id, 'big.txt');
    expect(res.statusCode).toBe(413);
    expect(res.json().error).toContain('过大');
    await app.close();
    watchManager.stopAll();
  });
});
