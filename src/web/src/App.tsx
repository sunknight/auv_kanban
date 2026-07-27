import { useState, useEffect, useCallback } from 'react';
import { getProjects, getBoard, subscribeBoard, addProject, renameProject } from './api.js';
import type { Board as BoardT, ProjectEntry, Task } from './types.js';
import { ProjectSidebar } from './components/ProjectSidebar.js';
import { Board } from './components/Board.js';
import { TaskModal } from './components/TaskModal.js';

export function App() {
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardT | null>(null);
  const [adding, setAdding] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [error, setError] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const loadProjects = useCallback(async () => {
    const list = await getProjects();
    setProjects(list);
    // 若当前未选中项目且列表非空，默认选第一个
    setCurrent(prev => prev ?? (list.length > 0 ? list[0].path : null));
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const refreshBoard = useCallback(async () => {
    if (current) {
      try {
        setBoard(await getBoard(current));
        setError('');
      } catch (e) {
        setBoard(null);
        setError('加载看板失败');
      }
    }
  }, [current]);

  useEffect(() => {
    if (!current) return;
    refreshBoard();
    const unsub = subscribeBoard(current, refreshBoard);
    return unsub;
  }, [current, refreshBoard]);

  const handleSelect = (path: string) => {
    setCurrent(path);
  };

  const handleAdd = async () => {
    if (!newPath.trim()) return;
    try {
      await addProject(newPath.trim());
      const added = newPath.trim();
      setNewPath('');
      setAdding(false);
      await loadProjects();
      setCurrent(added);
    } catch (e) {
      setError('添加项目失败');
    }
  };

  const handleRename = async (path: string, name: string) => {
    try {
      await renameProject(path, name);
      await loadProjects();
    } catch (e) {
      setError('修改项目名失败');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <header style={{
        height: 48,
        minHeight: 48,
        background: 'var(--bg-sidebar)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
      }}>
        <div style={{
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.3px',
        }}>
          Agent Kanban
        </div>
      </header>

      {error && (
        <div style={{
          padding: '8px 16px',
          background: '#fef2f2',
          color: '#b91c1c',
          fontSize: 13,
          borderBottom: '1px solid #fecaca',
        }}>
          {error}
        </div>
      )}

      {/* Main layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ProjectSidebar
          projects={projects}
          current={current}
          onSelect={handleSelect}
          adding={adding}
          newPath={newPath}
          onNewPathChange={setNewPath}
          onStartAdd={() => setAdding(true)}
          onSubmitAdd={handleAdd}
          onCancelAdd={() => { setAdding(false); setNewPath(''); setError(''); }}
          onRename={handleRename}
        />
        <main style={{
          flex: 1,
          background: 'var(--bg-body)',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {board ? (
            <Board board={board} project={current!} onOpenDetail={setEditingTask} />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-tertiary)',
              fontSize: 14,
            }}>
              {projects.length === 0 ? '点击左侧「项目」旁的「+」添加项目' : '从左侧选择一个项目'}
            </div>
          )}
        </main>
      </div>

      {editingTask && current && (
        <TaskModal
          task={editingTask}
          project={current}
          columns={board?.columns.map(c => ({ name: c.name, display: c.display })) ?? []}
          onClose={() => setEditingTask(null)}
          onSaved={refreshBoard}
        />
      )}
    </div>
  );
}
