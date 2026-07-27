import { createTask } from '../../core/task-crud.js';
import { resolveProjectRoot } from '../../core/paths.js';

export const newCommand = {
  command: 'new <name>',
  describe: '在 backlog 创建新任务',
  builder: (yargs: any) => yargs.positional('name', { type: 'string', demandOption: true }),
  handler: async (argv: any) => {
    const t = await createTask(resolveProjectRoot(), argv.name);
    console.log(`已创建任务：${t.id} ${t.name}（${t.path}）`);
  },
};
