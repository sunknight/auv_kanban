import { useMemo, useState } from 'react';
import type { TreeEntry } from '../types.js';

/** 文件树 UI 节点：由打平的 TreeEntry（DFS 序）组装 */
interface TreeNodeUi {
  entry: TreeEntry;
  children: TreeNodeUi[];
}

/**
 * 文件树浮层：显示任务目录全量递归文件树（与 files.md 清单同序）。
 * - 浮层带**左栏全宽遮罩**（盖住整个左列、zIndex 低于浮层，点击关闭）
 * - 浮层本体占左列右侧 2/3，右缘对齐左右列分界，不遮挡右侧预览区
 * - 目录行点击折叠/展开（默认全展开）
 * - 可预览文件点击即在预览区打开，浮层不关闭（连续操作）
 * - 不可预览文件灰显，点击同样回调（由父级在预览区提示不支持）
 */
export function FileTreePanel(props: {
  tree: TreeEntry[];
  activePath: string | null;
  onOpen: (entry: TreeEntry) => void;
  onClose: () => void;
}) {
  const { tree, activePath, onOpen, onClose } = props;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const nodes = useMemo(() => {
    const roots: TreeNodeUi[] = [];
    const byPath = new Map<string, TreeNodeUi>();
    for (const e of tree) {
      const node: TreeNodeUi = { entry: e, children: [] };
      byPath.set(e.path, node);
      const i = e.path.lastIndexOf('/');
      if (i === -1) roots.push(node);
      else byPath.get(e.path.slice(0, i))?.children.push(node);
    }
    return roots;
  }, [tree]);

  const fileCount = useMemo(() => tree.filter(e => !e.isDir).length, [tree]);

  const renderNodes = (list: TreeNodeUi[], depth: number): React.ReactNode => list.map(n => {
    const pad = { paddingLeft: 6 + depth * 14 };
    if (n.entry.isDir) {
      const isCollapsed = collapsed.has(n.entry.path);
      return (
        <div key={n.entry.path}>
          <div
            onClick={() => setCollapsed(prev => {
              const next = new Set(prev);
              if (next.has(n.entry.path)) next.delete(n.entry.path); else next.add(n.entry.path);
              return next;
            })}
            style={{ ...rowStyle, ...pad, cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}
            title={n.entry.path}
          >
            <span style={{ display: 'inline-block', width: 14, fontSize: 10, color: 'var(--text-tertiary)' }}>{isCollapsed ? '▸' : '▾'}</span>
            📁 {n.entry.name}
          </div>
          {!isCollapsed && n.children.length > 0 && renderNodes(n.children, depth + 1)}
        </div>
      );
    }
    const active = activePath === n.entry.path;
    return (
      <div
        key={n.entry.path}
        onClick={() => onOpen(n.entry)}
        style={{
          ...rowStyle, ...pad,
          cursor: 'pointer',
          color: !n.entry.previewable ? 'var(--text-tertiary)' : active ? 'var(--accent)' : 'var(--text-secondary)',
          background: active ? 'var(--accent-bg)' : 'transparent',
          opacity: n.entry.previewable ? 1 : 0.75,
        }}
        title={n.entry.previewable ? n.entry.path : `${n.entry.path}（该格式暂不支持在线预览）`}
      >
        <span style={{ display: 'inline-block', width: 14 }} />
        {n.entry.name}
      </div>
    );
  });

  return (
    <>
      {/* 左栏全宽遮罩：点左列任意处（浮层外）关闭浮层；不覆盖右侧预览区。
          左列宽 ≈ (行宽-gap)·5/12.2 ≈ 40.5%行宽（随窗口宽微差，误差落在列间隙内）。
          左缘外扩 5px 并带倒角：避免遮罩边与左栏表单控件（任务名称/所在栏）贴边显得拥挤。 */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', top: 0, bottom: 0, left: -5, width: 'calc(40.5% + 5px)',
          background: 'rgba(0, 0, 0, 0.28)', borderRadius: 'var(--radius-md)', zIndex: 40,
        }}
      />
      {/* 浮层本体：左列右侧 2/3（宽 ≈ 27% 行宽），右缘 40.5% 对齐左右列分界，不遮挡预览区 */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: '13.5%', width: '27%',
        zIndex: 50,
        background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 10px', borderBottom: '1px solid var(--border)',
        fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0,
      }}>
        <span>🗂 文件（{fileCount}）</span>
        <button
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
          aria-label="关闭文件树"
        >×</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '6px 4px' }}>
        {tree.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '4px 6px' }}>（空目录）</div>
        ) : renderNodes(nodes, 0)}
      </div>
      </div>
    </>
  );
}

const rowStyle: React.CSSProperties = {
  fontSize: 12, lineHeight: '22px', whiteSpace: 'nowrap',
  borderRadius: 'var(--radius-sm)', paddingRight: 6, userSelect: 'none',
};
