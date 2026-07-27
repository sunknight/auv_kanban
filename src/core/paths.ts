import { homedir } from 'os';
import { join, resolve, dirname, isAbsolute } from 'path';
import { existsSync } from 'fs';

/** 项目根下的看板数据目录（固定 .kanban） */
export function kanbanDir(projectRoot: string): string {
  return join(projectRoot, '.kanban');
}

/**
 * 从 startDir（默认 process.cwd()）向上逐级查找最近的 .kanban 目录，
 * 命中的那一级即为项目根。多个 .kanban 时取最近的（最深）父目录。
 * 找不到抛错——调用方（CLI）应让进程退出并提示用户先 kanban init。
 */
export function resolveProjectRoot(startDir: string = process.cwd()): string {
  let dir = isAbsolute(startDir) ? startDir : resolve(startDir);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsSync(kanbanDir(dir))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `找不到 .kanban 目录（从 ${startDir} 向上查找无果）。请先在该项目根执行 \`kanban init\`。`,
      );
    }
    dir = parent;
  }
}

/** 全局 ~/.kanban 目录 */
export function globalKanbanDir(): string {
  return join(homedir(), '.kanban');
}

/** 全局 config.json 路径 */
export function globalConfigPath(): string {
  return join(globalKanbanDir(), 'config.json');
}

/** 任务实体统一目录（.kanban/tasks，实体永不移动） */
export function tasksDir(projectRoot: string): string {
  return join(kanbanDir(projectRoot), 'tasks');
}

/** 任务实体目录的绝对路径（.kanban/tasks/<dirName>） */
export function taskEntityPath(projectRoot: string, dirName: string): string {
  return join(tasksDir(projectRoot), dirName);
}

/** 存档目录（.kanban/archive）：存档任务的实体物理归宿，locate 不扫这里 */
export function archiveDir(projectRoot: string): string {
  return join(kanbanDir(projectRoot), 'archive');
}

/** 存档任务实体的绝对路径（.kanban/archive/<dirName>） */
export function archivedEntityPath(projectRoot: string, dirName: string): string {
  return join(archiveDir(projectRoot), dirName);
}
