import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { listProjects, addProject, removeProject, renameProject, readGlobalConfig } from './projects.js';

describe('projects', () => {
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

  it('readGlobalConfig 无文件返回默认', () => {
    const c = readGlobalConfig();
    expect(c.projects).toEqual([]);
    expect(c.defaultPort).toBe(38311);
  });

  it('addProject 写入 config，name 取 basename', () => {
    const proj = mkdtempSync(join(tmpdir(), 'proj-'));
    addProject(proj);
    const c = readGlobalConfig();
    expect(c.projects).toHaveLength(1);
    expect(c.projects[0].path).toBe(proj);
  });

  it('addProject 不重复添加', () => {
    const proj = mkdtempSync(join(tmpdir(), 'proj-'));
    addProject(proj);
    addProject(proj);
    expect(readGlobalConfig().projects).toHaveLength(1);
  });

  it('removeProject 移除', () => {
    const proj = mkdtempSync(join(tmpdir(), 'proj-'));
    addProject(proj);
    removeProject(proj);
    expect(readGlobalConfig().projects).toHaveLength(0);
  });

  it('listProjects 返回项目列表', () => {
    const p1 = mkdtempSync(join(tmpdir(), 'a-'));
    const p2 = mkdtempSync(join(tmpdir(), 'b-'));
    addProject(p1); addProject(p2);
    expect(listProjects()).toHaveLength(2);
  });

  it('renameProject 修改 name 字段', () => {
    const proj = mkdtempSync(join(tmpdir(), 'proj-'));
    addProject(proj);
    renameProject(proj, '我的项目');
    const c = readGlobalConfig();
    expect(c.projects[0].name).toBe('我的项目');
  });

  it('renameProject 去首尾空白', () => {
    const proj = mkdtempSync(join(tmpdir(), 'proj-'));
    addProject(proj);
    renameProject(proj, '  新名  ');
    expect(readGlobalConfig().projects[0].name).toBe('新名');
  });

  it('renameProject 名称为空抛错', () => {
    const proj = mkdtempSync(join(tmpdir(), 'proj-'));
    addProject(proj);
    expect(() => renameProject(proj, '   ')).toThrow();
  });

  it('renameProject 项目不存在抛错', () => {
    expect(() => renameProject('/no/such/path', '名字')).toThrow();
  });
});
