import { readdirSync, lstatSync, readFileSync } from 'fs';
import { join } from 'path';
import { locateAll } from './locate.js';

/** 可文本搜索的扩展名（与 Web 预览白名单的文本类一致）；docx/xlsx/图片等不可直接匹配，跳过 */
const TEXT_EXTS = new Set([
  '.txt', '.md', '.markdown', '.sql', '.json', '.xml',
  '.yml', '.yaml', '.log', '.html', '.csv',
]);
/** 单文件大小上限：超过则跳过，避免误读超大文件拖慢搜索 */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * 全项目任务搜索（0002）：返回正文（main.md 全文 + 任务目录内白名单文本文件，递归子目录）
 * 包含关键词的任务 id 数组。不区分大小写；空关键词返回空数组。
 * main.md 覆盖任务名称/描述/提示词/子任务；不跟随软链（与 files.md 清单规则一致）。
 */
export function searchTasks(projectRoot: string, query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const ids: string[] = [];
  for (const loc of locateAll(projectRoot)) {
    if (dirContains(loc.path, q)) ids.push(loc.id);
  }
  return ids;
}

/** 递归扫描目录：任一白名单文本文件含关键词即命中 */
function dirContains(dir: string, q: string): boolean {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return false; }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try { st = lstatSync(full); } catch { continue; } // lstat：软链本身不算，也不跟随
    if (st.isDirectory()) {
      if (dirContains(full, q)) return true;
    } else if (st.isFile()) {
      if (!TEXT_EXTS.has(extOf(entry))) continue;
      if (st.size > MAX_FILE_BYTES) continue;
      let content: string;
      try { content = readFileSync(full, 'utf8'); } catch { continue; }
      if (content.toLowerCase().includes(q)) return true;
    }
  }
  return false;
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}
