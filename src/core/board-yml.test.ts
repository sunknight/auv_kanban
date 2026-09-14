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

  it('归一化保留任务的 due/people/type 元数据（CLI 读改写回不丢）', () => {
    mkdirSync(kanbanDir(tmp), { recursive: true });
    writeFileSync(join(kanbanDir(tmp), 'board.yml'), [
      "'next-id': 2",
      'columns:',
      '  - { name: backlog, display: 待办 }',
      'order:',
      "  backlog: ['0001']",
      'tasks:',
      "  '0001':",
      "    created: '2026-01-01T00:00:00.000Z'",
      "    due: '2026-09-20'",
      '    people: [张三, 李四]',
      '    type: 开发',
    ].join('\n'));
    // 模拟 CLI 读改写回（如 move）：写回后再读，元数据必须仍在
    const c = readBoardConfig(tmp);
    writeBoardConfig(tmp, c);
    const reread = readBoardConfig(tmp);
    expect(reread.tasks!['0001']).toMatchObject({
      created: '2026-01-01T00:00:00.000Z',
      due: '2026-09-20',
      people: ['张三', '李四'],
      type: '开发',
    });
    // 写盘文本里 due 是带引号的字符串（不会被 YAML 再解析成日期型）
    const raw = readFileSync(join(kanbanDir(tmp), 'board.yml'), 'utf8');
    expect(raw).toMatch(/due: '?2026-09-20'?/);
  });

  it('归一化清除空值字段、people 去重去空、兼容手写的日期型 due', () => {
    mkdirSync(kanbanDir(tmp), { recursive: true });
    writeFileSync(join(kanbanDir(tmp), 'board.yml'), [
      "'next-id': 2",
      'columns:',
      '  - { name: backlog, display: 待办 }',
      'order:',
      "  backlog: ['0001']",
      'tasks:',
      "  '0001':",
      "    created: '2026-01-01T00:00:00.000Z'",
      "    due: '2026-09-20'",
      '    people: [张三, 张三, ""]',
      "    type: ''",
    ].join('\n'));
    const c = readBoardConfig(tmp);
    // people 去重去空后保留；type 空串清除；due 仍在
    expect(c.tasks!['0001'].people).toEqual(['张三']);
    expect(c.tasks!['0001'].type).toBeUndefined();
    expect(c.tasks!['0001'].due).toBe('2026-09-20');
    writeBoardConfig(tmp, c);
    const raw = readFileSync(join(kanbanDir(tmp), 'board.yml'), 'utf8');
    expect(raw).not.toMatch(/type:/); // 清除后的键不写盘
  });
});
