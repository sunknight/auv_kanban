import { existsSync, mkdirSync, symlinkSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { isWindows } from '../../core/platform.js';
import {
  SKILL_TARGETS,
  parseAgentArg,
  detectInstalled,
  skillsDirOf,
  installDstOf,
} from '../../core/skill-targets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 安装源：随 npm 包发布的 skill/kanban 目录。
 * 路径回溯：dist/cli/commands/ → .. → dist/cli/ → .. → dist/ → .. → 包根 → skill/kanban
 */
function skillSrc(): string {
  return join(__dirname, '..', '..', '..', 'skill', 'kanban');
}

export const skillCommand = {
  command: 'skill install',
  describe:
    '把 SKILL.md 安装到各 agent 的 skills 目录（软链到源）。默认探测本机已安装的 agent 全装',
  builder: (yargs: any) =>
    yargs
      .option('agent', {
        type: 'string',
        describe: '只给指定 agent 装（逗号分隔，如 --agent claude,codex）',
      })
      .option('list', {
        type: 'boolean',
        default: false,
        describe: '只列出探测到的 agent，不安装',
      })
      .option('all', {
        type: 'boolean',
        default: false,
        describe: '给全部已知 agent 装（目录不存在则创建）',
      }),
  handler: (argv: any) => {
    const src = skillSrc();

    // --list：打印探测结果表格，不安装
    if (argv.list) {
      printList();
      return;
    }

    // 确定本次安装目标 id 列表
    let ids: string[];
    if (argv.agent) {
      ids = parseAgentArg(String(argv.agent)); // 内含未知 id 校验
    } else if (argv.all) {
      ids = SKILL_TARGETS.map((t) => t.id);
    } else {
      ids = detectInstalled().map((t) => t.id);
      if (ids.length === 0) {
        console.error(
          '未探测到任何已安装的 agent。用 `kanban skill install --agent <id>` 指定，或 `--all` 给全部已知 agent 安装。',
        );
        process.exit(1);
      }
    }

    if (isWindows) {
      // Windows 普通用户无 symlink 权限，对每个选中目标打印手动复制指引
      for (const id of ids) printWindowsGuide(id);
      return;
    }

    // macOS/Linux：逐个软链到源
    const home = homedir();
    let ok = 0;
    let skipped = 0;
    for (const id of ids) {
      const skillsDir = skillsDirOf(id, home);
      const dst = installDstOf(id, home);
      // 确保父级 skills 目录存在（--agent 指定的 agent 目录可能尚未创建）
      mkdirSync(skillsDir, { recursive: true });
      if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
      try {
        symlinkSync(src, dst);
        console.log(`已安装 Skill（${id}）：${dst} → ${src}`);
        ok++;
      } catch (e) {
        console.error(`安装失败（${id}）：${dst} → ${(e as Error).message}`);
        skipped++;
      }
    }
    console.log(`完成：成功 ${ok}，失败 ${skipped}。`);
  },
};

/** 打印探测结果表格（id | skills 目录 | 是否探测到）。 */
function printList(): void {
  const detected = new Set(detectInstalled().map((t) => t.id));
  const home = homedir();
  const rows = SKILL_TARGETS.map((t) => [
    t.id,
    join(home, t.dir),
    detected.has(t.id) ? 'yes' : 'no',
  ]);
  // 计算列宽（第二列目录可能很长，留足）
  const w0 = Math.max(3, ...rows.map((r) => r[0].length));
  const w1 = Math.max(10, ...rows.map((r) => r[1].length));
  console.log(`${'ID'.padEnd(w0)}  ${'skills 目录'.padEnd(w1)}  已安装`);
  console.log(`${'-'.repeat(w0)}  ${'-'.repeat(w1)}  -------`);
  for (const [id, dir, det] of rows) {
    console.log(`${id.padEnd(w0)}  ${dir.padEnd(w1)}  ${det}`);
  }
}

/**
 * Windows 下对单个 agent 打印手动安装指引。
 * 不自动建软链是因为目标目录在 Windows 上需管理员/开发者模式权限，
 * 让用户明确执行一次复制更可控。
 */
function printWindowsGuide(id: string): void {
  const src = join(skillSrc(), 'SKILL.md');
  const dstDir = installDstOf(id);
  console.log(
    [
      `Windows 下不自动创建软链（${id}，需管理员/开发者模式权限），请手动复制：`,
      '',
      '  1. 新建目录（PowerShell）：',
      `       New-Item -ItemType Directory -Force -Path "${dstDir}"`,
      '',
      '  2. 复制 SKILL.md：',
      `       Copy-Item "${src}" -Destination "${dstDir}\\"`,
      '',
      `  源文件（随 npm 包发布）：${src}`,
      `  目标：${dstDir}\\SKILL.md`,
      '',
    ].join('\n'),
  );
}
