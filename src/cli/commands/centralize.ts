import { resolve } from 'path';
import { centralizeProject, decentralizeProject } from '../../core/centralize.js';
import { readGlobalConfig } from '../../core/projects.js';

const STATUS_TEXT: Record<string, string> = {
  migrated: '已迁移',
  already: '已是集中（跳过）',
  relinked: '断链已修复',
  restored: '已迁回项目内',
  'already-local': '本就分散（跳过）',
};

/** 逐项目执行并输出汇总；单项目失败不中断 --all。返回是否有失败。 */
function runAll(label: string, fn: (path: string) => { status: string; boardDir?: string }): boolean {
  const projects = readGlobalConfig().projects;
  const lines: string[] = [];
  let failed = 0;
  for (const p of projects) {
    try {
      const r = fn(p.path);
      lines.push(`  ✓ ${p.name} — ${STATUS_TEXT[r.status] ?? r.status}${r.boardDir ? `（${r.boardDir}）` : ''}`);
    } catch (e) {
      failed++;
      lines.push(`  ✗ ${p.name} — ${(e as Error).message}`);
    }
  }
  console.log(`${label}（${projects.length} 个注册项目，失败 ${failed}）：`);
  console.log(lines.join('\n'));
  return failed > 0;
}

export const centralizeCommand = {
  command: 'centralize [project] [--all]',
  describe: '把项目 .kanban 整目录迁到 ~/.kanban/boards/<编号-项目名>/，原位置留软链（幂等可重跑）',
  builder: (yargs: any) => yargs
    .positional('project', { type: 'string', default: '.', describe: '项目根（默认当前目录）' })
    // 定位不用 resolveProjectRoot：断链软链时 existsSync 为 false 会找不到项目根，而断链修复正是本命令的职责之一
    .option('all', { type: 'boolean', default: false, describe: '对全部注册项目执行' }),
  handler: async (argv: any) => {
    if (argv.all) {
      const failed = runAll('集中迁移汇总', centralizeProject);
      if (failed) process.exitCode = 1;
      return;
    }
    const root = resolve(argv.project);
    const r = centralizeProject(root);
    console.log(`${STATUS_TEXT[r.status]}：${root}/.kanban → ${r.boardDir}`);
    if (r.gitignore === 'appended') console.log('已在该项目 .gitignore 追加 `.kanban` 规则（带斜杠规则匹配不到软链文件）');
  },
};

export const decentralizeCommand = {
  command: 'decentralize [project] [--all]',
  describe: '逆向：把中心看板目录迁回项目内真实目录，摘除软链（幂等）',
  builder: (yargs: any) => yargs
    .positional('project', { type: 'string', default: '.', describe: '项目根（默认当前目录）' })
    .option('all', { type: 'boolean', default: false, describe: '对全部注册项目执行' }),
  handler: async (argv: any) => {
    if (argv.all) {
      const failed = runAll('迁回本地汇总', decentralizeProject);
      if (failed) process.exitCode = 1;
      return;
    }
    const root = resolve(argv.project);
    const r = decentralizeProject(root);
    console.log(`${STATUS_TEXT[r.status]}${r.boardDir ? `：${r.boardDir} → ${root}/.kanban` : ''}`);
  },
};
