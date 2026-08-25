import chokidar from 'chokidar';
import { kanbanDir } from './paths.js';

/** 监听项目 .kanban 全树，任何变化触发回调（已去抖） */
export function watchBoard(projectRoot: string, onChange: () => void): () => void {
  const watcher = chokidar.watch(kanbanDir(projectRoot), {
    ignoreInitial: true,
    // 软链不跟随：栏位下的任务软链指向 ../tasks/（实体在监视根内，经 tasks/ 仍被直接监视）；
    // 任务目录里若有指向看板外的软链，不跟随可防止监视越出 .kanban
    // （曾跟随到 /tmp 里的 socket 文件，watch 报错打挂整个服务）。
    followSymlinks: false,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });
  let timer: NodeJS.Timeout | null = null;
  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; onChange(); }, 150);
  };
  watcher.on('all', debounced);
  // 监视异常只记日志不抛出：单个路径 watch 失败（特殊文件等）不应打挂服务
  watcher.on('error', err => console.error('[watch] 监视异常（已忽略）:', (err as Error)?.message ?? err));
  return () => { watcher.close(); };
}
