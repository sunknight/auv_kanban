import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import type { BoardConfig, TaskMeta } from './types.js';
import { kanbanDir } from './paths.js';

export function boardYmlPath(projectRoot: string): string {
  return join(kanbanDir(projectRoot), 'board.yml');
}

export function defaultBoardConfig(): BoardConfig {
  return {
    'next-id': 1,
    columns: [
      { name: 'backlog', display: '待办' },
      { name: 'ready', display: '允许执行' },
      { name: 'doing', display: '进行中' },
      { name: 'done', display: '完成' },
    ],
    order: { backlog: [], ready: [], doing: [], done: [] },
    tasks: {},
  };
}

export function readBoardConfig(projectRoot: string): BoardConfig {
  const path = boardYmlPath(projectRoot);
  if (!existsSync(path)) return defaultBoardConfig();
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = yaml.load(raw) as Partial<BoardConfig>;
    return normalizeBoardConfig(parsed);
  } catch {
    return defaultBoardConfig();
  }
}

function normalizeBoardConfig(p: Partial<BoardConfig>): BoardConfig {
  const dft = defaultBoardConfig();
  const columns = Array.isArray(p.columns) && p.columns.length > 0
    ? p.columns.map(c => ({ name: String(c.name), display: String(c.display ?? c.name) }))
    : dft.columns;
  const order: Record<string, string[]> = {};
  for (const col of columns) {
    order[col.name] = Array.isArray(p.order?.[col.name]) ? p.order![col.name]!.map(String) : [];
  }
  // tasks 容错：必须是对象，值的 created 为字符串；否则视为 {}
  const tasks: Record<string, TaskMeta> = {};
  if (p.tasks && typeof p.tasks === 'object') {
    for (const [id, meta] of Object.entries(p.tasks)) {
      if (meta && typeof meta === 'object' && typeof meta.created === 'string') {
        tasks[id] = { created: meta.created };
      }
    }
  }
  return {
    'next-id': typeof p['next-id'] === 'number' ? p['next-id'] : dft['next-id'],
    columns,
    order,
    tasks,
  };
}

export function writeBoardConfig(projectRoot: string, config: BoardConfig): void {
  mkdirSync(kanbanDir(projectRoot), { recursive: true });
  const raw = yaml.dump({
    'next-id': config['next-id'],
    columns: config.columns,
    order: config.order,
    tasks: config.tasks ?? {},
  });
  writeFileSync(boardYmlPath(projectRoot), raw, 'utf8');
}
