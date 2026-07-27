import { describe, it, expect } from 'vitest';
import { parseMainMd, serializeMainMd } from './main-md.js';

const SAMPLE = `# 实现登录功能

## 描述
这个任务要做登录。

涉及 [ ] 方括号测试。

## 提示词
请实现登录，遵循安全约定。

## 子任务
- [ ] 01 设计表单
- [x] 02 写后端 API
- [ ] 03 前端联调
- [ ] 04 [补充] 存档要二次确认
`;

describe('main-md parseMainMd', () => {
  it('解析标题、描述、提示词、子任务', () => {
    const r = parseMainMd(SAMPLE);
    expect(r.title).toBe('实现登录功能');
    expect(r.description).toContain('这个任务要做登录。');
    expect(r.prompt).toContain('请实现登录');
    expect(r.subtasks).toHaveLength(4);
  });

  it('子任务正确解析编号 no、tag、done、text', () => {
    const r = parseMainMd(SAMPLE);
    expect(r.subtasks[0]).toMatchObject({ no: '01', index: 1, done: false, tag: '', text: '设计表单' });
    expect(r.subtasks[1]).toMatchObject({ no: '02', index: 2, done: true, tag: '', text: '写后端 API' });
    // 带 [补充] 标签的子任务
    expect(r.subtasks[3]).toMatchObject({ no: '04', index: 4, done: false, tag: '补充', text: '存档要二次确认' });
  });

  it('子任务的 line 是在原文中的 1-based 行号', () => {
    const lines = SAMPLE.split('\n');
    const r = parseMainMd(SAMPLE);
    const st = r.subtasks[0];
    expect(lines[st.line - 1]).toBe('- [ ] 01 设计表单');
  });

  it('描述段里的 [ ] 不被误判为子任务', () => {
    const r = parseMainMd(SAMPLE);
    expect(r.subtasks).toHaveLength(4);
  });

  it('## 子任务 区块缺失时 subtasks 为空数组', () => {
    const r = parseMainMd('# T\n\n## 描述\nxx\n\n## 提示词\nyy\n');
    expect(r.subtasks).toEqual([]);
  });

  it('各段都缺失时返回空字符串与空数组', () => {
    const r = parseMainMd('# 仅标题\n');
    expect(r.title).toBe('仅标题');
    expect(r.description).toBe('');
    expect(r.prompt).toBe('');
    expect(r.subtasks).toEqual([]);
  });

  it('空字符串输入不崩溃', () => {
    const r = parseMainMd('');
    expect(r.title).toBe('');
    expect(r.subtasks).toEqual([]);
  });

  it('兼容无编号的旧格式子任务（no 为空，由兜底逻辑处理）', () => {
    const r = parseMainMd('# T\n\n## 描述\n\n## 提示词\n\n## 子任务\n- [ ] 设计表单\n');
    expect(r.subtasks).toHaveLength(1);
    expect(r.subtasks[0].no).toBe('');
    expect(r.subtasks[0].text).toBe('设计表单');
  });
});

describe('main-md serializeMainMd', () => {
  it('序列化带编号与标签的子任务', () => {
    const out = serializeMainMd({
      title: 'T', description: 'd', prompt: 'p',
      subtasks: [
        { no: '01', text: '设计表单', done: false, tag: '' },
        { no: '02', text: '存档要二次确认', done: false, tag: '补充' },
      ],
    });
    expect(out).toContain('- [ ] 01 设计表单');
    expect(out).toContain('- [ ] 02 [补充] 存档要二次确认');
    expect(out).toContain('## 子任务');
  });

  it('无编号/标签的子任务也能序列化', () => {
    const out = serializeMainMd({
      title: 'T', description: 'd', prompt: 'p',
      subtasks: [{ text: '普通子任务', done: true }],
    });
    expect(out).toContain('- [x] 普通子任务');
  });
});
