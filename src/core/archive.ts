import { mkdirSync, renameSync } from 'fs';
import { locateById } from './locate.js';
import { readBoardConfig, writeBoardConfig } from './board-yml.js';
import { removeSymlinksForTask } from './sync.js';
import { archiveDir, taskEntityPath, archivedEntityPath } from './paths.js';

/**
 * 存档任务：把实体从 tasks/ 物理移动到 archive/，从看板隐藏但保留目录与文档。
 *
 * 对 core 零侵入——不动 board.yml schema、不修改 locate/sync：
 * - 实体移出 tasks/ 后，locateAll（只扫 tasks/）自然不再列出；
 * - rebuildAllSymlinks 也只扫 tasks/，不会把 archive/ 里的实体当孤儿复活。
 *
 * 与 deleteTask 的区别仅在第 1 步：delete 用 rmSync 删除，archive 用 rename 保留。
 * ID 不回收（与 delete 一致）。
 */
export async function archiveTask(projectRoot: string, id: string): Promise<void> {
  const loc = locateById(projectRoot, id);
  if (!loc) throw new Error(`任务 ${id} 不存在`);
  const config = readBoardConfig(projectRoot);

  // 1. 实体从 tasks/ 移到 archive/（保留目录与文档）
  mkdirSync(archiveDir(projectRoot), { recursive: true });
  renameSync(taskEntityPath(projectRoot, loc.dirName), archivedEntityPath(projectRoot, loc.dirName));

  // 2. 清除所有栏软链
  removeSymlinksForTask(projectRoot, id, config);

  // 3. 从 order/tasks 移除（next-id 不变，ID 不回收）
  if (config.order[loc.column]) {
    config.order[loc.column] = config.order[loc.column].filter(x => x !== id);
  }
  if (config.tasks) {
    delete config.tasks[id];
  }
  writeBoardConfig(projectRoot, config);
}
