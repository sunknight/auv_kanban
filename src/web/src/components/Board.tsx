import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { Board as BoardT, Task } from '../types.js';
import { Column } from './Column.js';
import { TaskCardView } from './TaskCard.js';
import { moveTask } from '../api.js';

export function Board(props: {
  board: BoardT;
  project: string;
  onOpenDetail: (task: Task) => void;
  onTaskCreated?: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // PointerSensor 带 8px 活动阈值，避免点「详情」按钮也被判为拖拽
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // 收集所有栏的任务,用于在 DragOverlay 里找到当前拖动的 task
  const allTasks: Task[] = props.board.columns.flatMap(c => c.tasks);
  const activeTask = activeId ? allTasks.find(t => t.id === activeId) ?? null : null;

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const taskId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : '';
    if (!overId) return;

    // 定位 active 任务当前所在栏
    const from = allTasks.find(t => t.id === taskId);
    if (!from) return;
    const fromCol = from.column;

    // over 可能是某张卡片 id（落到卡片上）或栏名（落到空栏/栏边缘）
    // 判断 overId 是否是栏名
    const overIsColumn = props.board.columns.some(c => c.name === overId);

    let toCol: string;
    // 后端契约：把 active 插到「移除 active 后」的目标栏数组的 toIndex 位置。
    // 这里算出的 toIndex 已对齐该契约（即 active 最终在目标栏的 index）。
    let toIndex: number;

    if (overIsColumn) {
      // 落到某栏整体：放该栏末尾
      toCol = overId;
      const col = props.board.columns.find(c => c.name === toCol)!;
      toIndex = col.tasks.length - (toCol === fromCol ? 1 : 0);
    } else {
      // 落到某卡片上：以该卡片所在栏为目标栏，插到它当前所在位置
      const overTask = allTasks.find(t => t.id === overId);
      if (!overTask) return;
      toCol = overTask.column;
      const col = props.board.columns.find(c => c.name === toCol)!;
      let overPos = col.tasks.findIndex(t => t.id === overId);
      if (overPos === -1) overPos = col.tasks.length;
      // 同栏且 active 原来在 over 之前：移除 active 后 over 的位置会前移一位，
      // 后端先移除 active 再插入 toIndex，故这里减 1 才能让 active 落在 over 原位。
      if (toCol === fromCol) {
        const activePos = col.tasks.findIndex(t => t.id === taskId);
        if (activePos !== -1 && activePos < overPos) overPos -= 1;
      }
      toIndex = overPos;
    }

    await moveTask(props.project, taskId, toCol, toIndex);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div style={{
        display: 'flex',
        gap: 16,
        padding: 16,
        minWidth: 0,  // 关键：容器宽度只由可用空间决定，不随内容（如卡片里 nowrap 的长 prompt）膨胀。
        // 各栏 flex-basis 0 + [240,360] 限幅 → 窗口变窄时等比收缩；仅当可用宽跌破 Σ(240)+间距
        // 才溢出由外层 main 滚动。若改成 min-content，内容最小宽会冻结容器，栏宽完全不缩（曾经的 bug）。
        height: '100%',
      }}>
        {props.board.columns.map(col => (
          <Column key={col.name} column={col} project={props.project} onOpenDetail={props.onOpenDetail} onTaskCreated={props.onTaskCreated} />
        ))}
      </div>
      {/* 拖拽 overlay:渲染在独立层,永远在最上层,不被栏遮挡。用纯展示组件避免 sortable 上下文告警 */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <TaskCardView task={activeTask} onOpenDetail={props.onOpenDetail} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
