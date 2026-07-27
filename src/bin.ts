import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { initBoardCommand } from './cli/commands/init.js';
import { showCommand } from './cli/commands/show.js';
import { listCommand } from './cli/commands/list.js';
import { newCommand } from './cli/commands/new.js';
import { moveCommand } from './cli/commands/move.js';
import { checkCommand } from './cli/commands/check.js';
import { updateCommand } from './cli/commands/update.js';
import { deleteCommand } from './cli/commands/delete.js';
import { archiveCommand } from './cli/commands/archive.js';
import { progressCommand } from './cli/commands/progress.js';
import { projectsCommand } from './cli/commands/projects.js';
import { serveCommand } from './cli/commands/serve.js';
import { skillCommand } from './cli/commands/skill.js';
import { syncCommand } from './cli/commands/sync.js';

// 统一兜底：把 handler 抛出的用户级错误（如找不到 .kanban）输出为一行提示，
// 而非 Node 默认的完整 stack trace。
try {
  yargs(hideBin(process.argv))
    .scriptName('kanban')
    .command(initBoardCommand)
    .command(showCommand)
    .command(listCommand)
    .command(newCommand)
    .command(moveCommand)
    .command(checkCommand)
    .command(updateCommand)
    .command(deleteCommand)
    .command(archiveCommand)
    .command(progressCommand)
    .command(projectsCommand)
    .command(serveCommand)
    .command(skillCommand)
    .command(syncCommand)
    .demandCommand(1)
    .strict()
    .parse();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
