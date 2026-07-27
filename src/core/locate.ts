import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tasksDir } from './paths.js';
import { readBoardConfig } from './board-yml.js';
import { parseDirName } from './task-id.js';
import { parseMainMd } from './main-md.js';

export interface LocatedTask {
  id: string;
  name: string;
  dirName: string;
  column: string;
  /** 实体目录绝对路径（.kanban/tasks/<dir>），永不漂移 */
  path: string;
}

/** 按 ID 定位任务（扫 tasks/ 实体 + 从 order 反查归属） */
export function locateById(projectRoot: string, id: string): LocatedTask | null {
  const all = locateAll(projectRoot);
  return all.find(t => t.id === id) ?? null;
}

/**
 * 列出所有任务。真相源 = .kanban/tasks/ 实体 + board.yml.order 归属。
 * 不扫描栏目录、不信任栏软链。孤儿（实体存在但不在任何 order）临时归 backlog，
 * 但**不写回 order**（locate 保持纯读，持久自愈由 rebuildAllSymlinks 负责）。
 */
export function locateAll(projectRoot: string): LocatedTask[] {
  const config = readBoardConfig(projectRoot);
  const tdir = tasksDir(projectRoot);

  // 反查 order 构造 id → column
  const idToCol: Record<string, string> = {};
  for (const col of config.columns) {
    for (const id of config.order[col.name] ?? []) {
      idToCol[id] = col.name;
    }
  }
  const backlog = config.columns[0]?.name; // 孤儿兜底栏

  // 扫 tasks/ 实体
  let entries: string[] = [];
  try { entries = readdirSync(tdir); } catch { return []; }
  const out: LocatedTask[] = [];
  for (const entry of entries) {
    const parsed = parseDirName(entry);
    if (!parsed) continue;
    const full = join(tdir, entry);
    try { if (!statSync(full).isDirectory()) continue; } catch { continue; }
    const column = idToCol[parsed.id] ?? backlog ?? 'backlog';
    const name = readH1(join(full, 'main.md')) ?? parsed.name;
    out.push({
      id: parsed.id,
      name,
      dirName: entry,
      column,
      path: full,
    });
  }
  return out;
}

/** 读 main.md 的 H1 作为显示名；失败返回 null */
function readH1(mainPath: string): string | null {
  if (!existsSync(mainPath)) return null;
  try {
    const parsed = parseMainMd(readFileSync(mainPath, 'utf8'));
    return parsed.title || null;
  } catch {
    return null;
  }
}
