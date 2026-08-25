import { useMemo, useState } from 'react';

/** 表格渲染行数上限：超大 csv/excel 只渲染前 N 行，避免 DOM 爆炸 */
const MAX_ROWS = 500;

/**
 * CSV 解析（RFC4180 常见子集）：双引号包裹字段内的逗号/换行按字面处理，
 * `""` 为引号逃逸；\r\n 与 \n 行尾均可；行尾多余空行丢弃。
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  while (rows.length > 0 && rows[rows.length - 1].every(c => c === '')) rows.pop();
  return rows;
}

const thStyle: React.CSSProperties = {
  border: '1px solid var(--border)', padding: '3px 8px', fontSize: 12,
  background: 'var(--bg-detail)', textAlign: 'left', whiteSpace: 'nowrap',
  position: 'sticky', top: 0,
};
const tdStyle: React.CSSProperties = {
  border: '1px solid var(--border)', padding: '3px 8px', fontSize: 12,
  whiteSpace: 'pre-wrap', wordBreak: 'break-word', verticalAlign: 'top',
};

/** csv 预览：首行作表头（sticky），超 500 行截断并提示 */
export function CsvView({ content }: { content: string }) {
  const rows = useMemo(() => parseCsv(content), [content]);
  if (rows.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>（空 csv）</div>;
  const [head, ...body] = rows;
  const shown = body.slice(0, MAX_ROWS);
  return (
    <div>
      <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
        <thead><tr>{head.map((c, i) => <th key={i} style={thStyle}>{c}</th>)}</tr></thead>
        <tbody>
          {shown.map((r, ri) => (
            <tr key={ri}>{r.map((c, ci) => <td key={ci} style={tdStyle}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {body.length > MAX_ROWS && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
          共 {body.length + 1} 行，仅显示前 {MAX_ROWS + 1} 行。
        </div>
      )}
    </div>
  );
}

/** excel 预览：多 sheet 带 tab 切换，每 sheet 首行作表头（sticky），超 500 行截断并提示 */
export function ExcelView({ sheets }: { sheets: { name: string; rows: string[][] }[] }) {
  const [active, setActive] = useState(0);
  const idx = Math.min(active, sheets.length - 1);
  const sheet = sheets[idx];
  if (!sheet) return <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>（空表格）</div>;
  const rows = sheet.rows.filter(r => r.length > 0);
  const [head, ...body] = rows.length > 0 ? rows : [[]];
  const shown = body.slice(0, MAX_ROWS);
  return (
    <div>
      {sheets.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => setActive(i)}
              style={{
                fontSize: 12, padding: '2px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: `1px solid ${i === idx ? 'var(--accent)' : 'var(--border)'}`,
                background: i === idx ? 'var(--accent-bg)' : '#fff',
                color: i === idx ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >{s.name}</button>
          ))}
        </div>
      )}
      <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
        <thead><tr>{head.map((c, i) => <th key={i} style={thStyle}>{c}</th>)}</tr></thead>
        <tbody>
          {shown.map((r, ri) => (
            <tr key={ri}>{r.map((c, ci) => <td key={ci} style={tdStyle}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {body.length > MAX_ROWS && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
          {sheet.name} 共 {body.length + 1} 行，仅显示前 {MAX_ROWS + 1} 行。
        </div>
      )}
    </div>
  );
}
