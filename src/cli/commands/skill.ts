import { existsSync, mkdirSync, symlinkSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { isWindows } from '../../core/platform.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const skillCommand = {
  command: 'skill install',
  describe: '把 SKILL.md 安装到 ~/.zcode/skills/kanban/',
  builder: (yargs: any) => yargs,
  handler: () => {
    // Windows：普通用户无 symlink 权限，不自动安装，打印手动复制指引
    if (isWindows) {
      printWindowsManualGuide();
      return;
    }

    // src/cli/commands/skill.ts → dist/cli/commands/skill.js，回溯到包根的 skill/kanban
    // dist/cli/commands/ → .. → dist/cli/ → .. → dist/ → .. → 包根
    const src = join(__dirname, '..', '..', '..', 'skill', 'kanban');
    const dst = join(homedir(), '.zcode', 'skills', 'kanban');
    mkdirSync(join(homedir(), '.zcode', 'skills'), { recursive: true });
    if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
    symlinkSync(src, dst);
    console.log(`已安装 Skill：${dst} → ${src}`);
  },
};

/**
 * Windows 下手动安装指引。
 * 不自动复制是因为目标目录 ~/.zcode/skills/kanban 在 Windows 上是 C:\Users\<你>\.zcode\...，
 * 让用户明确执行一次复制更可控，也避免权限/路径转义问题。
 */
function printWindowsManualGuide(): void {
  const src = join(__dirname, '..', '..', '..', 'skill', 'kanban', 'SKILL.md');
  const dstDir = join(homedir(), '.zcode', 'skills', 'kanban');
  console.log(
    [
      'Windows 下不自动创建软链（需要管理员/开发者模式权限），请手动复制：',
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
      '  装好后 ZCode 智能体里即可用 /kanban run <ID>。',
    ].join('\n'),
  );
}
