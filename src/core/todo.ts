import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { locateById } from './locate.js';
import { parseTodoMd } from './todo-md.js';
import { nextSubtaskNo } from './update.js';

const MAX_RETRIES = 3;

/**
 * 追加一条延后事项到 todo.md（只 append，不动已有行）。
 * 标题单行（换行替换为空格）；内容多行时每行缩进 2 空格写在标题下方，
 * 形似 checkbox 的行会被转义（\- 前缀）以免被解析成新事项。
 * 文件不存在则新建（带 H1 骨架）。
 * @returns 新事项的 2 位编号
 */
export async function appendTodo(projectRoot: string, id: string, title: string, content = ''): Promise<string> {
  const cleanTitle = title.replace(/\r?\n/g, ' ').trim();
  if (!cleanTitle) throw new Error('todo 标题不能为空');

  let attempt = 0;
  while (true) {
    attempt++;
    const loc = locateById(projectRoot, id);
    if (!loc) throw new Error(`任务 ${id} 不存在`);
    const todoPath = join(loc.path, 'todo.md');

    let fileContent = '';
    let nextNo = '01';
    if (existsSync(todoPath)) {
      fileContent = readFileSync(todoPath, 'utf8'); // 读最新
      const parsed = parseTodoMd(fileContent);
      nextNo = nextSubtaskNo(parsed.map(t => t.no));
    }

    const lines: string[] = [`- [ ] ${nextNo} ${cleanTitle}`];
    const contentLines = content.trim() ? content.split('\n') : [];
    for (const raw of contentLines) {
      if (!raw.trim()) { lines.push(''); continue; }
      const indented = '  ' + raw.replace(/^\s+/, (m) => m);
      // 内容行形如 checkbox 会被解析成新事项：加 \ 转义（markdown 渲染仍显示为 -）
      lines.push(/^(\s*)-\s*\[[ xX]\]/.test(raw) ? indented.replace(/^(\s*)-/, '$1\\-') : indented);
    }

    // 只 append：去掉文件尾部空行后接一个空行再拼新事项
    const base = fileContent.split('\n');
    while (base.length > 0 && base[base.length - 1].trim() === '') base.pop();
    const newContent = (base.length > 0 ? base.join('\n') + '\n\n' : '# 延后事项\n\n') + lines.join('\n') + '\n';

    try {
      writeFileSync(todoPath, newContent); // 已读最新，单进程内安全
      return nextNo;
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      // 否则重试（重新读最新）
    }
  }
}

/**
 * 定位 todo 事项所在行（0-based 行号）。与子任务同策略：
 * 优先按 2 位编号匹配，无匹配时按位置序号兜底（兼容无编号旧格式）。
 */
function findTodoLine(parsed: ReturnType<typeof parseTodoMd>, noOrIndex: string | number): number {
  const needle = String(noOrIndex).trim();
  const t = parsed.find(x => x.no === needle)
    ?? parsed.find(x => String(x.index) === needle);
  if (!t) {
    const nos = parsed.map(x => x.no).filter(Boolean).join('/');
    throw new Error(`todo 事项 ${noOrIndex} 不存在（现有编号：${nos || '无'}）`);
  }
  return t.line - 1; // 转 0-based
}

/**
 * 明确把一条 todo 事项设为勾选或取消勾选（非 toggle）。镜像 setSubtaskDone：
 * 读最新 → 行级替换 → 写回，失败重试（重新读最新）。
 */
export async function setTodoDone(projectRoot: string, id: string, noOrIndex: string | number, done: boolean): Promise<void> {
  let attempt = 0;
  while (true) {
    attempt++;
    const loc = locateById(projectRoot, id);
    if (!loc) throw new Error(`任务 ${id} 不存在`);
    const todoPath = join(loc.path, 'todo.md');
    if (!existsSync(todoPath)) throw new Error(`任务 ${id} 无 todo.md`);

    const content = readFileSync(todoPath, 'utf8'); // 读最新
    const parsed = parseTodoMd(content);
    const lines = content.split('\n');
    const lineIdx = findTodoLine(parsed, noOrIndex);
    const line = lines[lineIdx];
    if (done) {
      lines[lineIdx] = line.replace(/^(\s*-\s*\[)\s(\]\s+)/, '$1x$2');
    } else {
      lines[lineIdx] = line.replace(/^(\s*-\s*\[)[xX](\]\s+)/, '$1 $2');
    }
    const newContent = lines.join('\n');

    try {
      writeFileSync(todoPath, newContent); // 直接覆盖（已读最新，单进程内安全）
      return;
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      // 否则重试（重新读最新）
    }
  }
}

/**
 * toggle 一条 todo 事项的勾选状态。保留给 Web UI 的 checkbox 交互
 *（点击即翻转，toggle 语义合理）；CLI 用 setTodoDone 做明确勾选/取消。
 */
export async function toggleTodo(projectRoot: string, id: string, noOrIndex: string | number): Promise<void> {
  let attempt = 0;
  while (true) {
    attempt++;
    const loc = locateById(projectRoot, id);
    if (!loc) throw new Error(`任务 ${id} 不存在`);
    const todoPath = join(loc.path, 'todo.md');
    if (!existsSync(todoPath)) throw new Error(`任务 ${id} 无 todo.md`);

    const content = readFileSync(todoPath, 'utf8'); // 读最新
    const parsed = parseTodoMd(content);
    const lines = content.split('\n');
    const lineIdx = findTodoLine(parsed, noOrIndex);
    // toggle：把 [ ] ↔ [x]
    if (/^\s*-\s*\[\s\]\s/.test(lines[lineIdx])) {
      lines[lineIdx] = lines[lineIdx].replace(/^(\s*-\s*\[)\s(\]\s+)/, '$1x$2');
    } else if (/^\s*-\s*\[[xX]\]\s/.test(lines[lineIdx])) {
      lines[lineIdx] = lines[lineIdx].replace(/^(\s*-\s*\[)[xX](\]\s+)/, '$1 $2');
    }
    const newContent = lines.join('\n');

    try {
      writeFileSync(todoPath, newContent); // 直接覆盖（已读最新，单进程内安全）
      return;
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      // 否则重试（重新读最新）
    }
  }
}
