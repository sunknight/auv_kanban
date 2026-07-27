import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { locateById } from './locate.js';
import { parseMainMd } from './main-md.js';

const MAX_RETRIES = 3;

/**
 * toggle 一个子任务的勾选状态。
 *
 * @param noOrIndex 子任务的 2 位编号（如 "03"）或位置序号（如 3）。优先按编号匹配；
 *                  编号无匹配时按位置序号兜底（兼容旧脚本/旧习惯）。
 */
export async function toggleSubtask(projectRoot: string, id: string, noOrIndex: string | number): Promise<void> {
  let attempt = 0;
  while (true) {
    attempt++;
    // 每次重新定位（路径可能变）
    const loc = locateById(projectRoot, id);
    if (!loc) throw new Error(`任务 ${id} 不存在`);
    const mainPath = join(loc.path, 'main.md');
    if (!existsSync(mainPath)) throw new Error(`任务 ${id} 缺少 main.md`);

    const content = readFileSync(mainPath, 'utf8'); // 读最新
    const parsed = parseMainMd(content);
    const needle = String(noOrIndex).trim();
    // 优先按 2 位编号匹配；否则按位置序号（1-based）兜底
    const st = parsed.subtasks.find(s => s.no === needle)
      ?? parsed.subtasks.find(s => String(s.index) === needle);
    if (!st) {
      const nos = parsed.subtasks.map(s => s.no).filter(Boolean).join('/');
      throw new Error(`子任务 ${noOrIndex} 不存在（现有编号：${nos || '无'}）`);
    }

    const lines = content.split('\n');
    const lineIdx = st.line - 1; // 转 0-based
    // toggle：把 [ ] ↔ [x]
    if (/^\s*-\s*\[\s\]\s/.test(lines[lineIdx])) {
      lines[lineIdx] = lines[lineIdx].replace(/^(\s*-\s*\[)\s(\]\s+)/, '$1x$2');
    } else if (/^\s*-\s*\[[xX]\]\s/.test(lines[lineIdx])) {
      lines[lineIdx] = lines[lineIdx].replace(/^(\s*-\s*\[)[xX](\]\s+)/, '$1 $2');
    }
    const newContent = lines.join('\n');

    try {
      writeFileSync(mainPath, newContent); // 直接覆盖（已读最新，单进程内安全）
      return;
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      // 否则重试（重新读最新）
    }
  }
}
