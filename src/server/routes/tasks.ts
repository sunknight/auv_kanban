import type { FastifyInstance } from 'fastify';
import { readFileSync, writeFileSync, statSync, realpathSync } from 'fs';
import { join, extname, sep } from 'path';
import { createTask, getTask, updateTaskContent, deleteTask } from '../../core/task-crud.js';
import { archiveTask } from '../../core/archive.js';
import { moveTask } from '../../core/move.js';
import { toggleSubtask } from '../../core/check.js';
import { toggleTodo, appendTodo } from '../../core/todo.js';
import { openDirInFileManager } from '../open-dir.js';
import { DOC_ORDER, FILE_LISTING_NAME, buildFileListing, buildTreeNodes, walkTaskDir, type ListingEntry, type TreeNode } from '../../core/file-listing.js';
import { DOCX_EXTS, EXCEL_EXTS, LIMITS, docxToHtml, excelToSheets, overLimit } from '../doc-preview.js';

// DOC_ORDER 迁至 core/file-listing.ts（与目录清单共用一份固定序）；此处转出保持既有导入不变
export { DOC_ORDER } from '../../core/file-listing.js';

/** 文档扩展名白名单（小写，不含点）——文本源码类 */
const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'sql', 'json', 'xml', 'yml', 'yaml', 'log', 'html', 'htm']);
/** 图片类（dataUrl 返回，浏览器原生渲染） */
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);
/** csv 单列（type:'csv'，前端渲染表格） */
const CSV_EXTS = new Set(['csv']);

/** 统一取小写扩展名（不含点） */
const extOf = (p: string): string => extname(p).replace(/^\./, '').toLowerCase();

function isDocExt(ext: string): boolean {
  const e = ext.toLowerCase();
  return TEXT_EXTS.has(e) || IMAGE_EXTS.has(e) || DOCX_EXTS.has(e) || EXCEL_EXTS.has(e) || CSV_EXTS.has(e);
}

/**
 * 子路径安全校验（第一道防线）：非空、非绝对路径、无反斜杠/空字节、
 * 按段切分后无空段、`.`、`..`（杜绝 `a/../b`、`..%2F` 穿越变体）。
 * 第二道防线在读取路由里做 realpath containment（拦软链外指）。
 */
export function isSafeSubPath(sub: string): boolean {
  if (!sub || sub.startsWith('/') || sub.includes('\\') || sub.includes('\0')) return false;
  return sub.split('/').every(s => s.length > 0 && s !== '.' && s !== '..');
}

/** 任务文档排序：先按 DOC_ORDER 语义优先级，再按文件名字母序。纯函数，便于单测。 */
export function sortDocs<T extends { name: string }>(docs: T[]): T[] {
  const rank = (name: string): number => {
    const i = DOC_ORDER.indexOf(name);
    return i === -1 ? DOC_ORDER.length : i;
  };
  return [...docs].sort((a, b) => {
    const ra = rank(a.name);
    const rb = rank(b.name);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

/** MIME 推断（图片 dataUrl 用） */
function mimeOf(ext: string): string {
  const e = ext.toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    bmp: 'image/bmp', avif: 'image/avif',
  };
  return map[e] ?? 'application/octet-stream';
}

export function registerTaskRoutes(fastify: FastifyInstance): void {
  fastify.post('/api/tasks', async (req) => {
    const { project, name, column } = req.body as { project: string; name: string; column?: string };
    const t = await createTask(project, name, column ?? 'backlog');
    return t;
  });

  fastify.post('/api/tasks/:id/move', async (req) => {
    const { id } = req.params as { id: string };
    const { project, column, toIndex } = req.body as { project: string; column: string; toIndex?: number };
    await moveTask(project, id, column, toIndex);
    return { ok: true };
  });

  fastify.post('/api/tasks/:id/check', async (req) => {
    const { id } = req.params as { id: string };
    const { project, index } = req.body as { project: string; index: number };
    await toggleSubtask(project, id, index);
    return { ok: true };
  });

  // 勾选/翻转 todo 延后事项（todo.md），与子任务 check 路由同构
  fastify.post('/api/tasks/:id/todo-check', async (req) => {
    const { id } = req.params as { id: string };
    const { project, index } = req.body as { project: string; index: number };
    await toggleTodo(project, id, index);
    return { ok: true };
  });

  // 追加一条 todo 延后事项（只 append，不动已有行）
  fastify.post('/api/tasks/:id/todo-add', async (req) => {
    const { id } = req.params as { id: string };
    const { project, title, content } = req.body as { project: string; title: string; content?: string };
    const no = await appendTodo(project, id, title, content ?? '');
    return { ok: true, no };
  });

  fastify.delete('/api/tasks/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { project } = req.body as { project: string };
    await deleteTask(project, id);
    return { ok: true };
  });

  fastify.post('/api/tasks/:id/archive', async (req) => {
    const { id } = req.params as { id: string };
    const { project } = req.body as { project: string };
    await archiveTask(project, id);
    return { ok: true };
  });

  // 用系统文件管理器打开任务实体目录（macOS Finder / Windows 资源管理器 / Linux xdg-open）。
  // 目录路径由服务端 getTask 定位得出，不收客户端路径参数；project 注册守卫由 preHandler 统一处理。
  fastify.post('/api/tasks/:id/open-dir', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { project } = req.body as { project: string };
    const task = getTask(project, id);
    if (!task) { reply.code(404); return { error: '任务不存在' }; }
    const ok = await openDirInFileManager(task.path);
    if (!ok) { reply.code(500); return { error: '打开目录失败（当前平台可能不支持）' }; }
    return { ok: true, path: task.path };
  });

  fastify.put('/api/tasks/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      project: string;
      title: string;
      description: string;
      prompt: string;
      subtasks: { text: string; done: boolean }[];
    };
    return await updateTaskContent(body.project, id, {
      title: body.title,
      description: body.description,
      prompt: body.prompt,
      subtasks: body.subtasks,
    });
  });

  fastify.get('/api/tasks/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { project } = req.query as { project: string };
    return getTask(project, id);
  });

  // 列出任务目录里的文档（白名单：文本源码/csv/图片/docx/excel），chips 仅顶层、防路径穿越；
  // tree 为全量递归条目（与 files.md 同序，含不可预览项，previewable 标记）。
  // 目录含白名单外文件或子目录、或 files.md 已存在时，按需生成/更新目录清单 files.md：
  // 内容无变化不写盘（幂等），避免触发 watcher 的刷新回环。
  fastify.get('/api/tasks/:id/docs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { project } = req.query as { project: string };
    const task = getTask(project, id);
    if (!task) { reply.code(404); return { error: '任务不存在' }; }

    // 递归遍历任务目录（软链只列名不展开）；chips 只看根级条目，子目录文件经 tree 浮层入口。
    const all = walkTaskDir(task.path);
    const root = all.filter(e => !(e.path ?? e.name).includes('/'));

    const hasListing = root.some(e => e.name === FILE_LISTING_NAME && !e.isDir);
    const needsListing = hasListing
      || root.some(e => e.isDir || !isDocExt(extOf(e.name)));
    if (needsListing) {
      let existing: string | null = null;
      if (hasListing) {
        try { existing = readFileSync(join(task.path, FILE_LISTING_NAME), 'utf8'); } catch { existing = null; }
      }
      const next = buildFileListing(all, existing);
      if (next !== existing) {
        try { writeFileSync(join(task.path, FILE_LISTING_NAME), next, 'utf8'); } catch { /* 清单写失败不阻塞文档列表 */ }
      }
    }

    const docNames: ListingEntry[] = root
      .filter(e => !e.isDir && isDocExt(extOf(e.name)));
    if (needsListing && !hasListing) docNames.push({ name: FILE_LISTING_NAME }); // 刚生成的清单一并返回，免等 socket 回流
    const docs = docNames.map(e => {
      const ext = extOf(e.name);
      return { name: e.name, path: e.path ?? e.name, ext, isImage: IMAGE_EXTS.has(ext) };
    });

    // 全量树（与 files.md 行序一致）：buildTreeNodes 会自动补 files.md 条目（清单语境下正确），
    // 但清单本次并未生成/不存在时把它滤掉，避免树里出现点不开的幻影文件。
    const listingExists = hasListing || needsListing;
    const tree: { path: string; name: string; isDir: boolean; previewable: boolean }[] = [];
    const flatten = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.path === FILE_LISTING_NAME && !listingExists) continue;
        tree.push({ path: n.path, name: n.name, isDir: n.isDir, previewable: !n.isDir && isDocExt(extOf(n.path)) });
        if (n.children) flatten(n.children);
      }
    };
    flatten(buildTreeNodes(all));

    return { docs: sortDocs(docs), tree };
  });

  // 读取单个文档内容（* 通配支持子目录相对路径）：
  // 文本类 {type,content}，图片 {type:'image',dataUrl}，csv {type:'csv',content}，
  // docx {type:'html',content}，excel {type:'excel',sheets}。
  // 路径安全三道防线：①段校验（无 ../）；②realpath 解析后必须仍在任务目录内（拦软链外指）；③必须是普通文件。
  fastify.get('/api/tasks/:id/docs/*', async (req, reply) => {
    const { id } = req.params as { id: string };
    const sub = (req.params as { '*': string })['*'];
    if (!isSafeSubPath(sub) || !isDocExt(extOf(sub))) {
      reply.code(400); return { error: '不支持的文件' };
    }
    const task = getTask(projectOf(req), id);
    if (!task) { reply.code(404); return { error: '任务不存在' }; }

    const taskReal = realpathSync(task.path); // 任务实体目录应为真实目录；异常向上抛 500
    let full: string;
    try { full = realpathSync(join(task.path, sub)); } catch { reply.code(404); return { error: '文件不存在' }; }
    if (full !== taskReal && !full.startsWith(taskReal + sep)) {
      reply.code(400); return { error: '不支持的文件' }; // 软链引到任务目录外
    }
    if (!statSync(full).isFile()) { reply.code(404); return { error: '文件不存在' }; }

    const ext = extOf(full);
    if (IMAGE_EXTS.has(ext)) {
      if (overLimit(full, LIMITS.image)) { reply.code(413); return { error: '图片过大（>10MB），不支持在线预览' }; }
      const buf = readFileSync(full);
      return { type: 'image' as const, dataUrl: `data:${mimeOf(ext)};base64,${buf.toString('base64')}` };
    }
    if (DOCX_EXTS.has(ext)) {
      if (overLimit(full, LIMITS.office)) { reply.code(413); return { error: '文档过大（>20MB），不支持在线预览' }; }
      try {
        return { type: 'html' as const, content: await docxToHtml(full) };
      } catch { reply.code(500); return { error: 'docx 转换失败（文件可能已损坏）' }; }
    }
    if (EXCEL_EXTS.has(ext)) {
      if (overLimit(full, LIMITS.office)) { reply.code(413); return { error: '表格过大（>20MB），不支持在线预览' }; }
      try {
        return { type: 'excel' as const, sheets: await excelToSheets(full) };
      } catch { reply.code(500); return { error: 'excel 转换失败（文件可能已损坏）' }; }
    }
    if (overLimit(full, LIMITS.text)) { reply.code(413); return { error: '文件过大（>2MB），不支持在线预览' }; }
    const content = readFileSync(full, 'utf8');
    if (ext === 'txt') return { type: 'text' as const, content };
    if (ext === 'md' || ext === 'markdown') return { type: 'markdown' as const, content };
    if (ext === 'csv') return { type: 'csv' as const, content };
    return { type: 'text' as const, content }; // sql/json/xml/yaml/log/html 等按源码文本显示
  });
}

/** 从 req.query 取 project（读取路由与列表路由共用） */
function projectOf(req: { query: unknown }): string {
  return (req.query as { project: string }).project;
}
