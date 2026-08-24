import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Task, DocInfo, DocContent } from '../types.js';
import { updateTask, moveTask, listDocs, readDoc, archiveTask, deleteTask, subscribeBoard, getTask, addTodo } from '../api.js';
import { loadDraft, saveDraft, clearDraft } from '../drafts.js';
import { copyText, buildRunCommand } from '../clipboard.js';
import { TodoPreview } from './TodoPreview.js';

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

  // 草稿暂存（仅描述）：打开 modal 时先尝试恢复 localStorage 里未保存的描述草稿，
  // 找到则用草稿描述初始化，否则用任务当前描述。标题/栏/子任务不暂存，始终用磁盘值。
  const restoredDraft = useMemo(() => loadDraft(project, task.id), [project, task.id]);
  const [title, setTitle] = useState(task.name);
  const [description, setDescription] = useState(restoredDraft?.description ?? task.main?.description ?? '');
  // 提示词数据保留（隐藏编辑区，但保存时回填原值，避免丢数据）
  const [prompt] = useState(task.main?.prompt ?? '');
  const [subtasks, setSubtasks] = useState<EditableSubtask[]>(
    (task.main?.subtasks ?? []).map(s => ({ no: s.no, tag: s.tag, text: s.text, done: s.done })),
  );
  const [column, setColumn] = useState(task.column);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 未保存状态指示：modal 初始化时若加载到描述草稿，标记"已恢复未保存草稿"，
  // 用于显示更醒目的提示条（让用户明确意识到当前内容尚未真正存盘）。
  // 用户开始编辑或保存后、或外部改动覆盖后会复位。
  const [restoredFromDraft, setRestoredFromDraft] = useState(!!restoredDraft);

  // 已存盘基线快照：打开 modal 时 = 任务当前值；每次保存成功 / 外部改动同步后刷新为最新值。
  // 用于派生 dirty（当前编辑值 ≠ 基线 = 有未保存修改）。
  const [baseline, setBaseline] = useState(() => ({
    title: task.name,
    description: task.main?.description ?? '',
    column: task.column,
    subtasks: (task.main?.subtasks ?? []).map(s => ({ no: s.no, tag: s.tag, text: s.text, done: s.done })),
  }));
  const dirty = useMemo(() => {
    const curSub = JSON.stringify(subtasks.map(s => ({ no: s.no, tag: s.tag, text: s.text, done: s.done })));
    const baseSub = JSON.stringify(baseline.subtasks.map(s => ({ no: s.no, tag: s.tag, text: s.text, done: s.done })));
    return title !== baseline.title || description !== baseline.description || column !== baseline.column || curSub !== baseSub;
  }, [title, description, column, subtasks, baseline]);

  // 外部改动同步提示：任务被外部（agent/拖拽/直接改md）更新并已用磁盘值同步后，
  // 短暂显示一条提示，约 2 秒后消失。
  const [syncedNotice, setSyncedNotice] = useState(false);

  // 任务文档
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [activeDoc, setActiveDoc] = useState<DocInfo | null>(null);
  const [docContent, setDocContent] = useState<DocContent | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState('');

  // 复制执行命令反馈态
  const [copied, setCopied] = useState(false);

  // todo.md 添加表单：预览 todo.md 时点「＋添加」弹出；任务尚无 todo.md 时文档区
  // 显示「＋ todo.md」占位标签，点它同样弹出——提交成功才真正建文件，取消不产生文件。
  const [todoFormOpen, setTodoFormOpen] = useState(false);
  const [todoTitle, setTodoTitle] = useState('');
  const [todoContent, setTodoContent] = useState('');
  const [addingTodo, setAddingTodo] = useState(false);
  const [todoFormError, setTodoFormError] = useState('');

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

  // 草稿暂存（仅描述）：描述变化时 debounce ~800ms 写入 localStorage（不写后端、不广播看板）。
  // 用 ref 持有最新描述，供卸载兜底读取（effect 闭包会拿到旧值）。
  const draftDescRef = useRef(description);
  draftDescRef.current = description;
  useEffect(() => {
    const h = setTimeout(() => {
      // 仅当描述与基线不同（dirty）才暂存，干净态不产生草稿
      if (draftDescRef.current !== baseline.description) {
        saveDraft(project, task.id, { description: draftDescRef.current });
      }
    }, 800);
    return () => clearTimeout(h);
  }, [project, task.id, description, baseline.description]);

  // 卸载兜底：modal 关闭时立即同步写一次最新描述草稿（debounce 未触发的尾部编辑不丢）。
  // 仅在描述与基线不同（dirty）时写，干净关闭不产生草稿。
  useEffect(() => {
    return () => {
      if (draftDescRef.current !== baseline.description) {
        saveDraft(project, task.id, { description: draftDescRef.current });
      }
    };
    // 故意只在卸载时跑一次：依赖 baseline/project/task.id 用于读取最新值，但首次挂载不写。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      .finally(() => setDocLoading(false));
  }, [project, task.id]);

  // 提交添加 todo：append（文件不存在则建）→ 刷新文档列表（占位标签消失）→
  // 打开 todo.md 预览显示新事项 → 刷新看板（卡片 todo 标签计数同步）
  const submitTodo = async () => {
    if (!todoTitle.trim() || addingTodo) return;
    setAddingTodo(true);
    setTodoFormError('');
    try {
      await addTodo(project, task.id, todoTitle, todoContent);
      setTodoFormOpen(false);
      setTodoTitle('');
      setTodoContent('');
      listDocs(project, task.id).then(setDocs).catch(() => { /* 静默 */ });
      openDoc({ name: 'todo.md', ext: 'md', isImage: false });
      onSaved();
    } catch {
      setTodoFormError('添加失败，请重试');
    } finally {
      setAddingTodo(false);
    }
  };

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

  // socket 自动刷新：看板任意文件变化时（如 agent 增量写 logs.md / 外部改任务），
  // ① 重载文档列表（捕捉新增/删除的文件，如 agent 刚创建 logs.md）；
  // ② 若当前正预览 logs.md，重载其内容并滚到底，看最新进展；
  // ③ 重载任务本身：若被外部改动（改md/拖拽/agent），用磁盘最新值同步编辑区，
  //    描述走"磁盘mtime vs 暂存savedAt"时间戳对比——磁盘更新则覆盖并清草稿，
  //    用户编辑更新（savedAt 更新）则保留；标题/栏/子任务始终用磁盘值刷新。
  // 用 ref 持有 baseline，避免本 effect 依赖 baseline 导致频繁重订阅。
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;
  // 记录"自己保存产生的 mtime"：用户点保存后，socket 会推送这次写入引发的 board 变化，
  // 那不是外部改动。回调里若 diskMtime 与之一致则跳过同步提示。
  const selfWriteMtimeRef = useRef<number | null>(null);
  useEffect(() => {
    const unsub = subscribeBoard(project, () => {
      // 重载文档列表（不重置 activeDoc，避免打断人正在看的文档）
      listDocs(project, task.id)
        .then(list => { setDocs(list); })
        .catch(() => { /* 静默：列表刷新失败不影响内容预览 */ });
      // 若正在看 logs.md（滚到底看最新进展）或 todo.md（同步外部勾选），重载内容
      const curDoc = activeDocRef.current?.name;
      if (curDoc === 'logs.md') {
        reloadActiveDoc({ scrollToBottom: true });
      } else if (curDoc === 'todo.md') {
        reloadActiveDoc();
      }
      // 重载任务，处理外部改动
      getTask(project, task.id).then(latest => {
        if (!latest || !latest.main) return;
        const diskDesc = latest.main.description ?? '';
        const diskMtime = latest.mtime;
        // 自己的保存也会触发 board 变化：若 mtime 与自己刚保存的一致，是自己的写入而非外部改动，
        // 只刷新基线，不弹同步提示、不动描述（用户刚保存的就是当前内容）。
        const isSelfWrite = diskMtime != null && diskMtime === selfWriteMtimeRef.current;
        if (isSelfWrite) {
          selfWriteMtimeRef.current = null; // 消费一次后复位
          setBaseline({
            title: latest.name,
            description: diskDesc,
            column: latest.column,
            subtasks: (latest.main.subtasks ?? []).map(s => ({ no: s.no, tag: s.tag, text: s.text, done: s.done })),
          });
          return;
        }
        const draft = loadDraft(project, task.id);
        // 描述来源决策：磁盘更新（mtime > 暂存时间，或无草稿）→ 用磁盘值并清草稿；
        // 用户编辑更新（有草稿且 savedAt >= mtime）→ 保留用户描述。
        const diskWins = diskMtime != null && (draft == null || diskMtime > draft.savedAt);
        const useDesc = diskWins ? diskDesc : (draft?.description ?? baselineRef.current.description);
        if (diskWins && draft) clearDraft(project, task.id);
        // 用磁盘值刷新标题/栏/子任务（它们不暂存）；描述按上述决策
        setTitle(latest.name);
        setColumn(latest.column);
        setSubtasks((latest.main.subtasks ?? []).map(s => ({ no: s.no, tag: s.tag, text: s.text, done: s.done })));
        setDescription(useDesc);
        setRestoredFromDraft(false);
        setBaseline({
          title: latest.name,
          description: diskDesc,
          column: latest.column,
          subtasks: (latest.main.subtasks ?? []).map(s => ({ no: s.no, tag: s.tag, text: s.text, done: s.done })),
        });
        setSyncedNotice(true);
        setTimeout(() => setSyncedNotice(false), 2000);
      }).catch(() => { /* 静默：任务重载失败不打断 */ });
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

  // 复制执行命令到剪贴板：命令生成与剪贴板写入复用共享 clipboard.ts，
  // 与 TaskCard 卡片上的复制按钮保持同一份实现。
  const copyRunCommand = useCallback(async () => {
    const ok = await copyText(buildRunCommand(task.id, task.name));
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
      clearDraft(project, task.id); // 清草稿，避免孤儿指向已存档任务
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
      clearDraft(project, task.id); // 清草稿，避免孤儿指向已删除任务
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

  const handleSave = async (opts?: { keepOpen?: boolean }) => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: title.trim() || task.name,
        description,
        prompt,
        subtasks: subtasks.map(s => ({ no: s.no, tag: s.tag, text: s.text, done: s.done })),
      };
      const saved = await updateTask(project, task.id, payload);
      if (column !== task.column) {
        await moveTask(project, task.id, column);
      }
      // 保存成功：清草稿（落库的内容不再需要暂存）、刷新基线、复位未保存指示。
      clearDraft(project, task.id);
      setBaseline({
        title: payload.title,
        description: payload.description,
        column,
        subtasks: payload.subtasks.map(s => ({ no: s.no, tag: s.tag, text: s.text, done: s.done })),
      });
      setRestoredFromDraft(false);
      // 记录自己这次保存产生的 mtime：socket 会随后推送这次写入引发的 board 变化，
      // 回调里据此跳过"外部改动同步提示"——那是自己的保存，不是外部改动。
      selfWriteMtimeRef.current = saved.mtime ?? null;
      onSaved();
      if (!opts?.keepOpen) onClose();
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
          maxWidth: 920,
          maxHeight: 'calc(100vh - 80px)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          overflow: 'hidden', // 约束子内容在 maxHeight 内，超长由内部各自滚动，而非溢出 modal 外
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

        {/* 左右双列区：左编辑 / 右文档。两列始终并排（不 wrap），
            各自 minHeight:0 + overflow 约束在 modal 高度内滚动。
            flex-wrap 会让子项高度跟内容走而撑破 modal，故改用固定并排。 */}
        <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        {/* 左列：编辑区。minHeight:0 + overflow:auto 让内容超长时左列自身滚动。 */}
        <div style={{ flex: 5, minWidth: 280, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

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

        {/* 未保存状态指示（随表单，在按钮上方） */}
        {restoredFromDraft && dirty ? (
          <div style={{ fontSize: 13, color: '#92400e', padding: '6px 10px', background: '#fef3c7', borderRadius: 'var(--radius-sm)', border: '1px solid #fde68a' }}>
            ⬇ 已恢复未保存的草稿，当前内容尚未存盘，记得保存。
          </div>
        ) : dirty ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '2px 2px' }}>
            ● 有未保存的修改（已自动暂存，关闭后可恢复）
          </div>
        ) : null}

        {/* 外部改动同步提示（短暂） */}
        {syncedNotice && (
          <div style={{ fontSize: 12, color: '#1d4ed8', padding: '6px 10px', background: '#eff6ff', borderRadius: 'var(--radius-sm)', border: '1px solid #bfdbfe' }}>
            ↻ 任务已被外部更新，已同步最新内容。
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div style={{ fontSize: 13, color: '#b91c1c', padding: '6px 10px', background: '#fef2f2', borderRadius: 'var(--radius-sm)' }}>
            {error}
          </div>
        )}

        {/* 保存按钮：作为编辑表单的一部分（不再放 modal 底部；去掉取消，关闭用右上角 ×） */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={() => handleSave({ keepOpen: true })}
            disabled={saving}
            style={{ ...btnPrimary, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
          >{saving ? '保存中...' : '保存并继续'}</button>
          <button
            onClick={() => handleSave()}
            disabled={saving}
            style={{ ...btnPrimary, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
          >{saving ? '保存中...' : '保存并关闭'}</button>
        </div>
        </div>
        {/* 左列：编辑区结束 */}

        {/* 右列：文档区（上方文档类别，下方预览）。
            overflow:hidden + minHeight:0 强制遵守 flex 分配的高度，
            让内部预览区滚动而非被超长内容撑破 modal。 */}
        <div style={{
          flex: 5, minWidth: 300, minHeight: 0, overflow: 'hidden',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <label style={{ ...labelStyle, marginBottom: 2 }}>任务文档</label>
          {docsLoading ? (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '4px 0' }}>加载中…</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {docs.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '4px 0' }}>（暂无文档）</span>
              )}
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
              {!docs.some(d => d.name === 'todo.md') && (
                <button
                  onClick={() => { setTodoFormOpen(true); setTodoFormError(''); }}
                  title="记录一条延后事项——提交后自动创建 todo.md（取消不会产生文件）"
                  style={{
                    border: '1px dashed var(--border)', background: 'transparent',
                    color: 'var(--text-tertiary)', fontSize: 12, padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  }}
                >＋ todo.md</button>
              )}
            </div>
          )}

          {/* 文档预览区（常驻：有 activeDoc 显示内容，无则空态占位，避免布局抖动）。
              minHeight:0 允许内容超长时收缩并触发内部滚动（否则会被内容撑破 modal）。 */}
          <div style={{
            flex: 1, minHeight: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-detail)', display: 'flex', flexDirection: 'column',
          }}>
            {activeDoc ? (
              <>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px', borderBottom: '1px solid var(--border)',
                  fontSize: 12, color: 'var(--text-secondary)',
                }}>
                  <span style={{ fontWeight: 600 }}>
                    {activeDoc.name === 'logs.md' ? '📋 执行进展' : activeDoc.name === 'todo.md' ? '🗒 延后事项' : activeDoc.name}
                    {activeDoc.name === 'logs.md' && (
                      <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 6 }}>
                        （文件变化自动刷新）
                      </span>
                    )}
                    {activeDoc.name === 'todo.md' && (
                      <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 6 }}>
                        （点选勾选框即标记完成）
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {activeDoc.name === 'todo.md' && (
                      <button
                        onClick={() => { setTodoFormOpen(true); setTodoFormError(''); }}
                        title="追加一条延后事项到 todo.md 末尾"
                        style={{
                          border: 'none', background: 'transparent', color: 'var(--text-tertiary)',
                          cursor: 'pointer', fontSize: 12, padding: '0 4px', lineHeight: 1,
                        }}
                        aria-label="添加 todo"
                      >＋添加</button>
                    )}
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
                <div ref={previewScrollRef} style={{ padding: 12, flex: 1, overflow: 'auto' }}>
                  {docLoading ? (
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>加载中…</div>
                  ) : docError ? (
                    <div style={{ fontSize: 12, color: '#b91c1c' }}>{docError}</div>
                  ) : docContent == null ? null : docContent.type === 'image' ? (
                    <img src={docContent.dataUrl} alt={activeDoc.name} style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)' }} />
                  ) : docContent.type === 'markdown' && activeDoc.name === 'todo.md' ? (
                    <TodoPreview
                      content={docContent.content}
                      project={project}
                      taskId={task.id}
                      onChanged={() => { reloadActiveDoc(); onSaved(); }}
                    />
                  ) : docContent.type === 'markdown' ? (
                    <div
                      className="md-preview"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(docContent.content, { async: false }) as string) }}
                    />
                  ) : (
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{docContent.content}</pre>
                  )}
                </div>
              </>
            ) : (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: 'var(--text-tertiary)', padding: 16, textAlign: 'center',
              }}>
                {docs.length === 0 ? '该任务暂无文档' : '选择上方文档查看内容'}
              </div>
            )}
          </div>
        </div>
        </div>
        {/* 左右双列区结束 */}

        {/* todo 添加表单浮层：盖在 modal 之上（zIndex 更高），点遮罩关闭 */}
        {todoFormOpen && (
          <div
            onClick={() => { if (!addingTodo) setTodoFormOpen(false); }}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1100,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#fff', borderRadius: 'var(--radius-md)',
                boxShadow: '0 10px 40px rgba(0,0,0,0.2)', width: 420, maxWidth: '90vw',
                padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>添加延后事项</div>
              <div>
                <label style={labelStyle}>标题（单行）</label>
                <input
                  value={todoTitle}
                  onChange={e => setTodoTitle(e.target.value)}
                  placeholder="如 支持导出 PDF"
                  style={inputStyle}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') submitTodo(); }}
                />
              </div>
              <div>
                <label style={labelStyle}>内容（可选，多行，写在标题下方）</label>
                <textarea
                  value={todoContent}
                  onChange={e => setTodoContent(e.target.value)}
                  placeholder={'补充说明、背景、参考……\n不要用 - [ ] 开头（会被认成新事项）'}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 72, fontFamily: 'inherit' }}
                />
              </div>
              {todoFormError && (
                <div style={{ fontSize: 12, color: '#b91c1c' }}>{todoFormError}</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  onClick={() => setTodoFormOpen(false)}
                  disabled={addingTodo}
                  style={{ ...btnSecondary, cursor: 'pointer' }}
                >取消</button>
                <button
                  onClick={submitTodo}
                  disabled={addingTodo || !todoTitle.trim()}
                  style={{ ...btnPrimary, opacity: addingTodo || !todoTitle.trim() ? 0.6 : 1, cursor: addingTodo ? 'not-allowed' : 'pointer' }}
                >{addingTodo ? '添加中...' : '添加'}</button>
              </div>
            </div>
          </div>
        )}
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
