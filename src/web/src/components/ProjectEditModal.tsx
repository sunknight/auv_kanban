import { useState, useEffect } from 'react';
import type { ProjectEntry } from '../types.js';
import { renameProject, deleteProject } from '../api.js';

/**
 * 项目编辑 Modal：改名 + 删除。
 * 入口由侧栏每个项目项的「修改」按钮触发。
 */
export function ProjectEditModal(props: {
  project: ProjectEntry;
  onClose: () => void;
  onSaved: () => void;
  /** 删除当前项目后的善后（如切换到第一个项目） */
  onDeleted: (deletedPath: string) => void;
}) {
  const { project, onClose, onSaved, onDeleted } = props;
  const [name, setName] = useState(project.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('项目名不能为空'); return; }
    if (trimmed === project.name) { onClose(); return; } // 未改动，直接关
    setSaving(true);
    setError('');
    try {
      await renameProject(project.path, trimmed);
      onSaved();
      onClose();
    } catch {
      setError('修改项目名失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`确定删除项目「${project.name}」？\n（仅从列表移除，不删除磁盘上的项目目录）`)) return;
    setSaving(true);
    setError('');
    try {
      await deleteProject(project.path);
      onDeleted(project.path);
      onClose();
    } catch {
      setError('删除项目失败');
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
        padding: '60px 16px',
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
          maxWidth: 420,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* 标题栏 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>修改项目</span>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', fontSize: 20,
              color: 'var(--text-tertiary)', cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}
            aria-label="关闭"
          >×</button>
        </div>

        {/* 路径（只读展示） */}
        <div style={{
          fontSize: 11, color: 'var(--text-tertiary)',
          background: 'var(--bg-detail)', padding: '6px 8px', borderRadius: 'var(--radius-sm)',
          wordBreak: 'break-all', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}>
          {project.path}
        </div>

        {/* 项目名称 */}
        <div>
          <label style={labelStyle}>项目名称</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            onFocus={e => e.target.select()}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            style={inputStyle}
          />
        </div>

        {/* 错误提示 */}
        {error && (
          <div style={{ fontSize: 13, color: '#b91c1c', padding: '6px 10px', background: '#fef2f2', borderRadius: 'var(--radius-sm)' }}>
            {error}
          </div>
        )}

        {/* 操作按钮 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <button
            onClick={handleDelete}
            disabled={saving}
            style={{
              padding: '7px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid #fecaca',
              background: '#fff',
              color: '#b91c1c',
              fontSize: 13,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >删除项目</button>
          <div style={{ display: 'flex', gap: 8 }}>
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
