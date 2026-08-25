/**
 * 任务目录清单 files.md：目录里出现不可预览文件（txt/md/图片白名单外）或子目录后，
 * Web 打开任务详情时由服务端按需生成/更新，tree 风格**递归**列出目录全部文件（含子目录内）。
 * 固定文档不写作用说明；其他文件的「 —— 说明」由智能体写入，更新结构时**按相对路径**保留。
 * 软链（symlink）一律不展开、只列名：无论指向任务内还是外，杜绝清单被软链引到任务外，也避免软链环死循环。
 */
import { readdirSync } from 'fs';
import { join } from 'path';

/** 目录清单文件名（作为固定文档显示在文档区首行） */
export const FILE_LISTING_NAME = 'files.md';

/**
 * 文档语义优先级：排在前面的优先展示。
 * - main.md 实际不进 docs（已结构化进 Task.main），列在此仅为"理论完整"。
 * - todo.md 紧随其后：延后事项清单，未完成的遗留最该被看见。
 * - logs.md：执行进展日志，doing 栏任务首要关注。
 * - 其后是设计/计划/说明/记录的常规四件套。
 * - files.md：自动维护的目录清单，作为固定文档排末位。
 * 未列出的文档按文件名字母序补在末尾。
 */
export const DOC_ORDER = ['main.md', 'todo.md', 'logs.md', 'design.md', 'plan.md', 'readme.md', 'notes.md', FILE_LISTING_NAME];

/**
 * 目录条目（递归打平后）：name 为显示名（basename），path 为相对任务根的路径，
 * 根级条目 path 缺省等于 name。isDir 为目录标记（渲染为 name/ 并缩进展开子级）。
 */
export interface ListingEntry {
  name: string;
  path?: string;
  isDir?: boolean;
}

/** tree 行前缀字符：竖线 / 空格 / ├ └ ─ */
const TREE_PREFIX = /^[ │├└─]+/;

/** 说明分隔符：文件名与说明之间 */
const NOTE_SEP = ' —— ';

/**
 * 递归遍历任务目录，返回打平的全部条目（含子目录内文件，父目录先于子条目）。
 * 隐藏文件（`.` 开头）不返回；软链只列名不展开（见文件头注释）；目录不可读时该层静默跳过。
 */
export function walkTaskDir(root: string): ListingEntry[] {
  const out: ListingEntry[] = [];
  const walk = (dir: string, rel: string) => {
    let dirents;
    try { dirents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of dirents) {
      if (d.name.startsWith('.')) continue;
      const path = rel ? `${rel}/${d.name}` : d.name;
      // dirent 对软链报 isSymbolicLink、isDirectory 为 false（lstat 语义），
      // 天然落入「只列名不展开」分支；真实目录才递归。
      if (d.isDirectory()) {
        out.push({ name: d.name, path, isDir: true });
        walk(join(dir, d.name), path);
      } else {
        out.push({ name: d.name, path });
      }
    }
  };
  walk(root, '');
  return out;
}

/**
 * 从现有 files.md 内容解析「相对路径 → 说明」映射。
 * 只认 tree 行（├── / └── 前缀）且带 ` —— ` 分隔符的行；按第一个分隔符切分，
 * 路径或说明本身含 ` —— ` 的余部归入说明。
 * tree 缩进感知：目录行（以 `/` 结尾）之后的更深缩进行归属该目录，拼出相对路径作键
 * （区分不同子目录里的同名文件）；旧版平铺格式缩进为零，退化为按文件名作键，天然兼容。
 */
export function parseAnnotations(content: string): Map<string, string> {
  const map = new Map<string, string>();
  // 目录栈：{depth, name}——depth 由缩进宽度推导（每级 4 字符）
  const dirStack: { depth: number; name: string }[] = [];
  for (const raw of content.split('\n')) {
    const m = TREE_PREFIX.exec(raw);
    if (!m) continue;
    const prefix = m[0].replace(/ +$/, ''); // 去掉连接符与名称之间的空格
    const hasBranch = prefix.endsWith('├──') || prefix.endsWith('└──');
    const depth = hasBranch ? Math.floor((prefix.length - 3) / 4) : 0;
    const rest = raw.slice(m[0].length).trim();
    const sep = rest.indexOf(NOTE_SEP);
    const name = (sep === -1 ? rest : rest.slice(0, sep)).trim();
    if (!name) continue;
    // 弹掉同层及更浅层的目录，当前行的所属目录 = 剩余栈路径
    while (dirStack.length && dirStack[dirStack.length - 1].depth >= depth) dirStack.pop();
    const dirPath = dirStack.map(s => s.name).join('/');
    if (name.endsWith('/')) dirStack.push({ depth, name: name.slice(0, -1) });
    if (sep === -1) continue;
    map.set(dirPath ? `${dirPath}/${name}` : name, rest.slice(sep + NOTE_SEP.length).trim());
  }
  return map;
}

/** 树节点：由打平条目按 path 组装 */
interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
}

/**
 * 生成 files.md 内容。纯函数、确定性（同输入同输出），幂等性靠调用方
 * 「新内容 === 现有内容则不写盘」保证。
 *
 * - 排序：根级固定文档序（DOC_ORDER，含清单自身——条目里没有时自动补入）在前、
 *   其余按文件名字母序；子目录内纯字母序。目录与文件混排。
 * - 隐藏文件（`.` 开头）不列；子目录递归展开（tree 缩进）。
 * - 固定文档行永不带说明；其他文件带回现有内容里已写的说明（按相对路径）。
 */
export function buildFileListing(entries: ListingEntry[], existingContent: string | null): string {
  const notes = existingContent == null ? new Map<string, string>() : parseAnnotations(existingContent);

  // 按相对路径建树（同路径去重；父目录条目缺失时兜底补目录节点，容错乱序输入）
  const roots: TreeNode[] = [];
  const findByPath = (nodes: TreeNode[], path: string): TreeNode | null => {
    for (const n of nodes) {
      if (n.path === path) return n;
      const hit = n.children ? findByPath(n.children, path) : null;
      if (hit) return hit;
    }
    return null;
  };
  const insert = (node: TreeNode) => {
    const i = node.path.lastIndexOf('/');
    if (i === -1) { roots.push(node); return; }
    const parentPath = node.path.slice(0, i);
    let parent = findByPath(roots, parentPath);
    if (!parent) {
      parent = { name: parentPath.slice(parentPath.lastIndexOf('/') + 1), path: parentPath, isDir: true };
      insert(parent);
    }
    (parent.children ??= []).push(node);
  };
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const path = e.path ?? e.name;
    if (seen.has(path)) continue;
    seen.add(path);
    insert({ name: e.name, path, isDir: !!e.isDir });
  }
  if (!seen.has(FILE_LISTING_NAME)) insert({ name: FILE_LISTING_NAME, path: FILE_LISTING_NAME, isDir: false });

  // 排序：根级固定文档序在前 + 其余字母序；子级纯字母序
  const sortNodes = (nodes: TreeNode[], rootLevel: boolean) => {
    if (rootLevel) {
      const fixed = DOC_ORDER.map(p => nodes.find(n => n.path === p)).filter((n): n is TreeNode => n != null);
      const rest = nodes.filter(n => !DOC_ORDER.includes(n.path)).sort((a, b) => a.name.localeCompare(b.name));
      nodes.splice(0, nodes.length, ...fixed, ...rest);
    } else {
      nodes.sort((a, b) => a.name.localeCompare(b.name));
    }
    for (const n of nodes) if (n.children) sortNodes(n.children, false);
  };
  sortNodes(roots, true);

  // 渲染：祖先若为末子节点则用空格缩进，否则用 │ 续行
  const lines: string[] = [];
  const emit = (nodes: TreeNode[], ancestorsLast: boolean[]) => {
    nodes.forEach((n, i) => {
      const last = i === nodes.length - 1;
      const indent = ancestorsLast.map(l => l ? '    ' : '│   ').join('');
      const note = DOC_ORDER.includes(n.path) ? undefined : notes.get(n.path);
      const display = n.isDir ? `${n.name}/` : n.name;
      lines.push(`${indent}${last ? '└──' : '├──'} ${display}${note ? `${NOTE_SEP}${note}` : ''}`);
      if (n.children?.length) emit(n.children, [...ancestorsLast, last]);
    });
  };
  emit(roots, []);

  // tree 块包进代码围栏：markdown 渲染器会把连续普通文本行合并成一段（换行丢失），
  // 围栏内逐行原样显示，且等宽字体下 tree 对齐。
  return [
    '# 任务目录文件清单',
    '',
    '> 由 auv_kanban 在 Web 打开任务详情时自动维护：文件增减时更新结构。',
    '> 文件名后的「 —— 说明」为智能体补充的用途说明，更新时按相对路径保留；固定文档不写说明。',
    '',
    '```',
    '.',
    ...lines,
    '```',
    '',
  ].join('\n');
}
