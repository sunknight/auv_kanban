import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync, unlinkSync, existsSync, lstatSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { centralizeProject, decentralizeProject, centralBoardDir, fixGitignoreForSymlink } from './centralize.js';
import { addProject, readGlobalConfig } from './projects.js';

/** 建一个带最小看板结构的假项目（board.yml + tasks/0001-演示/main.md） */
function makeFakeProject(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, '.kanban', 'tasks', '0001-演示'), { recursive: true });
  writeFileSync(join(root, '.kanban', 'board.yml'), "next-id: 2\n", 'utf8');
  writeFileSync(join(root, '.kanban', 'tasks', '0001-演示', 'main.md'), '# 演示\n', 'utf8');
  return root;
}

describe('centralize', () => {
  let tmpHome: string;
  let origHome: string | undefined;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'home-'));
    origHome = process.env.HOME;
    process.env.HOME = tmpHome;
  });
  afterEach(() => {
    if (origHome !== undefined) process.env.HOME = origHome;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('真实目录迁移：中心出现数据、原位变软链、config 记录编号', () => {
    const proj = makeFakeProject('proj-');
    addProject(proj);
    const r = centralizeProject(proj);
    expect(r.status).toBe('migrated');
    // 中心目录有数据
    expect(existsSync(join(r.boardDir, 'board.yml'))).toBe(true);
    expect(existsSync(join(r.boardDir, 'tasks', '0001-演示', 'main.md'))).toBe(true);
    // 原位是软链且指向中心
    expect(lstatSync(join(proj, '.kanban')).isSymbolicLink()).toBe(true);
    // 中心目录名 = 编号-项目名（mkdtemp 目录带随机后缀，只断言前缀与项目名后缀）
    expect(r.boardDir).toMatch(/001-proj/);
    expect(readGlobalConfig().projects[0].no).toBe('001');
  });

  it('幂等：已是集中状态重跑返回 already，不重复迁移', () => {
    const proj = makeFakeProject('proj-');
    addProject(proj);
    centralizeProject(proj);
    const r2 = centralizeProject(proj);
    expect(r2.status).toBe('already');
    expect(existsSync(join(r2.boardDir, 'board.yml'))).toBe(true);
  });

  it('断链软链：中心存在时修复（relinked）', () => {
    const proj = makeFakeProject('proj-');
    addProject(proj);
    centralizeProject(proj);
    // 模拟断链：软链仍在但指向不存在的目标（中心数据完好）
    unlinkSync(join(proj, '.kanban'));
    symlinkSync('/gone/with/center/intact', join(proj, '.kanban'), 'dir');
    const r2 = centralizeProject(proj);
    expect(r2.status).toBe('relinked');
    expect(existsSync(join(r2.boardDir, 'board.yml'))).toBe(true);
  });

  it('断链软链且中心不存在时抛错', () => {
    const proj = makeFakeProject('proj-');
    addProject(proj);
    symlinkSync('/no/such/central/dir', join(proj, '.kanban-断链'), 'dir');
    // 用 .kanban 名义构造断链：先删真实目录再放断链
    rmSync(join(proj, '.kanban'), { recursive: true, force: true });
    symlinkSync('/no/such/central/dir', join(proj, '.kanban'), 'dir');
    expect(() => centralizeProject(proj)).toThrow();
    unlinkSync(join(proj, '.kanban-断链'));
  });

  it('软链指向别处时抛错（不明意图）', () => {
    const proj = makeFakeProject('proj-');
    addProject(proj);
    const other = mkdtempSync(join(tmpdir(), 'other-'));
    rmSync(join(proj, '.kanban'), { recursive: true, force: true });
    symlinkSync(other, join(proj, '.kanban'), 'dir');
    expect(() => centralizeProject(proj)).toThrow(/指向/);
  });

  it('真实目录 + 中心已存在（中断残留）时抛错', () => {
    const proj = makeFakeProject('proj-');
    addProject(proj);
    mkdirSync(centralBoardDir(proj), { recursive: true }); // 模拟残留
    expect(() => centralizeProject(proj)).toThrow(/中断/);
  });

  it('.kanban 不存在时抛错提示 init', () => {
    const proj = mkdtempSync(join(tmpdir(), 'empty-'));
    addProject(proj);
    expect(() => centralizeProject(proj)).toThrow(/kanban init/);
  });

  it('decentralize 往返：集中后迁回，恢复真实目录、中心清空', () => {
    const proj = makeFakeProject('proj-');
    addProject(proj);
    centralizeProject(proj);
    const r = decentralizeProject(proj);
    expect(r.status).toBe('restored');
    expect(lstatSync(join(proj, '.kanban')).isDirectory()).toBe(true);
    expect(existsSync(join(proj, '.kanban', 'tasks', '0001-演示', 'main.md'))).toBe(true);
    expect(existsSync(r.boardDir!)).toBe(false);
  });

  it('decentralize 幂等：本就是真实目录返回 already-local', () => {
    const proj = makeFakeProject('proj-');
    addProject(proj);
    expect(decentralizeProject(proj).status).toBe('already-local');
  });

  describe('fixGitignoreForSymlink', () => {
    it('gitignore 只有 .kanban/（带斜杠）时追加无斜杠规则', () => {
      const proj = mkdtempSync(join(tmpdir(), 'g1-'));
      mkdirSync(join(proj, '.git'));
      writeFileSync(join(proj, '.gitignore'), 'node_modules/\n.kanban/\n', 'utf8');
      expect(fixGitignoreForSymlink(proj)).toBe('appended');
      const content = readFileSync(join(proj, '.gitignore'), 'utf8');
      expect(content.split('\n').some(l => l.trim() === '.kanban')).toBe(true);
      expect(content).toContain('.kanban/'); // 旧规则保留不删
    });

    it('已有无斜杠 .kanban 规则时不重复追加', () => {
      const proj = mkdtempSync(join(tmpdir(), 'g2-'));
      mkdirSync(join(proj, '.git'));
      writeFileSync(join(proj, '.gitignore'), '.kanban\n', 'utf8');
      expect(fixGitignoreForSymlink(proj)).toBe('ok');
    });

    it('git 仓库无 .gitignore 时创建只含该规则的文件', () => {
      const proj = mkdtempSync(join(tmpdir(), 'g3-'));
      mkdirSync(join(proj, '.git'));
      expect(fixGitignoreForSymlink(proj)).toBe('appended');
      expect(readFileSync(join(proj, '.gitignore'), 'utf8').trim()).toBe('.kanban');
    });

    it('非 git 仓库跳过', () => {
      const proj = mkdtempSync(join(tmpdir(), 'g4-'));
      expect(fixGitignoreForSymlink(proj)).toBe('skipped');
      expect(existsSync(join(proj, '.gitignore'))).toBe(false);
    });
  });
});
