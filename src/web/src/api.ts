import { io } from 'socket.io-client';
import type { Board, ProjectEntry, Task, DocInfo, DocContent, TreeEntry } from './types.js';

const base = '';

export async function getProjects(): Promise<{ projects: ProjectEntry[]; lastProject?: string }> {
  const r = await fetch(`${base}/api/projects`);
  const j = await r.json();
  return { projects: j.projects ?? [], lastProject: j.lastProject };
}

/** 记录最后打开的项目（0003）：刷新/重开时据此恢复 */
export async function setLastProject(path: string): Promise<void> {
  await fetch(`${base}/api/last-project`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
}
export async function addProject(path: string): Promise<void> {
  await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
}
export async function renameProject(path: string, name: string): Promise<void> {
  await fetch(`${base}/api/projects`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, name }),
  });
}
export async function deleteProject(path: string): Promise<void> {
  await fetch(`${base}/api/projects`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
}
/** 项目列表重排序：paths 为期望的完整新顺序（绝对路径数组） */
export async function reorderProjects(paths: string[]): Promise<void> {
  await fetch(`${base}/api/projects/reorder`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  });
}
export async function getBoard(project: string): Promise<Board> {
  const r = await fetch(`${base}/api/board?project=${encodeURIComponent(project)}`);
  return r.json();
}
/** 拉取单个任务最新数据（含 mtime），用于 modal 内检测外部改动后同步。 */
export async function getTask(project: string, id: string): Promise<Task | null> {
  const r = await fetch(`${base}/api/tasks/${id}?project=${encodeURIComponent(project)}`);
  if (!r.ok) return null;
  return r.json();
}
export async function createTask(project: string, name: string): Promise<Task> {
  const r = await fetch(`${base}/api/tasks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, name }),
  });
  return r.json();
}
export async function moveTask(project: string, id: string, column: string, toIndex?: number): Promise<void> {
  await fetch(`${base}/api/tasks/${id}/move`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, column, toIndex }),
  });
}
export async function archiveTask(project: string, id: string): Promise<void> {
  await fetch(`${base}/api/tasks/${id}/archive`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project }),
  });
}
export async function deleteTask(project: string, id: string): Promise<void> {
  await fetch(`${base}/api/tasks/${id}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project }),
  });
}
/** 用系统文件管理器打开任务实体目录（macOS Finder / Windows 资源管理器），返回是否成功 */
export async function openTaskDir(project: string, id: string): Promise<boolean> {
  const r = await fetch(`${base}/api/tasks/${id}/open-dir`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project }),
  });
  return r.ok;
}
export async function toggleSubtask(project: string, id: string, index: number): Promise<void> {
  await fetch(`${base}/api/tasks/${id}/check`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, index }),
  });
}
/** 翻转 todo 延后事项（todo.md）的勾选状态 */
export async function toggleTodo(project: string, id: string, index: number): Promise<void> {
  await fetch(`${base}/api/tasks/${id}/todo-check`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, index }),
  });
}
/** 追加一条 todo 延后事项（只 append），返回新事项编号 */
export async function addTodo(project: string, id: string, title: string, content = ''): Promise<string> {
  const r = await fetch(`${base}/api/tasks/${id}/todo-add`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, title, content }),
  });
  const j = await r.json();
  return j.no as string;
}
export async function updateTask(
  project: string,
  id: string,
  data: { title: string; description: string; prompt: string; subtasks: { no?: string; tag?: string; text: string; done: boolean }[] },
): Promise<Task> {
  const r = await fetch(`${base}/api/tasks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, ...data }),
  });
  return r.json();
}

export function subscribeBoard(project: string, onChange: () => void): () => void {
  const socket = io();
  socket.emit('subscribe', project);
  socket.on('board:changed', onChange);
  return () => { socket.disconnect(); };
}

/** 列出任务目录里的文档：docs 为顶层可预览项（chips），tree 为全量递归条目（文件树浮层） */
export async function listDocs(project: string, id: string): Promise<{ docs: DocInfo[]; tree: TreeEntry[] }> {
  const r = await fetch(`${base}/api/tasks/${id}/docs?project=${encodeURIComponent(project)}`);
  const j = await r.json();
  return { docs: j.docs ?? [], tree: j.tree ?? [] };
}

/** 读取单个文档内容（path 为相对任务根的路径，可含子目录）：文本 {type,content}，图片 {type:'image',dataUrl}，
 *  docx {type:'html'}，excel {type:'excel',sheets}，csv {type:'csv'}。
 *  整条路径一次性 encodeURIComponent（/ 成 %2F 单段到达通配路由，也不给路由层任何 `..` 规范化空间）。 */
export async function readDoc(project: string, id: string, path: string): Promise<DocContent> {
  const r = await fetch(`${base}/api/tasks/${id}/docs/${encodeURIComponent(path)}?project=${encodeURIComponent(project)}`);
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new Error(j?.error ?? '文档读取失败');
  }
  return r.json();
}
