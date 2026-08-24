import { setTodoDone } from '../../core/todo.js';
import { resolveProjectRoot } from '../../core/paths.js';

export const todoCheckCommand = {
  command: 'todo-check <id> <编号>',
  describe: '勾选指定编号的 todo 延后事项（todo.md，设为已完成）。编号为 2 位数字，如 03；取消用 kanban todo-uncheck',
  builder: (yargs: any) => yargs
    .positional('id', { type: 'string', demandOption: true })
    .positional('编号', { type: 'string', demandOption: true }),
  handler: async (argv: any) => {
    await setTodoDone(resolveProjectRoot(), argv.id, argv.编号, true);
    console.log(`已勾选 ${argv.id} 的 todo 事项 ${argv.编号}`);
  },
};
