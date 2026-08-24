import type { FastifyInstance } from 'fastify';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, basename, extname } from 'path';
import { createTask, getTask, updateTaskContent, deleteTask } from '../../core/task-crud.js';
import { archiveTask } from '../../core/archive.js';
import { moveTask } from '../../core/move.js';
import { toggleSubtask } from '../../core/check.js';
import { toggleTodo, appendTodo } from '../../core/todo.js';

/** 文档扩展名白名单（小写，不含点） */
const TEXT_EXTS = new Set(['txt', 'md', 'markdown']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

function isDocExt(ext: string): boolean {
  const e = ext.toLowerCase();
  return TEXT_EXTS.has(e) || IMAGE_EXTS.has(e);
}

/**
 * 文档语义优先级：排在前面的优先展示。
 * - main.md 实际不进 docs（已结构化进 Task.main），列在此仅为"理论完整"。
 * - todo.md 紧随其后：延后事项清单，未完成的遗留最该被看见。
 * - logs.md：执行进展日志，doing 栏任务首要关注。
 * - 其后是设计/计划/说明/记录的常规四件套。
 * 未列出的文档按文件名字母序补在末尾。
 */
export const DOC_ORDER = ['main.md', 'todo.md', 'logs.md', 'design.md', 'plan.md', 'readme.md', 'notes.md'];

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

  // 列出任务目录里的文档（白名单：txt/md/图片），仅一层、防路径穿越
  fastify.get('/api/tasks/:id/docs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { project } = req.query as { project: string };
    const task = getTask(project, id);
    if (!task) { reply.code(404); return { error: '任务不存在' }; }

    let entries: string[] = [];
    try { entries = readdirSync(task.path); } catch { return { docs: [] }; }
    const docs = entries
      .filter(name => {
        // 仅文件名本身（杜绝子目录 / ../ 之类）
        if (name !== basename(name)) return false;
        const full = join(task.path, name);
        try { if (!statSync(full).isFile()) return false; } catch { return false; }
        return isDocExt(extname(name).replace(/^\./, ''));
      })
      .map(name => {
        const ext = extname(name).replace(/^\./, '');
        return { name, ext, isImage: IMAGE_EXTS.has(ext.toLowerCase()) };
      });
    return { docs: sortDocs(docs) };
  });

  // 读取单个文档内容：文本类返回 {type, content}，图片返回 {type:'image', dataUrl}
  fastify.get('/api/tasks/:id/docs/:name', async (req, reply) => {
    const { id, name } = req.params as { id: string; name: string };
    const { project } = req.query as { project: string };
    // 白名单 + basename：杜绝 ../ 与目录穿越
    if (name !== basename(name) || !isDocExt(extname(name).replace(/^\./, ''))) {
      reply.code(400); return { error: '不支持的文件' };
    }
    const task = getTask(project, id);
    if (!task) { reply.code(404); return { error: '任务不存在' }; }
    // basename 校验已杜绝 name 含路径分隔符/.. 的情况，直接拼接是安全的
    const full = join(task.path, name);
    if (!existsSync(full) || !statSync(full).isFile()) { reply.code(404); return { error: '文件不存在' }; }

    const ext = extname(name).replace(/^\./, '').toLowerCase();
    if (IMAGE_EXTS.has(ext)) {
      const buf = readFileSync(full);
      return { type: 'image' as const, dataUrl: `data:${mimeOf(ext)};base64,${buf.toString('base64')}` };
    }
    const content = readFileSync(full, 'utf8');
    return { type: (ext === 'txt' ? 'text' : 'markdown') as 'text' | 'markdown', content };
  });
}
