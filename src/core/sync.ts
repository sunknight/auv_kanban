import { readdirSync, lstatSync, unlinkSync, symlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { kanbanDir, tasksDir } from './paths.js';
import { readBoardConfig } from './board-yml.js';
import { parseDirName } from './task-id.js';
import type { BoardConfig } from './types.js';

/** 软链目标用相对路径：从 <栏目录>/<dirName> 指向 ../tasks/<dirName> */
function relSymlinkTarget(dirName: string): string {
  return join('..', 'tasks', dirName);
}

/**
 * 同步某任务的栏软链到与 board.yml 一致。
 * 删除该任务在所有栏目录里的旧软链，在"它归属的栏"目录建一个软链。
 * 调用方需保证 config 是最新读出的（不在此处重读，避免写覆盖）。
 */
export function syncSymlinks(projectRoot: string, id: string, config: BoardConfig): void {
  const root = kanbanDir(projectRoot);
  // 找到该任务归属的栏（在 order 里）
  let targetColumn: string | null = null;
  let dirName: string | null = null;
  for (const col of config.columns) {
    if ((config.order[col.name] ?? []).includes(id)) {
      targetColumn = col.name;
    }
  }
  // 找到实体目录名（扫 tasks/）
  const tdir = tasksDir(projectRoot);
  try {
    for (const entry of readdirSync(tdir)) {
      const parsed = parseDirName(entry);
      if (parsed && parsed.id === id) { dirName = entry; break; }
    }
  } catch { /* tasks/ 不存在，无实体可同步 */ }

  // 先删该任务在所有栏目录里的软链
  for (const col of config.columns) {
    removeSymlinkInColumn(projectRoot, col.name, id);
  }

  // 在归属栏建软链（需同时有归属和实体）
  if (targetColumn && dirName) {
    const colDir = join(root, targetColumn);
    mkdirSync(colDir, { recursive: true });
    const linkPath = join(colDir, dirName);
    const target = relSymlinkTarget(dirName);
    if (existsSync(linkPath)) {
      try { unlinkSync(linkPath); } catch { /* 忽略 */ }
    }
    symlinkSync(target, linkPath, 'dir');
  }
}

/** 删某任务在某栏目录里的软链（按 id 匹配软链名前缀）。不存在则无操作。 */
function removeSymlinkInColumn(projectRoot: string, columnName: string, id: string): void {
  const colDir = join(kanbanDir(projectRoot), columnName);
  let entries: string[];
  try { entries = readdirSync(colDir); } catch { return; }
  for (const entry of entries) {
    const parsed = parseDirName(entry);
    if (parsed && parsed.id === id) {
      const full = join(colDir, entry);
      try {
        if (lstatSync(full).isSymbolicLink()) unlinkSync(full);
      } catch { /* 忽略 */ }
    }
  }
}

/** 删某任务在所有栏目录里的软链（delete 时用）。 */
export function removeSymlinksForTask(projectRoot: string, id: string, config: BoardConfig): void {
  for (const col of config.columns) {
    removeSymlinkInColumn(projectRoot, col.name, id);
  }
}

/**
 * 全量重建所有栏目录的软链以匹配 board.yml（migrate/sync/孤儿修复用）。
 * 同时修复孤儿：实体在 tasks/ 但不在任何 order[栏] → 归 backlog 并落盘 order。
 * 返回是否修改了 config（调用方据此决定是否 writeBoardConfig）。
 */
export function rebuildAllSymlinks(projectRoot: string): { config: BoardConfig; changed: boolean } {
  let config = readBoardConfig(projectRoot);
  const root = kanbanDir(projectRoot);
  const tdir = tasksDir(projectRoot);

  // 1. 清空所有栏目录里的软链（不动实体、不动非软链文件如 .DS_Store）
  for (const col of config.columns) {
    const colDir = join(root, col.name);
    let entries: string[] = [];
    try { entries = readdirSync(colDir); } catch { continue; }
    for (const entry of entries) {
      const full = join(colDir, entry);
      try {
        if (lstatSync(full).isSymbolicLink()) unlinkSync(full);
      } catch { /* 忽略 */ }
    }
  }

  // 2. 扫 tasks/ 实体，构造 id → dirName
  let entityEntries: string[] = [];
  try { entityEntries = readdirSync(tdir); } catch { /* tasks/ 不存在 */ }
  const idToDirName: Record<string, string> = {};
  const entityIds: string[] = [];
  for (const entry of entityEntries) {
    const parsed = parseDirName(entry);
    if (!parsed) continue;
    const full = join(tdir, entry);
    try { if (!lstatSync(full).isDirectory()) continue; } catch { continue; }
    idToDirName[parsed.id] = entry;
    entityIds.push(parsed.id);
  }

  // 3. 反查 order，构造 id → column；孤儿标记
  const idToCol: Record<string, string> = {};
  const knownIds = new Set<string>();
  for (const col of config.columns) {
    for (const id of config.order[col.name] ?? []) {
      idToCol[id] = col.name;
      knownIds.add(id);
    }
  }

  // 4. 孤儿修复：实体存在但不在 order → 归 backlog，落盘
  let changed = false;
  const backlog = config.columns[0]?.name;
  for (const id of entityIds) {
    if (!knownIds.has(id)) {
      if (!backlog) continue;
      idToCol[id] = backlog;
      config.order[backlog] = [...(config.order[backlog] ?? []), id];
      changed = true;
    }
  }

  // 5. 按 idToCol 在各栏建软链
  for (const id of entityIds) {
    const col = idToCol[id];
    const dirName = idToDirName[id];
    if (!col || !dirName) continue;
    const colDir = join(root, col);
    mkdirSync(colDir, { recursive: true });
    const linkPath = join(colDir, dirName);
    const target = relSymlinkTarget(dirName);
    if (existsSync(linkPath)) {
      try { unlinkSync(linkPath); } catch { /* 忽略 */ }
    }
    symlinkSync(target, linkPath, 'dir');
  }

  // 6. 清理 order 里指向已不存在实体的 id（防止幽灵）
  for (const col of config.columns) {
    const before = config.order[col.name] ?? [];
    const after = before.filter(id => entityIds.includes(id));
    if (before.length !== after.length) {
      config.order[col.name] = after;
      changed = true;
    }
  }

  return { config, changed };
}
