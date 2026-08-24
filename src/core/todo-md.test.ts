import { describe, it, expect } from 'vitest';
import { parseTodoMd } from './todo-md.js';

describe('parseTodoMd', () => {
  it('解析带 H1 的标准 todo.md：编号/勾选态/文本/行号', () => {
    const md = `# 延后事项

- [ ] 01 支持导出 PDF
- [x] 02 补充单元测试
- [ ] 03 优化首屏速度
`;
    const todos = parseTodoMd(md);
    expect(todos).toHaveLength(3);
    expect(todos[0]).toMatchObject({ no: '01', index: 1, done: false, text: '支持导出 PDF', line: 3 });
    expect(todos[1]).toMatchObject({ no: '02', index: 2, done: true, text: '补充单元测试', line: 4 });
    expect(todos[2]).toMatchObject({ no: '03', index: 3, done: false, text: '优化首屏速度', line: 5 });
  });

  it('无标题的自由格式也能解析（全文扫描 checkbox 行）', () => {
    const md = `- [ ] 01 第一项
正文说明行（非 checkbox，忽略）
- [x] 02 第二项
`;
    const todos = parseTodoMd(md);
    expect(todos).toHaveLength(2);
    expect(todos[0].no).toBe('01');
    expect(todos[1].done).toBe(true);
    expect(todos[1].line).toBe(3);
  });

  it('无编号旧格式：no 为空，按位置序号兜底', () => {
    const md = `- [ ] 无编号事项
- [x] 另一件
`;
    const todos = parseTodoMd(md);
    expect(todos).toHaveLength(2);
    expect(todos[0]).toMatchObject({ no: '', index: 1, text: '无编号事项' });
    expect(todos[1]).toMatchObject({ no: '', index: 2, done: true });
  });

  it('空文件 / 纯文本无 checkbox → 空数组', () => {
    expect(parseTodoMd('')).toEqual([]);
    expect(parseTodoMd('# 标题\n\n只有说明文字。\n')).toEqual([]);
  });
});
