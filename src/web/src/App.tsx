import { useState, useEffect, useCallback, useRef } from 'react';
import { getProjects, getBoard, subscribeBoard, addProject, reorderProjects, setLastProject, searchTasksApi } from './api.js';
import type { Board as BoardT, ProjectEntry, Task } from './types.js';
import { ProjectSidebar } from './components/ProjectSidebar.js';
import { ProjectEditModal } from './components/ProjectEditModal.js';
import { Board } from './components/Board.js';
import { TaskModal } from './components/TaskModal.js';
import { HelpModal } from './components/HelpModal.js';

export function App() {
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardT | null>(null);
  const [adding, setAdding] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [error, setError] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectEntry | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  // 搜索（0002）：输入即时过滤（300ms 防抖）。matchedIds=null 表示未过滤；
  // 关键词非空但请求失败也回退 null（不过滤，不阻塞浏览）。
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matchedIds, setMatchedIds] = useState<Set<string> | null>(null);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadProjects = useCallback(async () => {
    const { projects: list, lastProject } = await getProjects();
    setProjects(list);
    // 仅在尚未选中时决定初始项目（刷新/重开的恢复点）：
    // 优先用 lastProject（若仍属项目列表），否则回退到第一个项目。
    setCurrent(prev => {
      if (prev !== null) return prev;
      if (lastProject && list.some(p => p.path === lastProject)) return lastProject;
      return list.length > 0 ? list[0].path : null;
    });
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

  // 0003：当前项目变化即持久化为 lastProject，刷新/重开网页时据此恢复。
  // （首个非 null current 既覆盖恢复来的项目，也覆盖手动切换/新增后的项目。）
  useEffect(() => {
    if (current) setLastProject(current).catch(() => { /* 持久化失败不影响使用 */ });
  }, [current]);

  // 搜索防抖：300ms 内连续输入只发最后一次；空关键词不发请求、立即恢复全量。
  // cancelled 防过期响应：query 已变时，旧关键词的迟到结果不再落地（含 searching 标志）。
  useEffect(() => {
    const q = query.trim();
    if (!current || !q) {
      setMatchedIds(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const ids = await searchTasksApi(current, q);
        if (!cancelled) setMatchedIds(new Set(ids));
      } catch {
        if (!cancelled) setMatchedIds(null);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, current]);

  // 展开搜索框时自动聚焦；ESC 清空并收起（输入法组词中的 ESC 不算，留给输入法取消候选）
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape' || e.nativeEvent.isComposing) return;
    setQuery('');
    setSearchOpen(false);
  };

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

  // 项目拖拽排序：乐观更新本地顺序（立即响应），再持久化到后端
  const handleReorder = async (orderedPaths: string[]) => {
    const byPath = new Map(projects.map(p => [p.path, p]));
    const optimistic = orderedPaths.map(p => byPath.get(p)).filter(Boolean) as ProjectEntry[];
    // 乐观更新仅重排，不丢项目（与后端 reorderProjects 防御一致）
    setProjects(prev => {
      const seen = new Set(orderedPaths);
      const rest = prev.filter(p => !seen.has(p.path));
      return [...optimistic, ...rest];
    });
    try {
      await reorderProjects(orderedPaths);
    } catch {
      setError('项目排序保存失败');
      await loadProjects(); // 回滚到服务端真实顺序
    }
  };

  // 项目删除后善后：若删的是当前项目，切到剩余第一个
  const handleProjectDeleted = async (deletedPath: string) => {
    await loadProjects();
    setCurrent(prev => {
      if (prev !== deletedPath) return prev;
      const rest = projects.filter(p => p.path !== deletedPath);
      return rest.length > 0 ? rest[0].path : null;
    });
    setError('');
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
        justifyContent: 'space-between',
        padding: '0 16px',
      }}>
        <div style={{
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.3px',
        }}>
          Auv Kanban
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {current && (searchOpen || query) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* 提示在输入框左侧：搜索组右端锚定 header 右缘，提示文字宽度变化只向左伸展，输入框位置不动 */}
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                {searching ? '搜索中…'
                  : query.trim() === '' ? ''
                  : matchedIds && matchedIds.size > 0 ? `${matchedIds.size} 个匹配`
                  : '无匹配'}
              </span>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                border: '1px solid var(--accent)',
                background: '#fff',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 8px',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>🔍</span>
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="搜索任务…"
                  style={{
                    border: 'none',
                    outline: 'none',
                    fontSize: 12,
                    width: 160,
                    color: 'var(--text-primary)',
                    background: 'transparent',
                    lineHeight: 1.6,
                  }}
                />
                {query && (
                  <button
                    onClick={() => { setQuery(''); setSearchOpen(false); }}
                    title="清空并收起"
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      color: 'var(--text-tertiary)', fontSize: 12, padding: '0 2px', lineHeight: 1.6,
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}
          {current && !searchOpen && !query && (
            <button
              onClick={() => setSearchOpen(true)}
              title="搜索任务（名称/描述/子任务/文档正文）"
              style={{
                border: '1px solid var(--border)',
                background: '#fff',
                color: 'var(--text-secondary)',
                fontSize: 12,
                padding: '3px 12px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                lineHeight: 1.6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              🔍 搜索
            </button>
          )}
          <button
            onClick={() => setShowHelp(true)}
            title="使用帮助"
            style={{
              border: '1px solid var(--border)',
              background: '#fff',
              color: 'var(--text-secondary)',
              fontSize: 12,
              padding: '3px 12px',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              lineHeight: 1.6,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            ? 帮助
          </button>
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
          onEdit={setEditingProject}
          onReorder={handleReorder}
        />
        <main style={{
          flex: 1,
          background: 'var(--bg-body)',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {board ? (
            // searching 期间传 null（不过滤、全部显示），结果返回后才隐藏未匹配——避免「先空白再展示」的跳动
            <Board board={board} project={current!} onOpenDetail={setEditingTask} onTaskCreated={refreshBoard} matchedIds={searching ? null : matchedIds} />
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

      {editingProject && (
        <ProjectEditModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSaved={loadProjects}
          onDeleted={handleProjectDeleted}
        />
      )}

      {showHelp && (
        <HelpModal onClose={() => setShowHelp(false)} />
      )}
    </div>
  );
}
