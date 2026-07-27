import { describe, it, expect } from 'vitest';
import { computeProgress } from './progress.js';
import type { ParsedMainMd } from './types.js';

const mk = (subtasks: { done: boolean }[]): ParsedMainMd => ({
  title: 't', description: '', prompt: '',
  subtasks: subtasks.map((s, i) => ({ no: String(i + 1).padStart(2, '0'), index: i + 1, done: s.done, tag: '', text: 'x', line: i + 1 })),
});

describe('progress', () => {
  it('空子任务返回 0/0', () => {
    expect(computeProgress(mk([]))).toEqual([0, 0]);
  });
  it('部分完成', () => {
    expect(computeProgress(mk([{ done: true }, { done: false }, { done: true }]))).toEqual([2, 3]);
  });
  it('全部完成', () => {
    expect(computeProgress(mk([{ done: true }, { done: true }]))).toEqual([2, 2]);
  });
});
