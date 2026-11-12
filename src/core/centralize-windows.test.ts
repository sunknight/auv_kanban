import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, lstatSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// 把 platform 的 isWindows 钉成 true，验证 Windows 代码路径（junction 分支）：
// POSIX 上 symlinkSync 的 type 参数被忽略（仍建普通 symlink），故本文件只能验证
// 「Windows 分支不再被无条件拒绝、迁移/往返流程正常」；真 junction 语义需 Windows 实机验证。
vi.mock('./platform.js', () => ({ isWindows: true }));

import { centralizeProject, decentralizeProject } from './centralize.js';
import { addProject } from './projects.js';

describe('centralize（Windows junction 分支，isWindows 已 mock）', () => {
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
    vi.restoreAllMocks();
  });

  it('不再抛「Windows 不支持集中模式」，正常迁移并在原位留链接', () => {
    const proj = mkdtempSync(join(tmpdir(), 'proj-'));
    mkdirSync(join(proj, '.kanban', 'tasks'), { recursive: true });
    writeFileSync(join(proj, '.kanban', 'board.yml'), 'next-id: 1\n', 'utf8');
    addProject(proj);

    const r = centralizeProject(proj); // mock isWindows=true：旧实现在此抛错
    expect(r.status).toBe('migrated');
    expect(existsSync(join(r.boardDir, 'board.yml'))).toBe(true);
    expect(lstatSync(join(proj, '.kanban')).isSymbolicLink()).toBe(true);
  });

  it('decentralize 在 junction 形态下同样可往返（摘链接 + 中心迁回）', () => {
    const proj = mkdtempSync(join(tmpdir(), 'proj-'));
    mkdirSync(join(proj, '.kanban', 'tasks'), { recursive: true });
    writeFileSync(join(proj, '.kanban', 'board.yml'), 'next-id: 1\n', 'utf8');
    addProject(proj);
    centralizeProject(proj);

    const r = decentralizeProject(proj);
    expect(r.status).toBe('restored');
    expect(lstatSync(join(proj, '.kanban')).isDirectory()).toBe(true);
    expect(existsSync(join(proj, '.kanban', 'board.yml'))).toBe(true);
    expect(existsSync(r.boardDir!)).toBe(false);
  });

  it('幂等重跑（already 分支）在 Windows 代码路径同样成立', () => {
    const proj = mkdtempSync(join(tmpdir(), 'proj-'));
    mkdirSync(join(proj, '.kanban'), { recursive: true });
    writeFileSync(join(proj, '.kanban', 'board.yml'), 'next-id: 1\n', 'utf8');
    addProject(proj);
    centralizeProject(proj);
    expect(centralizeProject(proj).status).toBe('already');
  });
});
