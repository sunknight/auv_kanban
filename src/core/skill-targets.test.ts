import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  SKILL_TARGETS,
  SKILL_SUBDIR,
  KNOWN_IDS,
  parseAgentArg,
  detectInstalled,
  getTarget,
  skillsDirOf,
  installDstOf,
} from './skill-targets.js';

describe('skill-targets 注册表', () => {
  it('SKILL_SUBDIR 为 kanban', () => {
    expect(SKILL_SUBDIR).toBe('kanban');
  });

  it('SKILL_TARGETS 至少含 zcode/claude/codex/gemini/agents', () => {
    const ids = SKILL_TARGETS.map((t) => t.id);
    for (const id of ['zcode', 'claude', 'codex', 'gemini', 'agents']) {
      expect(ids).toContain(id);
    }
  });

  it('每个 target 的 dir 是相对 home 的路径（非绝对、非 ~）', () => {
    for (const t of SKILL_TARGETS) {
      expect(t.dir.startsWith('~')).toBe(false);
      expect(t.dir.startsWith('/')).toBe(false);
      expect(t.dir.endsWith('/skills')).toBe(true);
    }
  });

  it('KNOWN_IDS 与 SKILL_TARGETS 的 id 一致', () => {
    expect([...KNOWN_IDS]).toEqual(SKILL_TARGETS.map((t) => t.id));
  });
});

describe('parseAgentArg', () => {
  it('逗号分隔解析，去空白、去重、保序', () => {
    expect(parseAgentArg('claude , codex,claude')).toEqual(['claude', 'codex']);
  });

  it('单个 id', () => {
    expect(parseAgentArg('zcode')).toEqual(['zcode']);
  });

  it('丢弃空段（首尾/连续逗号）', () => {
    expect(parseAgentArg(', claude,, ,codex ,')).toEqual(['claude', 'codex']);
  });

  it('未知 id 抛错并列出可选项', () => {
    expect(() => parseAgentArg('claude,foo')).toThrow(/未知的 agent.*foo/);
    expect(() => parseAgentArg('foo')).toThrow(/zcode.*claude.*codex.*gemini.*agents/s);
  });
});

describe('getTarget / skillsDirOf / installDstOf', () => {
  it('getTarget 返回注册项', () => {
    expect(getTarget('claude')).toEqual({ id: 'claude', dir: '.claude/skills' });
  });

  it('getTarget 未知 id 抛错', () => {
    expect(() => getTarget('nope')).toThrow(/未知的 agent.*nope/);
  });

  it('skillsDirOf 拼接注入的 home', () => {
    expect(skillsDirOf('claude', '/h')).toBe('/h/.claude/skills');
  });

  it('installDstOf 在 skills 目录下加 kanban 子目录', () => {
    expect(installDstOf('zcode', '/h')).toBe('/h/.zcode/skills/kanban');
  });
});

describe('detectInstalled', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'kb-skill-home-'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it('仅返回 skills 目录存在的 agent', () => {
    mkdirSync(join(home, '.zcode', 'skills'), { recursive: true });
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true });
    const ids = detectInstalled(home).map((t) => t.id);
    expect(ids).toEqual(['zcode', 'claude']);
  });

  it('空 home（无任何 agent 目录）返回空数组', () => {
    expect(detectInstalled(home)).toEqual([]);
  });

  it('只判断 skills 目录存在性，不要求 kanban 子目录', () => {
    mkdirSync(join(home, '.gemini', 'skills'), { recursive: true });
    expect(detectInstalled(home).map((t) => t.id)).toEqual(['gemini']);
  });
});
