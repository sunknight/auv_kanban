import { archiveTask } from '../../core/archive.js';
import { resolveProjectRoot } from '../../core/paths.js';

export const archiveCommand = {
  command: 'archive <id>',
  describe: '存档任务：从看板隐藏但保留目录与文档（移到 .kanban/archive/）',
  builder: (yargs: any) => yargs.positional('id', { type: 'string', demandOption: true }),
  handler: async (argv: any) => {
    await archiveTask(resolveProjectRoot(), argv.id);
    console.log(`已存档任务 ${argv.id}（实体移到 .kanban/archive/）`);
  },
};
