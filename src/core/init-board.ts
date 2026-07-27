import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { kanbanDir, tasksDir, archiveDir } from './paths.js';
import { defaultBoardConfig, readBoardConfig, writeBoardConfig } from './board-yml.js';

export async function initBoard(projectRoot: string): Promise<void> {
  const root = kanbanDir(projectRoot);
  mkdirSync(root, { recursive: true });

  // 读现有 config（若无则默认），保证幂等
  const config = existsSync(join(root, 'board.yml'))
    ? readBoardConfig(projectRoot)
    : defaultBoardConfig();

  // 确保所有栏目录存在
  for (const col of config.columns) {
    mkdirSync(join(root, col.name), { recursive: true });
  }
  // 确保任务实体统一目录存在
  mkdirSync(tasksDir(projectRoot), { recursive: true });
  // 确保存档目录存在（存档任务的实体物理归宿）
  mkdirSync(archiveDir(projectRoot), { recursive: true });

  writeBoardConfig(projectRoot, config);
}
