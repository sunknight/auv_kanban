import type { TodoItem } from './types.js';
import { CHECKBOX_RE, parseCheckboxBody } from './main-md.js';

/**
 * 解析 todo.md 全文，收集所有 checkbox 行为延后事项。
 * 与子任务格式一致（"- [ ] NN 文本"），但不依赖任何标题结构——全文扫描，
 * 手写自由格式（只有列表、无 H1）也能解析。
 */
export function parseTodoMd(content: string): TodoItem[] {
  const lines = content.split('\n');
  const out: TodoItem[] = [];
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = CHECKBOX_RE.exec(lines[i]);
    if (m) {
      idx++;
      const { no, text } = parseCheckboxBody(m[4]);
      out.push({
        no,
        index: idx,
        done: m[2].toLowerCase() === 'x',
        text,
        line: i + 1, // 1-based
      });
    }
  }
  return out;
}
