import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, lstatSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initBoard } from './init-board.js';
import { moveTask } from './move.js';
import { createTask } from './task-crud.js';
import { locateById } from './locate.js';

describe('move', () => {
  let tmp: string;
  beforeEach(async () => { tmp = mkdtempSync(join(tmpdir(), 'kb-')); await initBoard(tmp); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('moveTask 改栏后：实体目录路径不变、目录名不变，栏软链迁移', async () => {
    const t = await createTask(tmp, '任务X');
    const entityPath = t.path;          // tasks/<dir>，实体路径
    const oldDirName = t.dirName;
    // 初始在 backlog，应在 backlog 建软链
    expect(lstatSync(join(tmp, '.kanban', 'backlog', oldDirName)).isSymbolicLink()).toBe(true);

    await moveTask(tmp, t.id, 'ready');

    const after = locateById(tmp, t.id)!;
    expect(after.column).toBe('ready');
    expect(after.dirName).toBe(oldDirName);       // 目录名不变
    expect(after.path).toBe(entityPath);          // 实体路径不变（核心稳定性）
    expect(existsSync(entityPath)).toBe(true);    // 实体仍在 tasks/
    // backlog 软链已删、ready 软链已建
    expect(existsSync(join(tmp, '.kanban', 'backlog', oldDirName))).toBe(false);
    expect(lstatSync(join(tmp, '.kanban', 'ready', oldDirName)).isSymbolicLink()).toBe(true);
  });

  it('moveTask 同栏移动不报错（幂等）', async () => {
    const t = await createTask(tmp, 'Y');
    await expect(moveTask(tmp, t.id, 'backlog')).resolves.not.toThrow();
  });

  it('moveTask 更新 board.yml 的 order（从源栏移除，目标栏追加末尾）', async () => {
    const t = await createTask(tmp, 'Z');
    await moveTask(tmp, t.id, 'ready');
    const { readBoardConfig } = await import('./board-yml.js');
    const cfg = readBoardConfig(tmp);
    expect(cfg.order.backlog).not.toContain(t.id);
    expect(cfg.order.ready).toContain(t.id);
  });

  it('moveTask 目标栏不存在时报错', async () => {
    const t = await createTask(tmp, 'W');
    await expect(moveTask(tmp, t.id, '不存在的栏')).rejects.toThrow();
  });
});
