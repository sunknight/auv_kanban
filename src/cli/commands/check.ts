import { setSubtaskDone } from '../../core/check.js';
import { resolveProjectRoot } from '../../core/paths.js';

export const checkCommand = {
  command: 'check <id> <编号>',
  describe: '勾选指定编号子任务（设为已完成）。编号为 2 位数字，如 03；取消勾选用 kanban uncheck',
  builder: (yargs: any) => yargs
    .positional('id', { type: 'string', demandOption: true })
    .positional('编号', { type: 'string', demandOption: true }),
  handler: async (argv: any) => {
    await setSubtaskDone(resolveProjectRoot(), argv.id, argv.编号, true);
    console.log(`已勾选 ${argv.id} 的子任务 ${argv.编号}`);
  },
};
