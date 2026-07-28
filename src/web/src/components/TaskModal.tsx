import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Task, DocInfo, DocContent } from '../types.js';
import { updateTask, moveTask, listDocs, readDoc, archiveTask, deleteTask, subscribeBoard } from '../api.js';

interface EditableSubtask {
  no?: string;
  tag?: string;
  text: string;
  done: boolean;
}

export function TaskModal(props: {
  task: Task;
  project: string;
  columns: { name: string; display: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { task, project, columns, onClose, onSaved } = props;
  const [title, setTitle] = useState(task.name);
  const [description, setDescription] = useState(task.main?.description ?? '');
  // 提示词数据保留（隐藏编辑区，但保存时回填原值，避免丢数据）
  const [prompt] = useState(task.main?.prompt ?? '');
  const [subtasks, setSubtasks] = useState<EditableSubtask[]>(
    (task.main?.subtasks ?? []).map(s => ({ no: s.no, tag: s.tag, text: s.text, done: s.done })),
  );
  const [column, setColumn] = useState(task.column);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 任务文档
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [activeDoc, setActiveDoc] = useState<DocInfo | null>(null);
  const [docContent, setDocContent] = useState<DocContent | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState('');

  // 复制执行命令反馈态
  const [copied, setCopied] = useState(false);

  // 文档预览区滚动容器：重载 logs.md 后滚到底（看最新进展）
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  // 当前 activeDoc 用 ref 持有最新值，供 socket 回调读取（避免闭包陈旧）
  const activeDocRef = useRef<DocInfo | null>(null);
  useEffect(() => { activeDocRef.current = activeDoc; }, [activeDoc]);

  // 描述 textarea：随输入自动调高，避免抖动（用 useLayoutEffect 在绘制前同步定高，
  // 浏览器不会看到先矮后高的中间态）。先重置为 auto 再读 scrollHeight，拿真实内容高度。
  const descRef = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const ta = descRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [description]);

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 打开 modal 时拉取文档列表
  useEffect(() => {
    let alive = true;
    setDocsLoading(true);
    listDocs(project, task.id)
      .then(list => { if (alive) setDocs(list); })
      .catch(() => { if (alive) setDocError('文档列表加载失败'); })
      .finally(() => { if (alive) setDocsLoading(false); });
    return () => { alive = false; };
  }, [project, task.id]);

  const openDoc = useCallback((doc: DocInfo) => {
    setActiveDoc(doc);
    setDocContent(null);
    setDocError('');
    setDocLoading(true);
    readDoc(project, task.id, doc.name)
      .then(c => { setDocContent(c); })
      .catch(() => { setDocError('文档读取失败'); })
      .finally(() => { setDocLoading(false); });
  }, [project, task.id]);

  // 重载当前预览文档的内容（手动刷新按钮、socket 自动刷新共用）。
  // 仅对 markdown/text 类文档有意义；logs.md 重载后滚到底看最新进展。
  const reloadActiveDoc = useCallback((opts?: { scrollToBottom?: boolean }) => {
    const doc = activeDocRef.current;
    if (!doc) return;
    setDocLoading(true);
    setDocError('');
    readDoc(project, task.id, doc.name)
      .then(c => {
        setDocContent(c);
        if (opts?.scrollToBottom) {
          // marked 同步解析 + dangerouslySetInnerHTML 同步渲染，下一帧 DOM 已更新
          requestAnimationFrame(() => {
            const el = previewScrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          });
        }
      })
      .catch(() => { setDocError('文档读取失败'); })
      .finally(() => { setDocLoading(false); });
  }, [project, task.id]);

  // socket 自动刷新：看板任意文件变化时（如 agent 增量写 logs.md），
  // ① 重载文档列表（捕捉新增/删除的文件，如 agent 刚创建 logs.md）；
  // ② 若当前正预览 logs.md，重载其内容并滚到底，看最新进展。
  useEffect(() => {
    const unsub = subscribeBoard(project, () => {
      // 重载文档列表（不重置 activeDoc，避免打断人正在看的文档）
      listDocs(project, task.id)
        .then(list => { setDocs(list); })
        .catch(() => { /* 静默：列表刷新失败不影响内容预览 */ });
      // 若正在看 logs.md，重载内容并滚到底
      if (activeDocRef.current?.name === 'logs.md') {
        reloadActiveDoc({ scrollToBottom: true });
      }
    });
    return unsub;
  }, [project, task.id, reloadActiveDoc]);

  // doing 栏任务：打开详情时若有 logs.md，默认选中它（"正在执行"一眼可见）。
  // 仅在文档列表首次加载完成、且人还没手动选过文档时触发。
  useEffect(() => {
    if (docsLoading || docs.length === 0) return;
    if (activeDoc) return; // 人已选过，不覆盖
    if (task.column !== 'doing') return;
    const logs = docs.find(d => d.name === 'logs.md');
    if (logs) openDoc(logs);
  }, [docsLoading, docs, activeDoc, task.column, openDoc]);

  // 复制执行命令到剪贴板：命令带任务名，用 # 分隔符确保名称不影响 run 解析
  // （kanban run 用首个 4 位 ID 定位任务，# 后是展示性说明，agent 一眼可辨）
  const copyRunCommand = useCallback(async () => {
    const cmd = `/kanban run ${task.id} # ${task.name}`;
    let ok = false;
    try {
      await navigator.clipboard.writeText(cmd);
      ok = true;
    } catch {
      // 非安全上下文/旧浏览器兜底
      try {
        const ta = document.createElement('textarea');
        ta.value = cmd;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { ok = false; }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [task.id, task.name]);

  // 存档：从看板隐藏，实体移到 archive/（保留目录与文档）
  const handleArchive = async () => {
    if (!window.confirm(`确定存档任务 ${task.id}「${task.name}」？\n存档会从看板隐藏该任务（实体移到 archive/，目录与文档保留）。`)) return;
    try {
      await archiveTask(project, task.id);
      onSaved();
      onClose();
    } catch {
      setError('存档失败');
    }
  };

  // 删除：永久移除任务及所有文档（危险操作，二次确认）
  const handleDelete = async () => {
    if (!window.confirm(`确定删除任务 ${task.id}「${task.name}」？\n删除将永久移除任务及其所有文档，不可恢复。`)) return;
    try {
      await deleteTask(project, task.id);
      onSaved();
      onClose();
    } catch {
      setError('删除失败');
    }
  };

  const updateSubtask = (i: number, patch: Partial<EditableSubtask>) => {
    setSubtasks(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };
  const addSubtask = () => setSubtasks(prev => {
    // 新增子任务自动算下一编号（已有编号最大值 +1，与 CLI nextSubtaskNo 一致）
    const max = prev.reduce((m, s) => {
      const n = parseInt(s.no ?? '', 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);
    return [...prev, { no: String(max + 1).padStart(2, '0'), text: '', done: false }];
  });
  const removeSubtask = (i: number) => setSubtasks(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await updateTask(project, task.id, {
        title: title.trim() || task.name,
        description,
        prompt,
        subtasks: subtasks.map(s => ({ no: s.no, tag: s.tag, text: s.text, done: s.done })),
      });
      if (column !== task.column) {
        await moveTask(project, task.id, column);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 16px',
        zIndex: 1000,
        overflow: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          width: '100%',
          maxWidth: 560,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* 标题栏 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>#{task.id}</span>
            <button
              onClick={copyRunCommand}
              title="复制在 agent 里执行该任务的命令"
              style={{
                border: '1px solid var(--border)', background: copied ? 'var(--accent-bg)' : '#fff',
                color: copied ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 12, padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                cursor: 'pointer', lineHeight: 1.4,
              }}
            >
              {copied ? '✓ 已复制' : '复制执行命令'}
            </button>
            <button
              onClick={handleArchive}
              title="从看板隐藏，实体移到 archive/ 保留目录与文档"
              style={{
                border: '1px solid var(--border)', background: '#fff',
                color: 'var(--text-secondary)',
                fontSize: 12, padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                cursor: 'pointer', lineHeight: 1.4,
              }}
            >
              存档
            </button>
            <button
              onClick={handleDelete}
              title="永久删除任务及其所有文档（不可恢复）"
              style={{
                border: '1px solid #fecaca', background: '#fff',
                color: '#b91c1c',
                fontSize: 12, padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                cursor: 'pointer', lineHeight: 1.4,
              }}
            >
              删除
            </button>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', fontSize: 20,
              color: 'var(--text-tertiary)', cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}
            aria-label="关闭"
          >×</button>
        </div>

        {/* 任务名称 */}
        <div>
          <label style={labelStyle}>任务名称</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* 所在栏 */}
        <div>
          <label style={labelStyle}>所在栏</label>
          <select
            value={column}
            onChange={e => setColumn(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {columns.map(c => (
              <option key={c.name} value={c.name}>{c.display}</option>
            ))}
          </select>
        </div>

        {/* 描述 */}
        <div>
          <label style={labelStyle}>描述</label>
          <textarea
            ref={descRef}
            aria-label="描述"
            value={description}
            onChange={e => setDescription(e.target.value)}
            style={{
              ...inputStyle,
              resize: 'none',
              overflow: 'auto',
              minHeight: 72,
              maxHeight: 360,
              height: 72,
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* 子任务 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={labelStyle}>子任务</label>
            <button
              onClick={addSubtask}
              style={{
                border: '1px solid var(--border)', background: '#fff',
                color: 'var(--accent)', fontSize: 12, padding: '3px 10px',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              }}
            >+ 添加</button>
          </div>
          {subtasks.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '4px 0' }}>（暂无子任务）</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {subtasks.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={s.done}
                    onChange={e => updateSubtask(i, { done: e.target.checked })}
                    style={{ cursor: 'pointer' }}
                  />
                  {s.no && (
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)', minWidth: 18, fontFamily: 'monospace' }}>{s.no}</span>
                  )}
                  {s.tag && (
                    <span style={{ fontSize: 11, color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)', padding: '0 5px', lineHeight: '18px' }}>{s.tag}</span>
                  )}
                  <input
                    value={s.text}
                    onChange={e => updateSubtask(i, { text: e.target.value })}
                    placeholder="子任务内容"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    onClick={() => removeSubtask(i)}
                    style={{
                      border: 'none', background: 'transparent',
                      color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16, padding: '0 4px',
                    }}
                    aria-label="删除子任务"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 任务文档 */}
        <div>
          <label style={{ ...labelStyle, marginBottom: 6 }}>任务文档</label>
          {docsLoading ? (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '4px 0' }}>加载中…</div>
          ) : docs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '4px 0' }}>（暂无文档）</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {docs.map(d => (
                <button
                  key={d.name}
                  onClick={() => openDoc(d)}
                  style={{
                    border: activeDoc?.name === d.name ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: activeDoc?.name === d.name ? 'var(--accent-bg)' : '#fff',
                    color: activeDoc?.name === d.name ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                  }}
                  title={d.name}
                >
                  {d.isImage ? '🖼 ' : '📄 '}{d.name}
                </button>
              ))}
            </div>
          )}

          {/* 文档预览区 */}
          {activeDoc && (
            <div style={{
              marginTop: 8, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-detail)', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 10px', borderBottom: '1px solid var(--border)',
                fontSize: 12, color: 'var(--text-secondary)',
              }}>
                <span style={{ fontWeight: 600 }}>
                  {activeDoc.name === 'logs.md' ? '📋 执行进展' : activeDoc.name}
                  {activeDoc.name === 'logs.md' && (
                    <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 6 }}>
                      （文件变化自动刷新）
                    </span>
                  )}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    onClick={() => reloadActiveDoc({ scrollToBottom: activeDoc.name === 'logs.md' })}
                    disabled={docLoading}
                    title="刷新当前文档"
                    style={{
                      border: 'none', background: 'transparent', color: 'var(--text-tertiary)',
                      cursor: docLoading ? 'not-allowed' : 'pointer', fontSize: 14,
                      padding: '0 4px', lineHeight: 1, opacity: docLoading ? 0.5 : 1,
                    }}
                    aria-label="刷新"
                  >↻</button>
                  <button
                    onClick={() => { setActiveDoc(null); setDocContent(null); setDocError(''); }}
                    style={{
                      border: 'none', background: 'transparent', color: 'var(--text-tertiary)',
                      cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1,
                    }}
                    aria-label="关闭预览"
                  >×</button>
                </div>
              </div>
              <div ref={previewScrollRef} style={{ padding: 12, maxHeight: 320, overflow: 'auto' }}>
                {docLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>加载中…</div>
                ) : docError ? (
                  <div style={{ fontSize: 12, color: '#b91c1c' }}>{docError}</div>
                ) : docContent == null ? null : docContent.type === 'image' ? (
                  <img src={docContent.dataUrl} alt={activeDoc.name} style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)' }} />
                ) : docContent.type === 'markdown' ? (
                  <div
                    className="md-preview"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(docContent.content, { async: false }) as string) }}
                  />
                ) : (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{docContent.content}</pre>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div style={{ fontSize: 13, color: '#b91c1c', padding: '6px 10px', background: '#fef2f2', borderRadius: 'var(--radius-sm)' }}>
            {error}
          </div>
        )}

        {/* 操作按钮 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={btnSecondary}
          >取消</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...btnPrimary, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
          >{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  fontSize: 13,
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
};

const btnPrimary: React.CSSProperties = {
  padding: '7px 16px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  background: 'var(--accent)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 500,
};

const btnSecondary: React.CSSProperties = {
  padding: '7px 16px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: '#fff',
  color: 'var(--text-secondary)',
  fontSize: 13,
};
