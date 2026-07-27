import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * 已知 agent → 其用户级 skills 目录（相对 home）的注册表。
 * zcode 与其余 agent 完全同等，无优先级、无兜底。
 * 新增 agent 支持时只需在此追加一项。
 */
export interface SkillTarget {
  id: string;
  /** skills 目录，相对用户 home（如 '.claude/skills'）。 */
  dir: string;
}

export const SKILL_TARGETS: readonly SkillTarget[] = [
  { id: 'zcode', dir: '.zcode/skills' },
  { id: 'claude', dir: '.claude/skills' },
  { id: 'codex', dir: '.codex/skills' },
  { id: 'gemini', dir: '.gemini/skills' },
  { id: 'agents', dir: '.agents/skills' },
] as const;

/** 每个 agent 下 skill 的子目录名（统一为 kanban）。 */
export const SKILL_SUBDIR = 'kanban';

/** 已知 agent id 集合，用于校验 --agent 入参。 */
export const KNOWN_IDS: ReadonlySet<string> = new Set(SKILL_TARGETS.map((t) => t.id));

/**
 * 解析 --agent 逗号分隔的入参：
 * - 去空白、去重、丢弃空串；
 * - 出现未知 id 时抛错（错误信息列出全部可选项，便于用户纠正）。
 */
export function parseAgentArg(raw: string): string[] {
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // 去重，保序
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(id);
    }
  }
  const unknown = unique.filter((id) => !KNOWN_IDS.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `未知的 agent: ${unknown.join(', ')}。可选: ${[...KNOWN_IDS].join(', ')}`,
    );
  }
  return unique;
}

/**
 * 探测给定 home 下已安装的 agent（其 skills 目录存在即认为已安装）。
 * home 默认为当前用户 home，可注入以便测试。
 */
export function detectInstalled(home: string = homedir()): SkillTarget[] {
  return SKILL_TARGETS.filter((t) => existsSync(join(home, t.dir)));
}

/** 取某 agent 的注册项，不存在则抛错。 */
export function getTarget(id: string): SkillTarget {
  const t = SKILL_TARGETS.find((x) => x.id === id);
  if (!t) throw new Error(`未知的 agent: ${id}。可选: ${[...KNOWN_IDS].join(', ')}`);
  return t;
}

/** 某 agent 的 skills 目录绝对路径。 */
export function skillsDirOf(id: string, home: string = homedir()): string {
  return join(home, getTarget(id).dir);
}

/** 某 agent 下 kanban skill 的安装目标绝对路径（<home>/<dir>/kanban）。 */
export function installDstOf(id: string, home: string = homedir()): string {
  return join(skillsDirOf(id, home), SKILL_SUBDIR);
}
