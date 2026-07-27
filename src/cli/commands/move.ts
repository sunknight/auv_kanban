import { moveTask } from '../../core/move.js';
import { resolveProjectRoot } from '../../core/paths.js';

export const moveCommand = {
  command: 'move <id> <column>',
  describe: '移动任务到指定栏',
  builder: (yargs: any) => yargs
    .positional('id', { type: 'string', demandOption: true })
    .positional('column', { type: 'string', demandOption: true }),
  handler: async (argv: any) => {
    await moveTask(resolveProjectRoot(), argv.id, argv.column);
    console.log(`已移动 ${argv.id} → ${argv.column}`);
  },
};
