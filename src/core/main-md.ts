import type { ParsedMainMd, SubTask } from './types.js';

/** checkbox 行：- [ ] / - [x] 后接正文。子任务与 todo.md 共用同一格式 */
export const CHECKBOX_RE = /^(\s*-\s*\[)([ xX])(\]\s+)(.*)$/;
/** 子任务正文的「编号」：2 位数字，如 01/02/03 */
const NO_RE = /^(\d{2})\s+(.*)$/;
/** 子任务正文的「标签」：[补充] 等，2-4 个中文字符或字母，方括号包裹 */
const TAG_RE = /^\[([^\]]+)\]\s+(.*)$/;

export function parseMainMd(content: string): ParsedMainMd {
  const lines = content.split('\n');
  const title = firstH1(lines);

  const descRange = sectionRange(lines, '描述');
  const promptRange = sectionRange(lines, '提示词');
  const subtaskRange = sectionRange(lines, '子任务');

  return {
    title,
    description: descRange ? sliceText(lines, descRange) : '',
    prompt: promptRange ? sliceText(lines, promptRange) : '',
    subtasks: subtaskRange ? collectSubtasks(lines, subtaskRange) : [],
  };
}

function firstH1(lines: string[]): string {
  for (const line of lines) {
    const m = /^#\s+(.*)$/.exec(line);
    if (m) return m[1].trim();
  }
  return '';
}

/** 找到 ## <title> 标题行，返回 [startLineIndex, endLineIndex)（不含下一个同级/更高级标题） */
function sectionRange(lines: string[], title: string): { start: number; end: number } | null {
  const headerIdx = lines.findIndex(l => new RegExp(`^##\\s+${escapeRe(title)}\\s*$`).test(l));
  if (headerIdx === -1) return null;
  let end = lines.length;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (/^#{1,2}\s+/.test(lines[i])) { end = i; break; }
  }
  return { start: headerIdx + 1, end };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sliceText(lines: string[], range: { start: number; end: number }): string {
  return lines.slice(range.start, range.end).join('\n').trim();
}

function collectSubtasks(lines: string[], range: { start: number; end: number }): SubTask[] {
  const out: SubTask[] = [];
  let idx = 0;
  for (let i = range.start; i < range.end; i++) {
    const m = CHECKBOX_RE.exec(lines[i]);
    if (m) {
      idx++;
      // 正文 m[4] 形如 "01 [补充] 文本" 或 "01 文本" 或 "文本"（无编号的兼容旧格式）
      const body = m[4];
      const { no, tag, text } = parseCheckboxBody(body);
      out.push({
        no,
        index: idx,
        done: m[2].toLowerCase() === 'x',
        tag,
        text,
        line: i + 1, // 1-based
      });
    }
  }
  return out;
}

/**
 * 解析 checkbox 行正文，分离编号 / 标签 / 文本。子任务与 todo.md 共用（格式一致）。
 * 支持格式：
 *   "01 文本"           → { no: '01', tag: '', text: '文本' }
 *   "01 [补充] 文本"    → { no: '01', tag: '补充', text: '文本' }
 *   "文本"（旧格式无编号）→ { no: '', tag: '', text: '文本' }，由上层兜底补编号
 */
export function parseCheckboxBody(body: string): { no: string; tag: string; text: string } {
  let rest = body.trim();
  let no = '';
  let tag = '';
  // 编号前缀：2 位数字
  const noMatch = NO_RE.exec(rest);
  if (noMatch) {
    no = noMatch[1];
    rest = noMatch[2].trim();
  }
  // 标签前缀：[xxx]
  const tagMatch = TAG_RE.exec(rest);
  if (tagMatch) {
    tag = tagMatch[1].trim();
    rest = tagMatch[2].trim();
  }
  return { no, tag, text: rest };
}

/** 输入结构化的任务内容，序列化回 main.md 文本（固定四段格式） */
export function serializeMainMd(input: {
  title: string;
  description: string;
  prompt: string;
  subtasks: { no?: string; tag?: string; text: string; done: boolean }[];
}): string {
  const lines: string[] = [];
  lines.push(`# ${input.title.trim() || '无标题'}`);
  lines.push('');
  lines.push('## 描述');
  lines.push(input.description.trim());
  lines.push('');
  lines.push('## 提示词');
  lines.push(input.prompt.trim());
  lines.push('');
  lines.push('## 子任务');
  for (const s of input.subtasks) {
    const box = s.done ? '[x]' : '[ ]';
    const parts = [s.no?.trim(), s.tag?.trim() ? `[${s.tag.trim()}]` : '', s.text.trim()]
      .filter(x => x && x.length > 0);
    lines.push(`- ${box} ${parts.join(' ')}`);
  }
  return lines.join('\n') + '\n';
}
