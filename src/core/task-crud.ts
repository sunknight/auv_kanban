import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Task } from './types.js';
import { taskEntityPath } from './paths.js';
import { readBoardConfig, writeBoardConfig } from './board-yml.js';
import { allocateId, buildDirName, sanitizeName } from './task-id.js';
import { locateById, locateAll } from './locate.js';
import { parseMainMd, serializeMainMd } from './main-md.js';
import { computeProgress } from './progress.js';
import { syncSymlinks, removeSymlinksForTask } from './sync.js';

const MAIN_TEMPLATE = (name: string) => `# ${name}

## 描述


## 提示词


## 子任务
`;

export async function createTask(projectRoot: string, name: string, column = 'backlog'): Promise<Task> {
  let config = readBoardConfig(projectRoot);
  const { id, config: newConfig } = allocateId(config);
  config = newConfig;

  const dirName = buildDirName(id, sanitizeName(name));
  const taskPath = taskEntityPath(projectRoot, dirName); // .kanban/tasks/<dir>
  mkdirSync(taskPath, { recursive: true });
  writeFileSync(join(taskPath, 'main.md'), MAIN_TEMPLATE(name), 'utf8');

  // 更新 order：新任务默认放该栏末尾；记录 created 元数据
  config.order[column] = [...(config.order[column] ?? []), id];
  config.tasks = { ...(config.tasks ?? {}), [id]: { created: new Date().toISOString() } };
  writeBoardConfig(projectRoot, config);

  // 栏目录建软链
  syncSymlinks(projectRoot, id, config);

  return getTask(projectRoot, id)!;
}

export function getTask(projectRoot: string, id: string): Task | null {
  const loc = locateById(projectRoot, id);
  if (!loc) return null;
  const mainPath = join(loc.path, 'main.md');
  let main = null;
  if (existsSync(mainPath)) {
    try {
      main = parseMainMd(readFileSync(mainPath, 'utf8'));
    } catch { main = null; }
  }
  return {
    ...loc,
    main,
    progress: main ? computeProgress(main) : [0, 0],
  };
}

export function listTasks(projectRoot: string): Task[] {
  const config = readBoardConfig(projectRoot);
  const all = locateAll(projectRoot);
  // 按 board.yml 的 order 排序：order 里靠前的在前，未列出的按 dirName 字母序补末尾
  return all.sort((a, b) => {
    const oa = config.order[a.column]?.indexOf(a.id) ?? -1;
    const ob = config.order[b.column]?.indexOf(b.id) ?? -1;
    if (oa !== -1 && ob !== -1) return oa - ob;
    if (oa !== -1) return -1;
    if (ob !== -1) return 1;
    return a.dirName.localeCompare(b.dirName);
  }).map(loc => getTask(projectRoot, loc.id)!).filter(Boolean);
}

export async function deleteTask(projectRoot: string, id: string): Promise<void> {
  const loc = locateById(projectRoot, id);
  if (!loc) throw new Error(`任务 ${id} 不存在`);
  const config = readBoardConfig(projectRoot);

  // 删 tasks/ 实体 + 所有栏软链
  rmSync(taskEntityPath(projectRoot, loc.dirName), { recursive: true, force: true });
  removeSymlinksForTask(projectRoot, id, config);

  // 从 order/tasks 移除（next-id 不变，ID 不回收）
  if (config.order[loc.column]) {
    config.order[loc.column] = config.order[loc.column].filter(x => x !== id);
  }
  if (config.tasks) {
    delete config.tasks[id];
  }
  writeBoardConfig(projectRoot, config);
}

/**
 * 整体更新任务内容（标题/描述/提示词/子任务）。
 * 标题与目录名解耦：只重写 main.md 的 H1，**不重命名目录**。
 * 采用"读最新 → 序列化 → 写回"策略。
 */
export async function updateTaskContent(
  projectRoot: string,
  id: string,
  input: { title: string; description: string; prompt: string; subtasks: { no?: string; tag?: string; text: string; done: boolean }[] },
): Promise<Task> {
  const loc = locateById(projectRoot, id);
  if (!loc) throw new Error(`任务 ${id} 不存在`);

  // 写 main.md（serializeMainMd 整体重写，含新 H1）。实体目录永不改名。
  const mainPath = join(loc.path, 'main.md');
  writeFileSync(mainPath, serializeMainMd(input), 'utf8');

  return getTask(projectRoot, id)!;
}
