import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';
import { globalConfigPath, globalKanbanDir } from './paths.js';
import type { GlobalConfig, ProjectEntry } from './types.js';

export function defaultGlobalConfig(): GlobalConfig {
  return { projects: [], defaultPort: 38311 };
}

export function readGlobalConfig(): GlobalConfig {
  const path = globalConfigPath();
  if (!existsSync(path)) return defaultGlobalConfig();
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<GlobalConfig>;
    const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
    let lastProject = typeof parsed.lastProject === 'string' ? parsed.lastProject : undefined;
    // 防御：lastProject 可能指向已被删除的项目。读取时顺手校验仍在 projects 内，失效则清空，避免脏值残留。
    if (lastProject && !projects.some(p => p.path === lastProject)) lastProject = undefined;
    return {
      projects,
      defaultPort: typeof parsed.defaultPort === 'number' ? parsed.defaultPort : 38311,
      lastProject,
    };
  } catch {
    return defaultGlobalConfig();
  }
}

export function writeGlobalConfig(config: GlobalConfig): void {
  mkdirSync(globalKanbanDir(), { recursive: true });
  writeFileSync(globalConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

export function addProject(projectPath: string): void {
  const abs = resolve(projectPath);
  const config = readGlobalConfig();
  if (config.projects.some(p => p.path === abs)) return;
  config.projects.push({ path: abs, name: basename(abs) });
  writeGlobalConfig(config);
}

export function removeProject(projectPath: string): void {
  const abs = resolve(projectPath);
  const config = readGlobalConfig();
  config.projects = config.projects.filter(p => p.path !== abs);
  // 移除的项目若是 lastProject，一并清空，避免指向已不存在的项目（readGlobalConfig 也会兜底）。
  if (config.lastProject === abs) config.lastProject = undefined;
  writeGlobalConfig(config);
}

/**
 * 修改项目显示名（只改 config.json 的 name，不动磁盘目录/路径）。
 * 项目不存在时抛错。name 去首尾空白后为空时抛错。
 */
export function renameProject(projectPath: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('项目名不能为空');
  const abs = resolve(projectPath);
  const config = readGlobalConfig();
  const entry = config.projects.find(p => p.path === abs);
  if (!entry) throw new Error(`项目不在列表中：${abs}`);
  entry.name = trimmed;
  writeGlobalConfig(config);
}

export function listProjects(): ProjectEntry[] {
  return readGlobalConfig().projects;
}

/** 记录最后打开的项目路径（Web 刷新/重开时恢复用）。只在已注册项目内有效，否则忽略。 */
export function setLastProject(projectPath: string): void {
  const abs = resolve(projectPath);
  const config = readGlobalConfig();
  if (!config.projects.some(p => p.path === abs)) return; // 未注册项目不记，保证 lastProject 恒属 projects
  config.lastProject = abs;
  writeGlobalConfig(config);
}

/** 读取最后打开的项目路径（可能为 undefined，或已被 readGlobalConfig 校验为失效）。 */
export function getLastProject(): string | undefined {
  return readGlobalConfig().lastProject;
}
