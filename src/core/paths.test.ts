import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { kanbanDir, globalConfigPath, globalKanbanDir, resolveProjectRoot } from './paths.js';
import { homedir } from 'os';

describe('paths', () => {
  it('kanbanDir 返回项目根下的 .kanban', () => {
    expect(kanbanDir('/proj/foo')).toBe('/proj/foo/.kanban');
  });

  it('globalKanbanDir 返回 ~/.kanban', () => {
    expect(globalKanbanDir()).toBe(join(homedir(), '.kanban'));
  });

  it('globalConfigPath 返回 ~/.kanban/config.json', () => {
    expect(globalConfigPath()).toBe(join(homedir(), '.kanban', 'config.json'));
  });
});

describe('resolveProjectRoot（从给定目录向上找最近的 .kanban）', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'kb-root-')); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('在项目根本身命中（cwd 即含 .kanban）', () => {
    mkdirSync(join(tmp, '.kanban'));
    expect(resolveProjectRoot(tmp)).toBe(tmp);
  });

  it('在深层子目录命中最近的项目根', () => {
    mkdirSync(join(tmp, '.kanban'));
    const deep = join(tmp, 'a', 'b', 'c');
    mkdirSync(deep, { recursive: true });
    expect(resolveProjectRoot(deep)).toBe(tmp);
  });

  it('多个 .kanban 时取最近的（最深）父目录', () => {
    mkdirSync(join(tmp, '.kanban'));                       // 外层
    const inner = join(tmp, 'sub');
    mkdirSync(join(inner, '.kanban'), { recursive: true }); // 内层
    const deep = join(inner, 'x', 'y');
    mkdirSync(deep, { recursive: true });
    expect(resolveProjectRoot(deep)).toBe(inner);
  });

  it('找不到任何 .kanban 抛错', () => {
    const deep = join(tmp, 'a', 'b');
    mkdirSync(deep, { recursive: true });
    expect(() => resolveProjectRoot(deep)).toThrow(/找不到.*\.kanban/);
  });
});
