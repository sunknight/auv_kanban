import { locateById } from './locate.js';
import { readBoardConfig, writeBoardConfig } from './board-yml.js';
import { syncSymlinks } from './sync.js';

export async function moveTask(projectRoot: string, id: string, toColumn: string): Promise<void> {
  const config = readBoardConfig(projectRoot);
  if (!config.columns.some(c => c.name === toColumn)) {
    throw new Error(`栏 "${toColumn}" 不存在`);
  }
  const loc = locateById(projectRoot, id);
  if (!loc) throw new Error(`任务 ${id} 不存在`);
  if (loc.column === toColumn) return; // 同栏幂等

  // 只改 order（归属的唯一来源），实体不动
  config.order[loc.column] = (config.order[loc.column] ?? []).filter(x => x !== id);
  config.order[toColumn] = [...(config.order[toColumn] ?? []), id];
  writeBoardConfig(projectRoot, config);

  // 写时同步软链：删旧栏软链、在新栏建软链
  syncSymlinks(projectRoot, id, config);
}
