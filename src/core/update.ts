import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { locateById } from './locate.js';
import { parseMainMd } from './main-md.js';

const MAX_RETRIES = 3;

/**
 * 计算下一个 2 位编号。取现有子任务编号里的最大数值 +1，补零到 2 位。
 * 空列表或全是无编号旧子任务时，从 01 开始。
 */
export function nextSubtaskNo(existingNos: string[]): string {
  const max = existingNos
    .map(no => parseInt(no, 10))
    .filter(n => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return String(max + 1).padStart(2, '0');
}

/**
 * 往任务的 ## 子任务 段追加一条子任务（默认带 [补充] 标签，用于 update 补需求场景）。
 *
 * 写入策略：读最新内容 → 行级追加 → 写回（**不**用 serializeMainMd 整体重写，
 * 以保留人对 main.md 的手编辑格式/空行）。
 * 段不存在时按固定四段骨架补齐（与新建任务模板一致）。
 *
 * @param tag 标签，默认 "补充"；普通拆解子任务传 '' 表示无标签
 * @returns 新子任务的 2 位编号
 */
export async function appendSubtask(
  projectRoot: string,
  id: string,
  text: string,
  tag = '补充',
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('子任务内容不能为空');

  let attempt = 0;
  while (true) {
    attempt++;
    const loc = locateById(projectRoot, id);
    if (!loc) throw new Error(`任务 ${id} 不存在（存档任务需先解除存档）`);
    const mainPath = join(loc.path, 'main.md');
    if (!existsSync(mainPath)) throw new Error(`任务 ${id} 缺少 main.md`);

    const content = readFileSync(mainPath, 'utf8'); // 读最新
    const parsed = parseMainMd(content);
    const no = nextSubtaskNo(parsed.subtasks.map(s => s.no));
    const label = tag && tag.trim() ? `[${tag.trim()}] ` : '';
    const newLine = `- [ ] ${no} ${label}${trimmed}`;

    const lines = content.split('\n');
    // 找 ## 子任务 段标题行
    const headerIdx = lines.findIndex(l => /^##\s+子任务\s*$/.test(l));
    let insertAt: number;

    if (headerIdx === -1) {
      // 段不存在：补齐骨架（理论上 createTask 已建好，此处兜底）
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
      lines.push('', '## 子任务');
      insertAt = lines.length;
    } else {
      // 段存在：插到段末尾（跳过段内尾部空行，保持紧凑）
      let end = lines.length;
      for (let i = headerIdx + 1; i < lines.length; i++) {
        if (/^#{1,2}\s+/.test(lines[i])) { end = i; break; }
      }
      insertAt = end;
      while (insertAt - 1 > headerIdx && lines[insertAt - 1].trim() === '') insertAt--;
    }

    lines.splice(insertAt, 0, newLine);

    try {
      writeFileSync(mainPath, lines.join('\n')); // 已读最新，单进程内安全
      return no;
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      // 否则重试（重新读最新）
    }
  }
}
