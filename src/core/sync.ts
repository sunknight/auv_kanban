import { readdirSync, lstatSync, unlinkSync, symlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { kanbanDir, tasksDir } from './paths.js';
import { readBoardConfig } from './board-yml.js';
import { parseDirName } from './task-id.js';
import type { BoardConfig } from './types.js';
import { isWindows } from './platform.js';

/** 软链目标用相对路径：从 <栏目录>/<dirName> 指向 ../tasks/<dirName> */
function relSymlinkTarget(dirName: string): string {
  return join('..', 'tasks', dirName);
}

/**
 * 同步某任务的栏软链到与 board.yml 一致。
 * 删除该任务在所有栏目录里的旧软链，在"它归属的栏"目录建一个软链。
 * 调用方需保证 config 是最新读出的（不在此处重读，避免写覆盖）。
 *
 * Windows 下软链需要开发者模式或管理员权限，故一律跳过——
 * 主功能不依赖软链（数据真相源是 tasks/ + board.yml），跳过无影响。
 */
export function syncSymlinks(projectRoot: string, id: string, config: BoardConfig): void {
  if (isWindows) return;
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

/** 删某任务在所有栏目录里的软链（delete 时用）。Windows 下自动 no-op。 */
export function removeSymlinksForTask(projectRoot: string, id: string, config: BoardConfig): void {
  if (isWindows) return;
  for (const col of config.columns) {
    removeSymlinkInColumn(projectRoot, col.name, id);
  }
}

/**
 * 纯数据自愈：扫 tasks/ 与 board.yml.order 对齐，不碰任何软链。
 * 修复两类问题：
 *   - 孤儿：实体在 tasks/ 但不在任何 order → 归 backlog，落盘
 *   - 幽灵：order 里指向已不存在实体的 id → 清除，落盘
 * 返回是否修改了 config（调用方据此决定是否 writeBoardConfig）。
 *
 * 跨平台一致，Windows 上也照常执行（不涉及软链）。
 */
export function reconcileBoardConfig(projectRoot: string): { config: BoardConfig; changed: boolean } {
  return reconcileBoardConfigInto(projectRoot, readBoardConfig(projectRoot));
}

/**
 * 全量重建所有栏目录的软链以匹配 board.yml（含孤儿/幽灵自愈）。
 *
 * - Linux/macOS：与历史行为完全一致——清空栏软链 → 修复孤儿（实体不在 order → 归 backlog）
 *   → 清除幽灵（order 指向已删除实体）→ 按修复后的归属重建软链。一次调用做完。
 * - Windows：不碰任何软链（普通用户无 symlink 权限），降级为纯数据自愈
 *   （等价于 reconcileBoardConfig），返回的 config 供调用方落盘。
 *
 * 返回是否修改了 config（调用方据此决定是否 writeBoardConfig）。
 */
export function rebuildAllSymlinks(projectRoot: string): { config: BoardConfig; changed: boolean } {
  const config = readBoardConfig(projectRoot);

  // Windows：降级为纯数据自愈，不碰软链
  if (isWindows) {
    return reconcileBoardConfigInto(projectRoot, config);
  }

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

/**
 * 纯数据自愈的核心实现：接收一个已读出的 config（避免重复读盘），就地修复孤儿/幽灵。
 * 不碰任何软链，跨平台一致。reconcileBoardConfig 与 Windows 降级路径都走这里。
 */
function reconcileBoardConfigInto(projectRoot: string, config: BoardConfig): { config: BoardConfig; changed: boolean } {
  const tdir = tasksDir(projectRoot);

  // 扫 tasks/ 实体，构造 id 集合
  let entityEntries: string[] = [];
  try { entityEntries = readdirSync(tdir); } catch { /* tasks/ 不存在 */ }
  const entityIds: string[] = [];
  for (const entry of entityEntries) {
    const parsed = parseDirName(entry);
    if (!parsed) continue;
    const full = join(tdir, entry);
    try { if (!lstatSync(full).isDirectory()) continue; } catch { continue; }
    entityIds.push(parsed.id);
  }

  // 反查 order，构造已知 id 集合
  const knownIds = new Set<string>();
  for (const col of config.columns) {
    for (const id of config.order[col.name] ?? []) {
      knownIds.add(id);
    }
  }

  // 孤儿修复：实体存在但不在 order → 归 backlog，落盘
  let changed = false;
  const backlog = config.columns[0]?.name;
  for (const id of entityIds) {
    if (!knownIds.has(id)) {
      if (!backlog) continue;
      config.order[backlog] = [...(config.order[backlog] ?? []), id];
      changed = true;
    }
  }

  // 清理 order 里指向已不存在实体的 id（防止幽灵）
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
