import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * 应用内二次确认弹窗（替代 window.confirm）。
 * 原生 confirm 在 iframe（如 TermStep 内嵌）中会被浏览器静默拦截并直接返回 false，
 * 导致删除等操作永远无法确认；自绘弹窗不依赖浏览器对话框，任何嵌入环境都可用。
 *
 * 用法：
 *   const { confirm, confirmElement } = useConfirm();
 *   if (!(await confirm({ title: '删除任务', message: '…', danger: true }))) return;
 *   // …执行删除…
 *   return (<>…{confirmElement}</>);  // confirmElement 渲染在组件树任意位置（position: fixed）
 */

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  /** 确认按钮文案，默认「确定」 */
  confirmText?: string;
  /** 危险操作：确认按钮红色 */
  danger?: boolean;
}

type ConfirmState = ConfirmOptions & { resolve: (ok: boolean) => void };

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>(resolve => setState({ ...opts, resolve }));
  }, []);

  const settle = useCallback((ok: boolean) => {
    setState(prev => {
      prev?.resolve(ok);
      return null;
    });
  }, []);

  const confirmElement = state ? <ConfirmDialog state={state} onSettle={settle} /> : null;
  return { confirm, confirmElement };
}

function ConfirmDialog(props: { state: ConfirmState; onSettle: (ok: boolean) => void }) {
  const { state, onSettle } = props;
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  // 默认聚焦「取消」：回车即取消，误触回车不会直接执行删除等危险操作
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // ESC 取消。用 capture + stopPropagation 抢在宿主 modal 的 ESC 处理器（bubble 阶段）之前，
  // 确认弹窗开着时 ESC 只关确认弹窗，不连带关掉底下的 TaskModal / ProjectEditModal。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onSettle(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onSettle]);

  return (
    <div
      onClick={() => onSettle(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 1200, // 高于 TaskModal(1000) 及其 todo 表单浮层(1100)
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={state.title}
        style={{
          background: '#fff',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          width: '100%',
          maxWidth: 380,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{state.title}</div>
        {/* pre-line：message 传字符串时 \n 直接换行 */}
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
          {state.message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button ref={cancelRef} onClick={() => onSettle(false)} style={btnSecondary}>取消</button>
          <button
            onClick={() => onSettle(true)}
            style={state.danger ? btnDanger : btnPrimary}
          >{state.confirmText ?? '确定'}</button>
        </div>
      </div>
    </div>
  );
}

const btnPrimary: CSSProperties = {
  padding: '7px 16px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  background: 'var(--accent)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const btnSecondary: CSSProperties = {
  padding: '7px 16px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: '#fff',
  color: 'var(--text-secondary)',
  fontSize: 13,
  cursor: 'pointer',
};

const btnDanger: CSSProperties = {
  padding: '7px 16px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  background: '#dc2626',
  color: '#fff',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};
