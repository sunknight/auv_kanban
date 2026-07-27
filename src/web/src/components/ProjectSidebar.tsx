import { useState } from 'react';
import type { ProjectEntry } from '../types.js';

export function ProjectSidebar(props: {
  projects: ProjectEntry[];
  current: string | null;
  onSelect: (path: string) => void;
  adding: boolean;
  newPath: string;
  onNewPathChange: (value: string) => void;
  onStartAdd: () => void;
  onSubmitAdd: () => void;
  onCancelAdd: () => void;
  onRename: (path: string, name: string) => Promise<void> | void;
}) {
  // 内联改名编辑：editingPath = 正在编辑的项目路径，editValue = 输入框值
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (p: ProjectEntry) => {
    setEditingPath(p.path);
    setEditValue(p.name);
  };
  const cancelEdit = () => { setEditingPath(null); setEditValue(''); };
  const submitEdit = async () => {
    const path = editingPath;
    const name = editValue.trim();
    setEditingPath(null);
    setEditValue('');
    if (path && name) {
      try { await props.onRename(path, name); } catch { /* 忽略：列表不刷新即保持原名 */ }
    }
  };

  return (
    <aside style={{
      flex: '0 1 220px',        // 不抢空间但允许在窗口变窄时收缩
      width: 220,
      minWidth: 160,            // 下限：再窄则整体滚动而非压垮侧栏
      height: '100%',
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 0',
    }}>
      {/* 标题行：「项目」标题 + 右侧「+」按钮，同一行右侧对齐 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px 8px 16px',
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          项目
        </span>
        {!props.adding && (
          <button
            onClick={props.onStartAdd}
            title="添加项目"
            style={{
              width: 22,
              height: 22,
              minWidth: 22,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: '#fff',
              color: 'var(--text-secondary)',
              fontSize: 15,
              lineHeight: 1,
              cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            +
          </button>
        )}
      </div>

      {/* 添加项目表单：点「+」后展开 */}
      {props.adding && (
        <div style={{
          padding: '0 12px 10px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <input
            value={props.newPath}
            onChange={e => props.onNewPathChange(e.target.value)}
            placeholder="项目绝对路径"
            autoFocus
            style={{
              width: '100%',
              padding: '5px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-strong)',
              fontSize: 12,
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onKeyDown={e => { if (e.key === 'Enter') props.onSubmitAdd(); }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button
              onClick={props.onSubmitAdd}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >添加</button>
            <button
              onClick={props.onCancelAdd}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: '#fff',
                color: 'var(--text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >取消</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {props.projects.length === 0 ? (
          <div style={{
            padding: '12px 16px',
            fontSize: 13,
            color: 'var(--text-tertiary)',
          }}>
            暂无项目
          </div>
        ) : (
          props.projects.map(p => {
            const isActive = p.path === props.current;
            const isEditing = editingPath === p.path;
            // 共享的容器样式（编辑态与非编辑态一致，保证视觉连贯）
            const itemStyle: React.CSSProperties = {
              padding: '8px 12px 8px 16px',
              margin: '2px 8px',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--accent)' : 'var(--text-primary)',
              background: isActive ? 'var(--accent-bg)' : 'transparent',
              borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
              marginLeft: isActive ? undefined : 8,
              paddingLeft: isActive ? 12 : undefined,
            };
            if (isEditing) {
              return (
                <div key={p.path} style={{ ...itemStyle, padding: '4px 8px 4px 12px' }}>
                  <input
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    autoFocus
                    onFocus={e => e.target.select()}
                    placeholder="项目名称"
                    style={{
                      width: '100%',
                      padding: '3px 6px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--accent)',
                      fontSize: 13,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') submitEdit();
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    onBlur={submitEdit}
                  />
                </div>
              );
            }
            return (
              <div
                key={p.path}
                onClick={() => props.onSelect(p.path)}
                onDoubleClick={() => startEdit(p)}
                title={`${p.name}\n${p.path}\n（双击改名）`}
                style={{
                  ...itemStyle,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.background = '#f9fafb';
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                {p.name}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
