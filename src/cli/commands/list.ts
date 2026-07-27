import { listTasks } from '../../core/task-crud.js';
import { resolveProjectRoot } from '../../core/paths.js';

export const listCommand = {
  command: 'list',
  describe: '列出任务',
  builder: (yargs: any) => yargs.option('column', { type: 'string', alias: '栏' }),
  handler: (argv: any) => {
    const all = listTasks(resolveProjectRoot());
    const filtered = argv.column ? all.filter(t => t.column === argv.column) : all;
    if (filtered.length === 0) { console.log('(无任务)'); return; }
    for (const t of filtered) {
      console.log(`${t.id}  [${t.column}]  ${t.progress[0]}/${t.progress[1]}  ${t.name}`);
    }
  },
};
