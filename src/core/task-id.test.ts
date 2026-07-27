import { describe, it, expect } from 'vitest';
import { formatId, parseDirName, sanitizeName, allocateId } from './task-id.js';
import type { BoardConfig } from './types.js';

describe('task-id', () => {
  it('formatId 4 位零填充', () => {
    expect(formatId(7)).toBe('0007');
    expect(formatId(123)).toBe('0123');
  });

  it('parseDirName 解析 ID 与名称', () => {
    expect(parseDirName('0007-实现登录')).toEqual({ id: '0007', name: '实现登录' });
    expect(parseDirName('0123-修复搜索-高亮')).toEqual({ id: '0123', name: '修复搜索-高亮' });
  });

  it('parseDirName 非法格式返回 null', () => {
    expect(parseDirName('实现登录')).toBeNull();
    expect(parseDirName('7-xx')).toBeNull(); // 必须是 4 位数字
  });

  it('sanitizeName 替换目录非法字符', () => {
    expect(sanitizeName('a/b\\c:d')).toBe('a_b_c_d');
    expect(sanitizeName('正常名称')).toBe('正常名称');
  });

  it('allocateId 返回格式化 ID 并把 next-id +1', () => {
    const cfg: BoardConfig = {
      'next-id': 7,
      columns: [],
      order: {},
    };
    const { id, config } = allocateId(cfg);
    expect(id).toBe('0007');
    expect(config['next-id']).toBe(8);
    expect(cfg['next-id']).toBe(7); // 原对象不变（不可变）
  });
});
