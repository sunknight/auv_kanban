import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { listProjects, addProject, removeProject, renameProject, reorderProjects, readGlobalConfig, writeGlobalConfig, setLastProject, getLastProject } from './projects.js';

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

  describe('reorderProjects（项目排序）', () => {
    it('按入参完整顺序重排，保留各项目 name 字段', () => {
      const p1 = mkdtempSync(join(tmpdir(), 'a-'));
      const p2 = mkdtempSync(join(tmpdir(), 'b-'));
      const p3 = mkdtempSync(join(tmpdir(), 'c-'));
      addProject(p1); addProject(p2); addProject(p3);
      renameProject(p2, 'B项目');
      // 初始 [p1, p2, p3] → 重排为 [p3, p1, p2]
      reorderProjects([p3, p1, p2]);
      const paths = readGlobalConfig().projects.map(p => p.path);
      expect(paths).toEqual([p3, p1, p2]);
      // name 字段保留
      expect(readGlobalConfig().projects[2].name).toBe('B项目');
    });

    it('入参未涵盖的现有项目补在末尾（不丢失）', () => {
      const p1 = mkdtempSync(join(tmpdir(), 'a-'));
      const p2 = mkdtempSync(join(tmpdir(), 'b-'));
      const p3 = mkdtempSync(join(tmpdir(), 'c-'));
      addProject(p1); addProject(p2); addProject(p3);
      // 只传 p2，p1/p3 应补末尾
      reorderProjects([p2]);
      const paths = readGlobalConfig().projects.map(p => p.path);
      expect(paths[0]).toBe(p2);
      expect(paths.slice(1).sort()).toEqual([p1, p3].sort());
      expect(readGlobalConfig().projects).toHaveLength(3);
    });

    it('入参含未知路径或重复项被忽略（幂等安全）', () => {
      const p1 = mkdtempSync(join(tmpdir(), 'a-'));
      const p2 = mkdtempSync(join(tmpdir(), 'b-'));
      addProject(p1); addProject(p2);
      reorderProjects([p2, p2, '/no/such/path', p1]);
      expect(readGlobalConfig().projects.map(p => p.path)).toEqual([p2, p1]);
    });

    it('空入参不丢项目（保持原顺序）', () => {
      const p1 = mkdtempSync(join(tmpdir(), 'a-'));
      const p2 = mkdtempSync(join(tmpdir(), 'b-'));
      addProject(p1); addProject(p2);
      reorderProjects([]);
      expect(readGlobalConfig().projects.map(p => p.path)).toEqual([p1, p2]);
    });
  });

  describe('lastProject（记住最后打开的项目 0003）', () => {
    it('setLastProject 记录已注册项目路径', () => {
      const proj = mkdtempSync(join(tmpdir(), 'proj-'));
      addProject(proj);
      setLastProject(proj);
      expect(getLastProject()).toBe(proj);
    });

    it('setLastProject 对未注册项目不记录', () => {
      setLastProject('/no/such/project');
      expect(getLastProject()).toBeUndefined();
    });

    it('getLastProject 默认 undefined', () => {
      expect(getLastProject()).toBeUndefined();
    });

    it('removeProject 移除当前 lastProject 时一并清空', () => {
      const proj = mkdtempSync(join(tmpdir(), 'proj-'));
      addProject(proj);
      setLastProject(proj);
      expect(getLastProject()).toBe(proj);
      removeProject(proj);
      expect(getLastProject()).toBeUndefined();
    });

    it('readGlobalConfig 过滤指向已删除项目的脏 lastProject', () => {
      const proj = mkdtempSync(join(tmpdir(), 'proj-'));
      addProject(proj);
      setLastProject(proj);
      // 直接写一个指向不存在项目的 lastProject，模拟历史脏值
      const cfg = readGlobalConfig();
      cfg.lastProject = '/another/removed/project';
      writeGlobalConfig(cfg);
      // 再次读取时应被清空（不在 projects 内）
      expect(getLastProject()).toBeUndefined();
    });
  });
});
