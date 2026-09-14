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
  // tasks 容错：必须是对象，值的 created 为字符串；due/people/type 为可选元数据，
  // 归一化时保留（任何 CLI 写操作都会经此读改写回，丢弃即静默抹掉元数据）。空值视为未设置、不产出键。
  // 放宽为 unknown 记录入参：手写 board.yml 未加引号的日期会被 YAML 解析成 Date，需在此兼容。
  const tasks: Record<string, TaskMeta> = {};
  const rawTasks = p.tasks as Record<string, Record<string, unknown>> | undefined;
  if (rawTasks && typeof rawTasks === 'object') {
    for (const [id, meta] of Object.entries(rawTasks)) {
      // created 兼容手写未加引号被 YAML 解析成 Date 的情况
      const created = typeof meta?.created === 'string'
        ? meta.created
        : meta?.created instanceof Date && !Number.isNaN(meta.created.getTime()) ? meta.created.toISOString() : null;
      if (meta && typeof meta === 'object' && created) {
        const next: TaskMeta = { created };
        // due 兼容两种来源：字符串（本工具写盘）；手写未加引号时 YAML 1.1 解析成 Date
        if (typeof meta.due === 'string' && meta.due.trim() !== '') next.due = meta.due.trim();
        else if (meta.due instanceof Date && !Number.isNaN(meta.due.getTime())) next.due = formatDate(meta.due);
        if (Array.isArray(meta.people)) {
          const people = [...new Set(meta.people.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim()))];
          if (people.length > 0) next.people = people;
        }
        if (typeof meta.type === 'string' && meta.type.trim() !== '') next.type = meta.type.trim();
        tasks[id] = next;
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

/** Date → 本地时区 YYYY-MM-DD（手写 board.yml 的日期型 due 兜底归一化用） */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
