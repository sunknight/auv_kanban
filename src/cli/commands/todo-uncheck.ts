import { setTodoDone } from '../../core/todo.js';
import { resolveProjectRoot } from '../../core/paths.js';

export const todoUncheckCommand = {
  command: 'todo-uncheck <id> <编号>',
  describe: '取消勾选指定编号的 todo 延后事项（todo.md，设为未完成）。编号为 2 位数字，如 03；勾选用 kanban todo-check',
  builder: (yargs: any) => yargs
    .positional('id', { type: 'string', demandOption: true })
    .positional('编号', { type: 'string', demandOption: true }),
  handler: async (argv: any) => {
    await setTodoDone(resolveProjectRoot(), argv.id, argv.编号, false);
    console.log(`已取消勾选 ${argv.id} 的 todo 事项 ${argv.编号}`);
  },
};
