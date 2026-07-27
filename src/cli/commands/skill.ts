import { existsSync, mkdirSync, symlinkSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const skillCommand = {
  command: 'skill install',
  describe: '把 SKILL.md 安装到 ~/.zcode/skills/kanban/',
  builder: (yargs: any) => yargs,
  handler: () => {
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
