import { rebuildAllSymlinks } from '../../core/sync.js';
import { writeBoardConfig } from '../../core/board-yml.js';
import { resolveProjectRoot } from '../../core/paths.js';

export const syncCommand = {
  command: 'sync',
  describe: '重建所有栏软链以对齐 board.yml（修复断链/孤儿，幂等）',
  builder: (yargs: any) => yargs,
  handler: async () => {
    const root = resolveProjectRoot();
    const { config, changed } = rebuildAllSymlinks(root);
    // rebuildAllSymlinks 总是全量重建栏软链（清空后按 board.yml 重建），所以软链侧总有动作；
    // changed 仅反映 board.yml 是否被修正（孤儿归 backlog 或清除幽灵 id）
    if (changed) {
      writeBoardConfig(root, config);
      console.log('已重建栏软链，并修正 board.yml（孤儿任务归 backlog 或清除幽灵 id）');
    } else {
      console.log('已重建栏软链，board.yml 无需修正');
    }
  },
};
