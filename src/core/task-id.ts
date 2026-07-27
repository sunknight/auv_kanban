import type { BoardConfig } from './types.js';

export function formatId(num: number): string {
  return String(num).padStart(4, '0');
}

export interface ParsedDir { id: string; name: string; }

export function parseDirName(dirName: string): ParsedDir | null {
  const m = /^(\d{4})-(.+)$/.exec(dirName);
  if (!m) return null;
  return { id: m[1], name: m[2] };
}

/** 把任务名中的目录非法字符替换为下划线 */
export function sanitizeName(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, '_').trim();
}

/** 构造子目录名 */
export function buildDirName(id: string, name: string): string {
  return `${id}-${sanitizeName(name)}`;
}

/**
 * 分配下一个任务 ID：读取 config 的 next-id，返回格式化字符串，
 * 并返回 next-id +1 的新 config 副本（不可变，不修改原对象）。
 */
export function allocateId(config: BoardConfig): { id: string; config: BoardConfig } {
  const id = formatId(config['next-id']);
  return {
    id,
    config: { ...config, 'next-id': config['next-id'] + 1 },
  };
}
