import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties } from 'react';
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
  /** 打开项目编辑 modal（改名 + 删除） */
  onEdit: (project: ProjectEntry) => void;
  /** 拖拽结束：传完整的新顺序路径数组，由上层持久化 */
  onReorder: (orderedPaths: string[]) => void;
}) {
  // 拖拽中浮动的项目（DragOverlay 用）
  const [activePath, setActivePath] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const active = activePath ? props.projects.find(p => p.path === activePath) ?? null : null;
  const sortableIds = props.projects.map(p => p.path);

  const onDragStart = (e: DragStartEvent) => setActivePath(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActivePath(null);
    const fromPath = String(e.active.id);
    const overId = e.over ? String(e.over.id) : '';
    if (!overId || overId === fromPath) return;
    const paths = props.projects.map(p => p.path);
    const fromIdx = paths.indexOf(fromPath);
    const overIdx = paths.indexOf(overId);
    if (fromIdx === -1 || overIdx === -1) return;
    // 移除 from 后插入到 over 位置，产出完整新顺序
    const next = [...paths];
    next.splice(fromIdx, 1);
    next.splice(overIdx, 0, fromPath);
    props.onReorder(next);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
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
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {props.projects.map(p => (
                <SortableProjectItem
                  key={p.path}
                  project={p}
                  isActive={p.path === props.current}
                  onSelect={props.onSelect}
                  onEdit={props.onEdit}
                />
              ))}
            </SortableContext>
          )}
        </div>
      </aside>
      {/* 拖拽 overlay：浮动项目副本，用纯展示组件避免 sortable 上下文告警 */}
      <DragOverlay dropAnimation={null}>
        {active ? (
          <ProjectItemView project={active} isActive={active.path === props.current} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** 可排序的项目项：包裹 useSortable，委托纯展示组件渲染。 */
function SortableProjectItem(props: {
  project: ProjectEntry;
  isActive: boolean;
  onSelect: (path: string) => void;
  onEdit: (project: ProjectEntry) => void;
}) {
  const { project, isActive, onSelect, onEdit } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.path });
  const sortableStyle: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.4 } : {}),
  };
  return (
    <div ref={setNodeRef} style={sortableStyle} {...attributes} {...listeners}>
      <ProjectItemView project={project} isActive={isActive} onSelect={onSelect} onEdit={onEdit} />
    </div>
  );
}

/** 纯展示项目项（供 DragOverlay 与 sortable 共用）。 */
function ProjectItemView(props: {
  project: ProjectEntry;
  isActive: boolean;
  dragging?: boolean;
  onSelect?: (path: string) => void;
  onEdit?: (project: ProjectEntry) => void;
}) {
  const { project, isActive, dragging } = props;
  // 共享容器样式
  const itemStyle: CSSProperties = {
    padding: '8px 12px 8px 16px',
    margin: '2px 8px',
    borderRadius: 'var(--radius-md)',
    fontSize: 13,
    fontWeight: isActive ? 600 : 400,
    color: isActive ? 'var(--accent)' : 'var(--text-primary)',
    background: isActive ? 'var(--accent-bg)' : 'transparent',
    borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  };
  // overlay 浮动副本：固定宽，避免在独立层里被撑满视口
  if (dragging) {
    return (
      <div style={{ ...itemStyle, width: 196, background: '#fff', boxShadow: 'var(--shadow-sm)' }}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.name}</span>
      </div>
    );
  }
  const { onSelect, onEdit } = props;
  return (
    <div
      onClick={() => onSelect?.(project.path)}
      title={`${project.name}\n${project.path}\n（拖拽排序，点「⋯」修改）`}
      style={{
        ...itemStyle,
        cursor: 'pointer',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f9fafb'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {project.name}
      </span>
      <button
        // 阻止冒泡：避免点「⋯」误触发整行的 onSelect
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onEdit?.(project); }}
        title="修改项目（改名 / 删除）"
        style={{
          flex: '0 0 auto',
          width: 20, height: 20, minWidth: 20,
          padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 'var(--radius-sm)',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-tertiary)',
          fontSize: 14, lineHeight: 1,
          cursor: 'pointer',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-bg)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}
      >⋯</button>
    </div>
  );
}
