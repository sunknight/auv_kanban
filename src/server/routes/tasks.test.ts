import { describe, it, expect } from 'vitest';
import { sortDocs, DOC_ORDER } from './tasks.js';

describe('sortDocs', () => {
  it('按语义优先级排序：main > todo > logs > design > plan > readme > notes', () => {
    const docs = [
      { name: 'notes.md' },
      { name: 'design.md' },
      { name: 'logs.md' },
      { name: 'plan.md' },
      { name: 'readme.md' },
      { name: 'main.md' },
      { name: 'todo.md' },
    ];
    const sorted = sortDocs(docs).map(d => d.name);
    expect(sorted).toEqual(['main.md', 'todo.md', 'logs.md', 'design.md', 'plan.md', 'readme.md', 'notes.md']);
  });

  it('未列入 DOC_ORDER 的文档按字母序补在末尾', () => {
    const docs = [
      { name: 'zzz.md' },
      { name: 'design.md' },
      { name: 'aaa.md' },
      { name: 'logs.md' },
    ];
    const sorted = sortDocs(docs).map(d => d.name);
    // 语义优先的在前，其余按字母序
    expect(sorted).toEqual(['logs.md', 'design.md', 'aaa.md', 'zzz.md']);
  });

  it('相同优先级（如多个未列出文档）之间按字母序', () => {
    const docs = [{ name: 'b.md' }, { name: 'a.md' }, { name: 'c.md' }];
    const sorted = sortDocs(docs).map(d => d.name);
    expect(sorted).toEqual(['a.md', 'b.md', 'c.md']);
  });

  it('空数组返回空数组', () => {
    expect(sortDocs([])).toEqual([]);
  });

  it('单个文档保持不变', () => {
    expect(sortDocs([{ name: 'logs.md' }])).toEqual([{ name: 'logs.md' }]);
  });

  it('DOC_ORDER 符合约定顺序', () => {
    expect(DOC_ORDER).toEqual(['main.md', 'todo.md', 'logs.md', 'design.md', 'plan.md', 'readme.md', 'notes.md']);
  });

  it('不修改原数组（返回新数组）', () => {
    const docs = [{ name: 'notes.md' }, { name: 'logs.md' }];
    const snapshot = docs.map(d => ({ ...d }));
    sortDocs(docs);
    expect(docs).toEqual(snapshot);
  });
});
