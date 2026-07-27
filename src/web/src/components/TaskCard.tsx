import { useDraggable } from '@dnd-kit/core';
import type { Task } from '../types.js';

export function TaskCard(props: { task: Task; project: string; onOpenDetail: (task: Task) => void }) {
  const { task, onOpenDetail } = props;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const [done, total] = task.progress;
  const pct = total === 0 ? 0 : (done / total) * 100;
  // 拖拽中的原卡片变半透明占位(DragOverlay 负责实际的浮动卡片)
  const style: React.CSSProperties = isDragging
    ? { opacity: 0.4 }
    : {};

  return (
    <div
      ref={setNodeRef}
      style={{
        background: 'var(--bg-card)',
        margin: '0 0 10px 0',
        padding: 12,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--border)',
        cursor: 'grab',
        ...style,
      }}
      {...attributes} {...listeners}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
          lineHeight: 1.4,
        }}>
          {task.name}
        </div>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onOpenDetail(task); }}
          style={{
            fontSize: 12,
            color: 'var(--text-tertiary)',
            background: 'transparent',
            border: 'none',
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
        >
          详情
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
        #{task.id}
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${pct}%`, background: 'var(--success)',
              borderRadius: 3, transition: 'width 0.2s',
            }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 30, textAlign: 'right' }}>
            {done}/{total}
          </div>
        </div>
      </div>

      {task.main?.prompt && (
        <div style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          marginTop: 8,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {task.main.prompt}
        </div>
      )}
    </div>
  );
}
