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
      // 有未完成 todo（延后事项）时行尾加标记，done 栏任务也照标——提醒还有遗留
      const pendingTodos = t.todos.filter(x => !x.done).length;
      const todoMark = pendingTodos > 0 ? `  [todo:${pendingTodos}]` : '';
      console.log(`${t.id}  [${t.column}]  ${t.progress[0]}/${t.progress[1]}${todoMark}  ${t.name}`);
    }
  },
};
