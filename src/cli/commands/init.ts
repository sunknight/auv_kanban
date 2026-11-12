import { resolve } from 'path';
import { initBoard } from '../../core/init-board.js';
import { addProject } from '../../core/projects.js';
import { centralizeProject } from '../../core/centralize.js';
import { isWindows } from '../../core/platform.js';

export const initBoardCommand = {
  command: 'init [project] [--local]',
  describe: '在指定项目（默认当前目录）创建看板并注册到全局 config；默认集中到 ~/.kanban/boards/（--local 留在项目内）',
  builder: (yargs: any) => yargs
    .positional('project', { type: 'string', default: '.' })
    .option('local', { type: 'boolean', default: false, describe: '看板数据留在项目 .kanban 真实目录（不集中）' }),
  handler: async (argv: any) => {
    const projectRoot = resolve(argv.project);
    await initBoard(projectRoot);
    addProject(projectRoot);
    if (argv.local || isWindows) {
      // Windows 无 symlink 权限，自动降级本地模式（用户显式 --local 时无需额外提示）
      if (isWindows && !argv.local) console.log('Windows 不支持集中模式，已自动使用本地模式。');
      console.log(`已初始化看板（本地模式）：${projectRoot}/.kanban`);
    } else {
      // 组合复用：先按现状建真实 .kanban，再整体迁到中心留软链——initBoard 零改动
      const r = centralizeProject(projectRoot);
      console.log(`已初始化看板：${projectRoot}/.kanban → ${r.boardDir}`);
      if (r.gitignore === 'appended') console.log('已在 .gitignore 追加 `.kanban` 规则（带斜杠规则匹配不到软链文件）');
    }
    console.log('已注册到全局 config。');
  },
};
