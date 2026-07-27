import type { Server as SocketIOServer } from 'socket.io';
import type { ProjectEntry } from '../core/types.js';
import { watchBoard } from '../core/watch.js';

export class WatchManager {
  private stoppers = new Map<string, () => void>();
  constructor(private io: SocketIOServer) {}

  startAll(projects: ProjectEntry[]): void {
    for (const p of projects) this.start(p.path);
  }

  start(projectPath: string): void {
    if (this.stoppers.has(projectPath)) return;
    const stop = watchBoard(projectPath, () => {
      this.io.to(`proj:${projectPath}`).emit('board:changed', { project: projectPath });
    });
    this.stoppers.set(projectPath, stop);
  }

  stop(projectPath: string): void {
    this.stoppers.get(projectPath)?.();
    this.stoppers.delete(projectPath);
  }

  stopAll(): void {
    for (const stop of this.stoppers.values()) stop();
    this.stoppers.clear();
  }
}
