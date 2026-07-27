import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ColumnWithTasks, Task } from '../types.js';
import { TaskCard } from './TaskCard.js';
import { NewTaskForm } from './NewTaskForm.js';

export function Column(props: {
  column: ColumnWithTasks;
  project: string;
  onOpenDetail: (task: Task) => void;
  onTaskCreated?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: props.column.name });
  // 栏内卡片用 id 数组驱动 SortableContext，决定栏内可排序的项
  const sortableIds = props.column.tasks.map(t => t.id);
  return (
    <div ref={setNodeRef}
      style={{
        flex: '1 1 0',           // 各栏 basis 都为 0，等分剩余空间 → 始终等宽
        minWidth: 240,           // 下限：低于此则宁可由外层滚动，避免卡片被挤变形
        maxWidth: 360,           // 上限：窗口很宽时单栏不至于过宽
        height: '100%',
        maxHeight: '100%',
        background: isOver ? '#eef2ff' : 'var(--bg-column)',
        borderRadius: 'var(--radius-md)',
        border: isOver ? '1px solid var(--accent)' : '1px solid transparent',
        display: 'flex',
        flexDirection: 'column',
        padding: 12,
        transition: 'background 0.15s, border-color 0.15s',
      }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}>
          {props.column.display}
        </div>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          background: '#e5e7eb',
          padding: '1px 7px',
          borderRadius: 10,
        }}>
          {props.column.tasks.length}
        </div>
      </div>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingRight: 4,
      }}>
        {props.column.name === 'backlog' && <NewTaskForm project={props.project} onCreated={props.onTaskCreated} />}
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {props.column.tasks.map(t => (
            <TaskCard key={t.id} task={t} project={props.project} onOpenDetail={props.onOpenDetail} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
