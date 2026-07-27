import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { Board as BoardT, Task } from '../types.js';
import { Column } from './Column.js';
import { TaskCard } from './TaskCard.js';
import { moveTask } from '../api.js';

export function Board(props: {
  board: BoardT;
  project: string;
  onOpenDetail: (task: Task) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // 收集所有栏的任务,用于在 DragOverlay 里找到当前拖动的 task
  const allTasks: Task[] = props.board.columns.flatMap(c => c.tasks);
  const activeTask = activeId ? allTasks.find(t => t.id === activeId) ?? null : null;

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const taskId = String(e.active.id);
    const toColumn = String(e.over?.id ?? '');
    if (!toColumn) return;
    await moveTask(props.project, taskId, toColumn);
  };

  return (
    <DndContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div style={{
        display: 'flex',
        gap: 16,
        padding: 16,
        minWidth: 'min-content',  // 各栏已设 minWidth，让 flexbox 自适应收缩；仅当总宽跌破各栏下限之和时，外层 main 才出现滚动条
        height: '100%',
      }}>
        {props.board.columns.map(col => (
          <Column key={col.name} column={col} project={props.project} onOpenDetail={props.onOpenDetail} />
        ))}
      </div>
      {/* 拖拽 overlay:渲染在独立层,永远在最上层,不被栏遮挡 */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <TaskCard task={activeTask} project={props.project} onOpenDetail={props.onOpenDetail} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
