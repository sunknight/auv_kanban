import { locateById } from './locate.js';
import { readBoardConfig, writeBoardConfig } from './board-yml.js';
import { syncSymlinks } from './sync.js';

/**
 * 移动任务到目标栏，可选指定落入目标栏的位置（toIndex）。
 *
 * - 跨栏：从源栏 order 移除，插入目标栏 order 的 toIndex（默认末尾）。
 *   toIndex 会对目标栏（已移除源 id 后）的长度做夹断，避免越界。
 * - 同栏 + 给定 toIndex：在所在栏内重排（移除后插到 toIndex）。
 * - 同栏 + 未给 toIndex：幂等不报错（保持原位）。
 *
 * 无论哪种情况都只改 board.yml 的 order（归属的唯一来源），实体目录不动。
 */
export async function moveTask(
  projectRoot: string,
  id: string,
  toColumn: string,
  toIndex?: number,
): Promise<void> {
  const config = readBoardConfig(projectRoot);
  if (!config.columns.some(c => c.name === toColumn)) {
    throw new Error(`栏 "${toColumn}" 不存在`);
  }
  const loc = locateById(projectRoot, id);
  if (!loc) throw new Error(`任务 ${id} 不存在`);
  if (loc.column === toColumn && toIndex === undefined) return; // 同栏幂等

  // 从源栏 order 移除该 id
  config.order[loc.column] = (config.order[loc.column] ?? []).filter(x => x !== id);

  // 插入目标栏 order：toIndex 夹断到 [0, 目标栏当前长度]
  const target = (config.order[toColumn] ?? []).filter(x => x !== id);
  let idx = toIndex ?? target.length;
  if (idx < 0) idx = 0;
  if (idx > target.length) idx = target.length;
  target.splice(idx, 0, id);
  config.order[toColumn] = target;

  writeBoardConfig(projectRoot, config);

  // 写时同步软链：跨栏时删旧栏软链、在新栏建软链；同栏重排不影响软链但 sync 幂等
  if (loc.column !== toColumn) {
    syncSymlinks(projectRoot, id, config);
  }
}
