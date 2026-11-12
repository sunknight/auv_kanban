import chokidar from 'chokidar';
import { realpathSync } from 'fs';
import { kanbanDir } from './paths.js';

/** 监听项目 .kanban 全树，任何变化触发回调（已去抖） */
export function watchBoard(projectRoot: string, onChange: () => void): () => void {
  let root = kanbanDir(projectRoot);
  // .kanban 可能是指向 ~/.kanban/boards/ 的软链（集中管理）：chokidar 在 followSymlinks:false
  // 下不会进入软链目录，须把监听根 realpath 成中心真实目录。
  // 解析失败（断链/不存在）保持原路径：chokidar 会报 error，由下方 on('error') 吞掉，不打挂服务。
  try { root = realpathSync(root); } catch { /* 保持原路径 */ }
  const watcher = chokidar.watch(root, {
    ignoreInitial: true,
    // 软链不跟随：监听根已 realpath（集中时=中心真实目录，栏位下 ../tasks/ 软链的实体仍在其内、被直接监视）；
    // 任务目录里若有指向看板外的软链，不跟随可防止监视越出看板目录
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
