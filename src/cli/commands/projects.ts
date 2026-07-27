import { listProjects, addProject, removeProject, renameProject } from '../../core/projects.js';
import { resolve } from 'path';

export const projectsCommand = {
  command: 'projects [action] [path] [name]',
  describe: '管理全局项目列表',
  builder: (yargs: any) => yargs
    .positional('action', { type: 'string', choices: ['add', 'remove', 'rename'] })
    .positional('path', { type: 'string' })
    .positional('name', { type: 'string', describe: '新名称（仅 rename 用）' }),
  handler: (argv: any) => {
    if (!argv.action) {
      const list = listProjects();
      if (list.length === 0) { console.log('(无项目)'); return; }
      for (const p of list) console.log(`${p.name}\t${p.path}`);
      return;
    }
    if (argv.action === 'add') {
      addProject(resolve(argv.path ?? '.'));
      console.log('已添加');
    } else if (argv.action === 'remove') {
      removeProject(resolve(argv.path ?? '.'));
      console.log('已移除');
    } else if (argv.action === 'rename') {
      if (!argv.name) { console.error('用法：kanban projects rename <path> <name>'); process.exit(1); }
      renameProject(resolve(argv.path ?? '.'), argv.name);
      console.log('已改名');
    }
  },
};
