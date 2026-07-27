import { resolve } from 'path';
import { initBoard } from '../../core/init-board.js';
import { addProject } from '../../core/projects.js';

export const initBoardCommand = {
  command: 'init [project]',
  describe: '在指定项目（默认当前目录）创建 .kanban、默认四栏、board.yml，并注册到全局 config',
  builder: (yargs: any) => yargs.positional('project', { type: 'string', default: '.' }),
  handler: async (argv: any) => {
    const projectRoot = resolve(argv.project);
    await initBoard(projectRoot);
    addProject(projectRoot);
    console.log(`已初始化看板：${projectRoot}/.kanban`);
    console.log('已注册到全局 config。');
  },
};
