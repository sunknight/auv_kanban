import {
  appendFileSync, cpSync, existsSync, lstatSync, mkdirSync,
  readFileSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'fs';
import { basename, join, resolve } from 'path';
import { globalKanbanDir, kanbanDir } from './paths.js';
import { ensureProjectNo, readGlobalConfig } from './projects.js';
import { isWindows } from './platform.js';

/** 集中看板根目录 ~/.kanban/boards */
export function centralBoardsDir(): string {
  return join(globalKanbanDir(), 'boards');
}

/**
 * 项目对应的中心看板目录 ~/.kanban/boards/<编号-项目名>。
 * 编号未分配时先经 ensureProjectNo 分配（写回 config）；目录名创建时冻结，
 * 之后 renameProject 只改 config 的 name，中心目录不跟随改名。
 */
export function centralBoardDir(projectRoot: string): string {
  const abs = resolve(projectRoot);
  const no = ensureProjectNo(abs);
  const entry = readGlobalConfig().projects.find(p => p.path === abs);
  return join(centralBoardsDir(), `${no}-${entry?.name ?? basename(abs)}`);
}

export interface CentralizeResult {
  project: string;
  /** migrated=本次迁移；already=已是软链且指向本项目中心；relinked=断链软链已修复 */
  status: 'migrated' | 'already' | 'relinked';
  /** 中心看板目录绝对路径 */
  boardDir: string;
  /** gitignore 处理：appended=追加了软链忽略规则；ok=本就能忽略；skipped=非 git 仓库 */
  gitignore: 'appended' | 'ok' | 'skipped';
}

/**
 * 把项目内 .kanban 整目录迁到 ~/.kanban/boards/<编号-项目名>/，原位置留绝对路径软链。
 * 幂等可重跑：
 * - .kanban 已是软链且指向本项目中心目录 → already（跳过）
 * - .kanban 是软链指向别处 → 抛错（不明意图，人工处理）
 * - .kanban 是断链软链 → 中心目录存在则重建软链（relinked），否则抛错
 * - .kanban 是真实目录但中心目录已存在 → 抛错（上次中断残留，人工确认后删中心再重跑）
 */
/**
 * 创建 .kanban → 中心目录的链接。
 * Windows 用 junction（目录联接）：创建**无需**开发者模式/管理员权限，且恰好匹配
 * 本场景的两个前提——目标必须是目录、必须是绝对路径（boardDir 均满足）；
 * 类 UNIX 用普通 symlink。lstat 在 Windows 上把 junction 报告为 isSymbolicLink()，
 * 故状态机其余分支（already/断链/decentralize 的 unlink 摘除）对两种形态统一成立。
 */
function linkToBoard(boardDir: string, local: string): void {
  symlinkSync(boardDir, local, isWindows ? 'junction' : 'dir');
}

export function centralizeProject(projectRoot: string): CentralizeResult {
  const abs = resolve(projectRoot);
  const local = kanbanDir(abs);
  const boardDir = centralBoardDir(abs); // 内含 ensureProjectNo：会分配编号并写回 config

  let st;
  try {
    st = lstatSync(local);
  } catch {
    throw new Error(`${local} 不存在，请先在该项目根执行 kanban init`);
  }

  if (st.isSymbolicLink()) {
    let real: string | null = null;
    try { real = realpathSync(local); } catch { /* 断链 */ }
    if (real !== null && existsSync(boardDir)) {
      // macOS 幻影路径（/var vs /private/var）会让字面比较误判，两侧都 realpath 归一后再比
      let boardReal = boardDir;
      try { boardReal = realpathSync(boardDir); } catch { /* 保持原值 */ }
      if (real === boardReal) {
        return { project: abs, status: 'already', boardDir, gitignore: fixGitignoreForSymlink(abs) };
      }
    }
    if (real !== null) {
      throw new Error(`${local} 是软链但指向 ${real}（非本项目中心目录 ${boardDir}），请人工确认后处理`);
    }
    // 断链：中心在则修复软链
    if (!existsSync(boardDir)) {
      throw new Error(`${local} 是断链软链且中心目录 ${boardDir} 不存在，无数据可接续，请人工处理`);
    }
    unlinkSync(local);
    linkToBoard(boardDir, local);
    return { project: abs, status: 'relinked', boardDir, gitignore: fixGitignoreForSymlink(abs) };
  }

  // 真实目录 → 迁移
  if (existsSync(boardDir)) {
    throw new Error(`中心目录 ${boardDir} 已存在但项目内 .kanban 仍是真实目录（可能上次迁移中断），请人工确认后删除中心目录再重跑`);
  }
  mkdirSync(centralBoardsDir(), { recursive: true });
  try {
    renameSync(local, boardDir); // 同卷原子
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== 'EXDEV') throw e;
    // 跨卷兜底：递归复制（保留软链原样）+ 校验 + 删源。有中断窗口，靠幂等重跑兜底。
    cpSync(local, boardDir, { recursive: true, verbatimSymlinks: true });
    rmSync(local, { recursive: true, force: true });
  }
  linkToBoard(boardDir, local);
  return { project: abs, status: 'migrated', boardDir, gitignore: fixGitignoreForSymlink(abs) };
}

export interface DecentralizeResult {
  project: string;
  /** restored=中心数据已迁回项目内真实目录；already-local=本就是真实目录 */
  status: 'restored' | 'already-local';
  /** restored 时为中心目录原路径（已迁空） */
  boardDir?: string;
}

/** 逆向：把中心看板目录迁回项目内真实目录，摘除软链。幂等（真实目录时 no-op）。 */
export function decentralizeProject(projectRoot: string): DecentralizeResult {
  const abs = resolve(projectRoot);
  const local = kanbanDir(abs);
  let st;
  try {
    st = lstatSync(local);
  } catch {
    throw new Error(`${local} 不存在，请先在该项目根执行 kanban init`);
  }
  if (!st.isSymbolicLink()) {
    return { project: abs, status: 'already-local' };
  }
  let boardDir: string;
  try {
    boardDir = realpathSync(local);
  } catch {
    throw new Error(`${local} 是断链软链，中心目录不存在，无数据可恢复`);
  }
  unlinkSync(local); // 先摘软链（rename 目标位若为软链行为依平台而异，先摘更明确）
  renameSync(boardDir, local);
  return { project: abs, status: 'restored', boardDir };
}

/**
 * 确保项目 .gitignore 能忽略 .kanban **软链**：带斜杠规则 `.kanban/` 匹配不到软链
 * （git 视软链为文件，实测 `?? .kanban` 会出现在 status）。检测到该情况时追加无斜杠行。
 * 非 git 仓库跳过；无 .gitignore 的 git 仓库创建只含该规则的文件（否则迁移后 status 变脏）。
 */
export function fixGitignoreForSymlink(projectRoot: string): 'appended' | 'ok' | 'skipped' {
  const abs = resolve(projectRoot);
  if (!existsSync(join(abs, '.git'))) return 'skipped';
  const giPath = join(abs, '.gitignore');
  if (!existsSync(giPath)) {
    writeFileSync(giPath, '.kanban\n', 'utf8');
    return 'appended';
  }
  let content: string;
  try {
    content = readFileSync(giPath, 'utf8');
  } catch {
    return 'skipped';
  }
  // 已有能匹配软链文件的规则（无斜杠 `.kanban` 或 `/.kanban`）则无需处理
  const hasRule = content.split(/\r?\n/).some(line => {
    const t = line.trim();
    if (t.startsWith('#')) return false;
    return t === '.kanban' || t === '/.kanban';
  });
  if (hasRule) return 'ok';
  appendFileSync(giPath, '\n# kanban: `.kanban/` 带斜杠规则匹配不到软链文件（git 视软链为文件）\n.kanban\n', 'utf8');
  return 'appended';
}
