import { useState, useEffect, useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { HELP_QUICK_START, HELP_FULL } from '../help.js';

type TabKey = 'quick' | 'full';

/**
 * 帮助 Modal：右上角帮助按钮触发，展示快速入门与完整使用说明。
 * 两个 Tab 用 markdown 渲染，复用 .md-preview 样式。
 */
export function HelpModal(props: { onClose: () => void }) {
  const { onClose } = props;
  const [tab, setTab] = useState<TabKey>('quick');

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 解析 markdown 为净化 HTML（tab 切换时重算）
  const html = useMemo(() => {
    const md = tab === 'quick' ? HELP_QUICK_START : HELP_FULL;
    return DOMPurify.sanitize(marked.parse(md, { async: false }) as string);
  }, [tab]);

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
          maxWidth: 720,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 标题栏 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>使用帮助</span>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', fontSize: 20,
              color: 'var(--text-tertiary)', cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}
            aria-label="关闭"
          >×</button>
        </div>

        {/* Tab 切换 */}
        <div style={{ display: 'flex', gap: 4, padding: '10px 20px 0' }}>
          <TabButton active={tab === 'quick'} onClick={() => setTab('quick')}>快速入门</TabButton>
          <TabButton active={tab === 'full'} onClick={() => setTab('full')}>完整使用说明</TabButton>
        </div>

        {/* 内容区（可滚动） */}
        <div
          className="md-preview"
          style={{ padding: '4px 20px 20px', overflow: 'auto', fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)' }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

function TabButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const { active, onClick, children } = props;
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        background: 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        padding: '6px 12px',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
