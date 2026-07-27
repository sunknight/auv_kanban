import chokidar from 'chokidar';
import { kanbanDir } from './paths.js';

/** 监听项目 .kanban 全树，任何变化触发回调（已去抖） */
export function watchBoard(projectRoot: string, onChange: () => void): () => void {
  const watcher = chokidar.watch(kanbanDir(projectRoot), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });
  let timer: NodeJS.Timeout | null = null;
  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; onChange(); }, 150);
  };
  watcher.on('all', debounced);
  return () => { watcher.close(); };
}
