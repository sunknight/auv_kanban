import { io } from 'socket.io-client';
import type { Board, ProjectEntry, Task, DocInfo, DocContent } from './types.js';

const base = '';

export async function getProjects(): Promise<ProjectEntry[]> {
  const r = await fetch(`${base}/api/projects`);
  const j = await r.json();
  return j.projects;
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
export async function getBoard(project: string): Promise<Board> {
  const r = await fetch(`${base}/api/board?project=${encodeURIComponent(project)}`);
  return r.json();
}
export async function createTask(project: string, name: string): Promise<Task> {
  const r = await fetch(`${base}/api/tasks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, name }),
  });
  return r.json();
}
export async function moveTask(project: string, id: string, column: string): Promise<void> {
  await fetch(`${base}/api/tasks/${id}/move`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, column }),
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
export async function toggleSubtask(project: string, id: string, index: number): Promise<void> {
  await fetch(`${base}/api/tasks/${id}/check`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, index }),
  });
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

/** 列出任务目录里的文档（txt/md/图片） */
export async function listDocs(project: string, id: string): Promise<DocInfo[]> {
  const r = await fetch(`${base}/api/tasks/${id}/docs?project=${encodeURIComponent(project)}`);
  const j = await r.json();
  return j.docs ?? [];
}

/** 读取单个文档内容：文本类 {type,content}，图片 {type:'image',dataUrl} */
export async function readDoc(project: string, id: string, name: string): Promise<DocContent> {
  const r = await fetch(`${base}/api/tasks/${id}/docs/${encodeURIComponent(name)}?project=${encodeURIComponent(project)}`);
  return r.json();
}
