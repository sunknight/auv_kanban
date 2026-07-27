import { getTask } from '../../core/task-crud.js';
import { resolveProjectRoot } from '../../core/paths.js';

export const progressCommand = {
  command: 'progress <id>',
  describe: '显示某任务的子任务进度',
  builder: (yargs: any) => yargs.positional('id', { type: 'string', demandOption: true }),
  handler: (argv: any) => {
    const t = getTask(resolveProjectRoot(), argv.id);
    if (!t) { console.error(`任务 ${argv.id} 不存在`); process.exit(1); }
    console.log(`${t.id} ${t.name}: ${t.progress[0]}/${t.progress[1]}`);
  },
};
