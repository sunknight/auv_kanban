import { appendSubtask } from '../../core/update.js';
import { moveTask } from '../../core/move.js';
import { resolveProjectRoot } from '../../core/paths.js';

export const updateCommand = {
  command: 'update <id> <需求..>',
  describe: '对任务追加一条补充需求（写入 ## 子任务，带 [补充] 标签）并重开到 doing。加 --run 则追加后立即执行刚追加的这条',
  builder: (yargs: any) => yargs
    .positional('id', { type: 'string', demandOption: true })
    // variadic positional：所有 id 之后的 token 都收进数组，支持含空格的需求文本
    .positional('需求', { type: 'string', demandOption: true })
    .option('run', {
      alias: 'r',
      type: 'boolean',
      default: false,
      describe: '追加后立即执行刚追加的这条子任务（而非仅重开等待 /kanban run）',
    }),
  handler: async (argv: any) => {
    const root = resolveProjectRoot();
    const id = String(argv.id);

    // 需求 token：variadic 时是数组，单个时也可能是字符串，统一成数组拼接
    const raw = Array.isArray(argv['需求']) ? argv['需求'] : [argv['需求']];
    const text = raw.map(String).join(' ').trim();
    if (!text) {
      console.error('用法: kanban update [--run] <id> <需求文本>');
      process.exit(1);
    }

    const no = await appendSubtask(root, id, text, '补充');
    // 重开到 doing（无论原栏，含 done；同栏幂等）
    await moveTask(root, id, 'doing');
    if (argv.run) {
      // 立即执行信号：明确告诉调用方（agent）现在就按 run 流程处理刚追加的编号，
      // 而非仅重开。--run 与 --no-run（默认）对应"补了就做"vs"补了稍后做"。
      console.log(`已追加补充需求并重开，立即执行 → 子任务 ${no}`);
      console.log(`  本轮目标：${text}`);
      console.log(`  （按 SKILL.md run 流程：增量实现刚追加的 ${no}，完成后 kanban check ${id} ${no}）`);
    } else {
      console.log(`已追加补充需求并重开 → /kanban run ${id}`);
      console.log(`  新子任务编号 ${no}（完成执行后用 kanban check ${id} ${no} 勾上）`);
    }
  },
};
