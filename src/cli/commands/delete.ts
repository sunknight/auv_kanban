import { deleteTask } from '../../core/task-crud.js';
import { resolveProjectRoot } from '../../core/paths.js';

export const deleteCommand = {
  command: 'delete <id>',
  describe: '删除任务（实体目录，ID 不回收）',
  builder: (yargs: any) => yargs.positional('id', { type: 'string', demandOption: true }),
  handler: async (argv: any) => {
    await deleteTask(resolveProjectRoot(), argv.id);
    console.log(`已删除任务 ${argv.id}`);
  },
};
