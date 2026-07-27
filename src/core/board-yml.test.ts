import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readBoardConfig, writeBoardConfig, defaultBoardConfig } from './board-yml.js';
import { kanbanDir } from './paths.js';

describe('board-yml', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'kb-')); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('defaultBoardConfig 返回四栏默认配置', () => {
    const c = defaultBoardConfig();
    expect(c.columns.map(x => x.name)).toEqual(['backlog', 'ready', 'doing', 'done']);
    expect(c.columns.map(x => x.display)).toEqual(['待办', '允许执行', '进行中', '完成']);
    expect(c['next-id']).toBe(1);
    expect(c.order).toEqual({ backlog: [], ready: [], doing: [], done: [] });
  });

  it('readBoardConfig 缺失文件时回退默认配置', () => {
    const c = readBoardConfig(tmp);
    expect(c.columns.map(x => x.name)).toEqual(['backlog', 'ready', 'doing', 'done']);
  });

  it('writeBoardConfig 然后 readBoardConfig 往返一致', () => {
    const c = defaultBoardConfig();
    c['next-id'] = 5;
    c.order.backlog = ['0003', '0001'];
    writeBoardConfig(tmp, c);
    const read = readBoardConfig(tmp);
    expect(read['next-id']).toBe(5);
    expect(read.order.backlog).toEqual(['0003', '0001']);
  });

  it('readBoardConfig 文件损坏时回退默认', () => {
    mkdirSync(kanbanDir(tmp), { recursive: true });
    writeFileSync(join(kanbanDir(tmp), 'board.yml'), '{{invalid yaml');
    const c = readBoardConfig(tmp);
    expect(c.columns.map(x => x.name)).toEqual(['backlog', 'ready', 'doing', 'done']);
  });
});
