import { rebuildAllSymlinks } from '../../core/sync.js';
import { writeBoardConfig } from '../../core/board-yml.js';
import { resolveProjectRoot } from '../../core/paths.js';
import { isWindows } from '../../core/platform.js';

export const syncCommand = {
  command: 'sync',
  describe: '重建栏软链以对齐 board.yml（修复断链/孤儿，幂等）',
  builder: (yargs: any) => yargs,
  handler: async () => {
    const root = resolveProjectRoot();
    const { config, changed } = rebuildAllSymlinks(root);
    // rebuildAllSymlinks：
    //   - 非 Windows：总是全量重建栏软链（清空后按 board.yml 重建），软链侧总有动作；
    //     changed 仅反映 board.yml 是否被修正（孤儿归 backlog 或清除幽灵 id）
    //   - Windows：不碰软链，仅做纯数据自愈（等价 reconcileBoardConfig）
    if (changed) {
      writeBoardConfig(root, config);
    }
    if (isWindows) {
      console.log(changed
        ? 'Windows 下栏视图不使用软链（已跳过软链重建）；已修正 board.yml（孤儿任务归 backlog 或清除幽灵 id）'
        : 'Windows 下栏视图不使用软链（已跳过软链重建）；board.yml 无需修正');
    } else {
      console.log(changed
        ? '已重建栏软链，并修正 board.yml（孤儿任务归 backlog 或清除幽灵 id）'
        : '已重建栏软链，board.yml 无需修正');
    }
  },
};
