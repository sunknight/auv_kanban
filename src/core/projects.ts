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
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      defaultPort: typeof parsed.defaultPort === 'number' ? parsed.defaultPort : 38311,
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
