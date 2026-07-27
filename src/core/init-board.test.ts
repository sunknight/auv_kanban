import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, statSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initBoard } from './init-board.js';
import { kanbanDir } from './paths.js';
import { readBoardConfig } from './board-yml.js';

describe('init-board', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'kb-')); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('initBoard 创建 .kanban 与四栏目录', async () => {
    await initBoard(tmp);
    expect(existsSync(kanbanDir(tmp))).toBe(true);
    for (const c of ['backlog', 'ready', 'doing', 'done']) {
      expect(statSync(join(kanbanDir(tmp), c)).isDirectory()).toBe(true);
    }
  });

  it('initBoard 写入默认 board.yml', async () => {
    await initBoard(tmp);
    const c = readBoardConfig(tmp);
    expect(c.columns.map(x => x.name)).toEqual(['backlog', 'ready', 'doing', 'done']);
    expect(c['next-id']).toBe(1);
  });

  it('initBoard 幂等：已存在时不破坏现有数据', async () => {
    await initBoard(tmp);
    mkdirSync(join(kanbanDir(tmp), 'backlog', '0001-x'));
    await initBoard(tmp); // 再次 init
    expect(existsSync(join(kanbanDir(tmp), 'backlog', '0001-x'))).toBe(true);
  });
});
