import { useMemo, useState } from 'react';
import { toggleTodo } from '../api.js';

/** checkbox 行：与 core CHECKBOX_RE 保持一致（- [ ] / - [x] 后接正文） */
const CHECKBOX_RE = /^(\s*-\s*\[)([ xX])(\]\s+)(.*)$/;
/** 正文里的 2 位编号前缀：01 文本 */
const NO_RE = /^(\d{2})\s+(.*)$/;

interface TodoRow {
  kind: 'todo';
  index: number; // 位置序号（1-based，toggle API 的定位参数）
  no: string;
  done: boolean;
  text: string;
}
interface PlainRow {
  kind: 'plain';
  text: string;
}

/**
 * todo.md 专用预览：渲染为可点选的勾选列表（点 checkbox 即翻转完成状态）。
 * 不提供增删改——编辑 todo.md 由 agent 或手工完成，这里只做「标记完成」交互。
 */
export function TodoPreview(props: {
  content: string;
  project: string;
  taskId: string;
  /** 勾选成功后回调（父组件重载文档内容 + 刷新看板，让卡片标签同步） */
  onChanged: () => void;
}) {
  const { content, project, taskId, onChanged } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const rows = useMemo<(TodoRow | PlainRow)[]>(() => {
    const out: (TodoRow | PlainRow)[] = [];
    let idx = 0;
    for (const line of content.split('\n')) {
      const m = CHECKBOX_RE.exec(line);
      if (m) {
        idx++;
        const body = m[4].trim();
        const noMatch = NO_RE.exec(body);
        out.push({
          kind: 'todo',
          index: idx,
          no: noMatch ? noMatch[1] : '',
          done: m[2].toLowerCase() === 'x',
          text: noMatch ? noMatch[2].trim() : body,
        });
      } else if (line.trim()) {
        out.push({ kind: 'plain', text: line });
      }
    }
    return out;
  }, [content]);

  const flip = async (index: number) => {
    setBusy(true);
    setError('');
    try {
      await toggleTodo(project, taskId, index);
      onChanged();
    } catch {
      setError('勾选失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  if (rows.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>（todo.md 为空）</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r, i) => r.kind === 'plain' ? (
        <div key={i} style={{
          fontSize: 12, color: 'var(--text-tertiary)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>{r.text}</div>
      ) : (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={r.done}
            disabled={busy}
            onChange={() => flip(r.index)}
            style={{ cursor: busy ? 'wait' : 'pointer' }}
          />
          {r.no && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', minWidth: 18, fontFamily: 'monospace' }}>{r.no}</span>
          )}
          <span style={{
            fontSize: 13,
            color: r.done ? 'var(--text-tertiary)' : 'var(--text-primary)',
            textDecoration: r.done ? 'line-through' : 'none',
          }}>{r.text}</span>
        </div>
      ))}
      {error && <div style={{ fontSize: 12, color: '#b91c1c' }}>{error}</div>}
    </div>
  );
}
