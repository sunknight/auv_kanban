import { toggleSubtask } from '../../core/check.js';
import { resolveProjectRoot } from '../../core/paths.js';

export const checkCommand = {
  command: 'check <id> <编号>',
  describe: 'toggle 指定编号子任务的勾选（编号为 2 位数字，如 03）',
  builder: (yargs: any) => yargs
    .positional('id', { type: 'string', demandOption: true })
    .positional('编号', { type: 'string', demandOption: true }),
  handler: async (argv: any) => {
    await toggleSubtask(resolveProjectRoot(), argv.id, argv.编号);
    console.log(`已 toggle ${argv.id} 的子任务 ${argv.编号}`);
  },
};
