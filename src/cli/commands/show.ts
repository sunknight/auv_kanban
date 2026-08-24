import { getTask } from '../../core/task-crud.js';
import { resolveProjectRoot } from '../../core/paths.js';

export const showCommand = {
  command: 'show <id>',
  describe: '显示任务详情：路径、栏、名称、描述、提示词、子任务清单',
  builder: (yargs: any) => yargs.positional('id', { type: 'string', demandOption: true }),
  handler: (argv: any) => {
    const root = resolveProjectRoot();
    const t = getTask(root, argv.id);
    if (!t) { console.error(`任务 ${argv.id} 不存在`); process.exit(1); }
    console.log(`路径: ${t.path}`);
    console.log(`栏: ${t.column}`);
    console.log(`ID: ${t.id}`);
    console.log(`名称: ${t.name}`);
    console.log(`进度: ${t.progress[0]}/${t.progress[1]}`);
    if (t.main) {
      console.log('\n--- 描述 ---');
      console.log(t.main.description || '(空)');
      console.log('\n--- 提示词 ---');
      console.log(t.main.prompt || '(空)');
      console.log('\n--- 子任务 ---');
      if (t.main.subtasks.length === 0) {
        console.log('(无子任务)');
      } else {
        for (const s of t.main.subtasks) {
          const tag = s.tag ? `[${s.tag}] ` : '';
          const no = s.no ? `${s.no} ` : '';
          console.log(`  [${s.done ? 'x' : ' '}] ${no}${tag}${s.text}`);
        }
      }
    } else {
      console.log('\n(缺少 main.md)');
    }
    if (t.todos.length > 0) {
      const pending = t.todos.filter(x => !x.done).length;
      console.log(`\n--- 延后事项 (todo.md) ---`);
      for (const d of t.todos) {
        const no = d.no ? `${d.no} ` : '';
        console.log(`  [${d.done ? 'x' : ' '}] ${no}${d.text}`);
      }
      console.log(`  （todo 进度：${t.todos.length - pending}/${t.todos.length}，未完成 ${pending}）`);
    }
  },
};
