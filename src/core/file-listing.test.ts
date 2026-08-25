import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync, symlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DOC_ORDER, FILE_LISTING_NAME, buildFileListing, buildTreeNodes, parseAnnotations, walkTaskDir } from './file-listing.js';

describe('DOC_ORDER', () => {
  it('files.md 排在固定文档末位', () => {
    expect(DOC_ORDER[DOC_ORDER.length - 1]).toBe(FILE_LISTING_NAME);
    expect(DOC_ORDER).toEqual(['main.md', 'todo.md', 'logs.md', 'design.md', 'plan.md', 'readme.md', 'notes.md', 'files.md']);
  });
});

describe('parseAnnotations', () => {
  it('解析 tree 行的「文件名 —— 说明」', () => {
    const content = [
      '# 任务目录文件清单',
      '',
      '.',
      '├── main.md',
      '├── report.html —— 压测报告导出页',
      '└── data.json —— 原始数据 —— 注意后缀归说明',
    ].join('\n');
    const map = parseAnnotations(content);
    expect(map.size).toBe(2);
    expect(map.get('report.html')).toBe('压测报告导出页');
    expect(map.get('data.json')).toBe('原始数据 —— 注意后缀归说明');
  });

  it('tree 缩进感知：子目录内行的键为相对路径，区分同名文件', () => {
    const content = [
      '.',
      '├── assets/',
      '│   ├── logo.png —— 子目录里的说明',
      '│   └── data/',
      '│       └── x.json —— 深层说明',
      '├── logo.png —— 顶层同名文件',
      '└── readme.md',
    ].join('\n');
    const map = parseAnnotations(content);
    expect(map.get('assets/logo.png')).toBe('子目录里的说明');
    expect(map.get('assets/data/x.json')).toBe('深层说明');
    expect(map.get('logo.png')).toBe('顶层同名文件');
    expect(map.size).toBe(3);
  });

  it('无分隔符的 tree 行与普通文本行不产出条目', () => {
    const content = ['# 标题', '普通段落', '├── bare.md', '└── x.json'].join('\n');
    expect(parseAnnotations(content).size).toBe(0);
  });

  it('空内容返回空映射', () => {
    expect(parseAnnotations('').size).toBe(0);
  });
});

describe('buildFileListing', () => {
  it('固定文档序在前、其余字母序在后，末行用 └──', () => {
    const out = buildFileListing(
      [
        { name: 'zzz.html' },
        { name: 'logs.md' },
        { name: 'aaa.json' },
        { name: 'main.md' },
        { name: 'todo.md' },
      ],
      null,
    );
    const body = out.split('\n').filter(l => l.startsWith('├') || l.startsWith('└'));
    expect(body).toEqual([
      '├── main.md',
      '├── todo.md',
      '├── logs.md',
      '├── files.md',
      '├── aaa.json',
      '└── zzz.html',
    ]);
  });

  it('条目缺 files.md 时自动补入（即将生成）', () => {
    const out = buildFileListing([{ name: 'main.md' }], null);
    expect(out).toContain('└── files.md');
  });

  it('tree 块包在代码围栏内（markdown 渲染不丢换行）', () => {
    const out = buildFileListing([{ name: 'main.md' }, { name: 'report.html' }], null);
    expect(out).toContain('```\n.\n├── main.md\n');
    expect(out.trimEnd().endsWith('```')).toBe(true);
  });

  it('保留已有说明，只对仍存在的非固定文件生效', () => {
    const existing = [
      '.',
      '├── main.md',
      '├── report.html —— 压测报告导出页',
      '└── gone.txt —— 已删除文件的说明不应迁移',
    ].join('\n');
    const out = buildFileListing([{ name: 'main.md' }, { name: 'report.html' }], existing);
    expect(out).toContain('└── report.html —— 压测报告导出页');
    expect(out).not.toContain('gone.txt');
  });

  it('固定文档行永不带说明（即使现有内容写过）', () => {
    const existing = '.\n└── logs.md —— 不应出现的作用说明';
    const out = buildFileListing([{ name: 'logs.md' }], existing);
    expect(out).toContain('├── logs.md\n');
    expect(out).not.toContain('不应出现的作用说明');
  });

  it('隐藏文件不列', () => {
    const out = buildFileListing([{ name: '.DS_Store' }, { name: 'main.md' }], null);
    expect(out).not.toContain('.DS_Store');
  });

  it('子目录以 name/ 形式混入字母序', () => {
    const out = buildFileListing([{ name: 'assets', isDir: true }, { name: 'b.md' }], null);
    const body = out.split('\n').filter(l => l.startsWith('├') || l.startsWith('└'));
    expect(body).toContain('├── assets/');
    expect(body.indexOf('├── assets/')).toBeLessThan(body.indexOf('└── b.md'));
  });

  it('空目录只列 files.md', () => {
    const out = buildFileListing([], null);
    const body = out.split('\n').filter(l => l.startsWith('├') || l.startsWith('└'));
    expect(body).toEqual(['└── files.md']);
  });

  it('幂等：用自身输出再生成一次内容不变', () => {
    const entries = [{ name: 'main.md' }, { name: 'report.html' }];
    const once = buildFileListing(entries, null);
    const twice = buildFileListing(entries, once);
    expect(twice).toBe(once);
  });

  it('智能体补的说明在结构更新后保留、新文件裸名列出', () => {
    const entries = [{ name: 'main.md' }, { name: 'report.html' }];
    const once = buildFileListing(entries, null);
    // 智能体给 report.html 补说明（模拟手工编辑后的文件内容；此时 report.html 是末行 └──）
    const annotated = once.replace('└── report.html\n', '└── report.html —— 压测报告导出页\n');
    const next = buildFileListing([...entries, { name: 'new.csv' }], annotated);
    expect(next).toContain('└── report.html —— 压测报告导出页');
    expect(next).toContain('├── new.csv');
    expect(next.indexOf('new.csv')).toBeLessThan(next.indexOf('report.html')); // 字母序
  });

  it('子目录递归展开：tree 缩进、末子节点用 └── 与空格续行、子级字母序', () => {
    const out = buildFileListing(
      [
        { name: 'main.md' },
        { name: 'z.html' },
        { name: 'assets', path: 'assets', isDir: true },
        { name: 'logo.png', path: 'assets/logo.png' },
        { name: 'data', path: 'assets/data', isDir: true },
        { name: 'x.json', path: 'assets/data/x.json' },
      ],
      null,
    );
    const body = out.split('\n').filter(l => l.startsWith('├') || l.startsWith('└') || l.startsWith('│'));
    expect(body).toEqual([
      '├── main.md',
      '├── files.md',
      '├── assets/',
      '│   ├── data/',
      '│   │   └── x.json',
      '│   └── logo.png',
      '└── z.html',
    ]);
  });

  it('嵌套文件的说明按相对路径保留（同名不串），空目录只列目录行', () => {
    const existing = [
      '```',
      '.',
      '├── main.md',
      '├── assets/',
      '│   ├── logo.png —— 子目录说明',
      '│   └── empty/',
      '└── logo.png —— 顶层说明',
      '```',
    ].join('\n');
    const out = buildFileListing(
      [
        { name: 'main.md' },
        { name: 'logo.png' },
        { name: 'assets', path: 'assets', isDir: true },
        { name: 'logo.png', path: 'assets/logo.png' },
        { name: 'empty', path: 'assets/empty', isDir: true },
      ],
      existing,
    );
    expect(out).toContain('└── logo.png —— 顶层说明');
    expect(out).toContain('│   ├── empty/');
    expect(out).toContain('│   └── logo.png —— 子目录说明');
  });

  it('幂等：嵌套结构用自身输出再生成一次内容不变', () => {
    const entries = [
      { name: 'main.md' },
      { name: 'assets', path: 'assets', isDir: true },
      { name: 'x.json', path: 'assets/x.json' },
    ];
    const once = buildFileListing(entries, null);
    expect(buildFileListing(entries, once)).toBe(once);
  });
});

describe('buildTreeNodes', () => {
  it('返回与 files.md 同序的树：根级固定文档序在前、其余字母序；子级纯字母序；files.md 自动补入', () => {
    const nodes = buildTreeNodes([
      { name: 'zz.html' },
      { name: 'main.md' },
      { name: 'assets', path: 'assets', isDir: true },
      { name: 'logo.png', path: 'assets/logo.png' },
      { name: 'aa.json', path: 'assets/aa.json' },
    ]);
    expect(nodes.map(n => n.path)).toEqual(['main.md', 'files.md', 'assets', 'zz.html']);
    const assets = nodes.find(n => n.path === 'assets');
    expect(assets?.children?.map(c => c.path)).toEqual(['assets/aa.json', 'assets/logo.png']);
    expect(assets?.isDir).toBe(true);
  });

  it('乱序输入（子条目先于父目录）自动补父节点；同路径去重', () => {
    const nodes = buildTreeNodes([
      { name: 'x.json', path: 'a/b/x.json' },
      { name: 'a', path: 'a', isDir: true },
      { name: 'x.json', path: 'a/b/x.json' },
    ]);
    const a = nodes.find(n => n.path === 'a');
    expect(a?.children?.[0].path).toBe('a/b');
    expect(a?.children?.[0].children).toHaveLength(1);
  });

  it('纯函数：不修改入参数组', () => {
    const entries: { name: string; path?: string; isDir?: boolean }[] = [{ name: 'main.md' }];
    const snapshot = [...entries];
    buildTreeNodes(entries as never);
    expect(entries).toEqual(snapshot);
  });
});

describe('walkTaskDir', () => {
  const mkRoot = () => mkdtempSync(join(tmpdir(), 'kb-walk-'));

  it('递归返回子目录内文件（path 为相对路径），隐藏文件不返回', () => {
    const root = mkRoot();
    try {
      mkdirSync(join(root, 'assets', 'data'), { recursive: true });
      writeFileSync(join(root, 'main.md'), 'x');
      writeFileSync(join(root, 'assets', 'logo.png'), 'x');
      writeFileSync(join(root, 'assets', 'data', 'x.json'), 'x');
      writeFileSync(join(root, '.DS_Store'), 'junk');
      const paths = walkTaskDir(root).map(e => e.path);
      expect(paths).toContain('main.md');
      expect(paths).toContain('assets/logo.png');
      expect(paths).toContain('assets/data/x.json');
      expect(paths).not.toContain('.DS_Store');
      expect(walkTaskDir(root).find(e => e.path === 'assets')?.isDir).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('软链指向任务外：只列名不展开（不泄漏目标内容），不会抛错', () => {
    const root = mkRoot();
    const outside = mkdtempSync(join(tmpdir(), 'kb-out-'));
    try {
      writeFileSync(join(outside, 'secret.txt'), 'x');
      symlinkSync(outside, join(root, 'evil'));
      const entries = walkTaskDir(root);
      const evil = entries.find(e => e.path === 'evil');
      expect(evil).toBeDefined();
      expect(evil!.isDir).toBeFalsy();
      expect(entries.some(e => e.path === 'evil/secret.txt')).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('软链指向任务内目录同样不展开；软链环不死循环', () => {
    const root = mkRoot();
    try {
      mkdirSync(join(root, 'a'));
      writeFileSync(join(root, 'a', 'f.txt'), 'x');
      symlinkSync(join(root, 'a'), join(root, 'alias'));       // 任务内软链
      symlinkSync(join(root, 'a'), join(root, 'a', 'loop'));   // 环
      const entries = walkTaskDir(root);
      expect(entries.some(e => e.path === 'a/f.txt')).toBe(true);   // 真实目录正常展开
      expect(entries.some(e => e.path === 'alias/f.txt')).toBe(false); // 软链不展开
      expect(entries.some(e => e.path === 'loop/f.txt')).toBe(false);
      expect(entries.find(e => e.path === 'alias')).toBeDefined();   // 软链本身列名
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('失效软链：列名不展开、不抛错', () => {
    const root = mkRoot();
    try {
      symlinkSync(join(tmpdir(), 'kb-nonexistent-target'), join(root, 'dead'));
      const entries = walkTaskDir(root);
      expect(entries.find(e => e.path === 'dead')).toBeDefined();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
