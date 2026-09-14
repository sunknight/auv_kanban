/**
 * 任务元数据（到期/相关人/类型）的前端共享逻辑。
 * 类型清单与配色供卡片 chip 与详情弹窗共用；dueStatus 供卡片着色与弹窗状态提示共用。
 */

/** 任务类型选项（8 类固定清单，name 与 board.yml 存的字符串一致） */
export const TYPE_OPTIONS = ['事务', '开发', '缺陷', '调研', '设计', '文档', '提醒', '其他'] as const;
export type TaskType = typeof TYPE_OPTIONS[number];

/** 浅色 chip 配色（字色/底色/边框），与 todo 标签同风格 */
export interface ChipColors { color: string; background: string; border: string; }

/** 8 类任务的标识色：事务 slate、开发 blue、缺陷 red、调研 cyan、设计 purple、文档 emerald、提醒 amber、其他 zinc */
export const TYPE_COLORS: Record<TaskType, ChipColors> = {
  '事务': { color: '#475569', background: '#f1f5f9', border: '#e2e8f0' },
  '开发': { color: '#1d4ed8', background: '#eff6ff', border: '#bfdbfe' },
  '缺陷': { color: '#b91c1c', background: '#fef2f2', border: '#fecaca' },
  '调研': { color: '#0e7490', background: '#ecfeff', border: '#a5f3fc' },
  '设计': { color: '#7e22ce', background: '#faf5ff', border: '#e9d5ff' },
  '文档': { color: '#047857', background: '#ecfdf5', border: '#a7f3d0' },
  '提醒': { color: '#b45309', background: '#fffbeb', border: '#fde68a' },
  '其他': { color: '#52525b', background: '#f4f4f5', border: '#e4e4e7' },
};

/** 未识别类型（手工改 board.yml 写入的字符串）的中性兜底色 */
export const TYPE_FALLBACK_COLOR: ChipColors = TYPE_COLORS['其他'];

export function typeColors(type: string | undefined): ChipColors | null {
  if (!type) return null;
  return (TYPE_COLORS as Record<string, ChipColors>)[type] ?? TYPE_FALLBACK_COLOR;
}

/** 到期状态：overdue 超期（红）/ near 临近（橙）/ normal 正常（中性）。无日期或已完成返回 null（不着色） */
export type DueStatus = 'overdue' | 'near' | 'normal';

/** 临近窗口：到期日在今天起 2 天内算临近（用户确认） */
const NEAR_DAYS = 2;

/** 本地时区零点的 YYYY-MM-DD 解析（new Date('YYYY-MM-DD') 是 UTC，会有时区偏移） */
function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 计算到期状态。column 传任务所在栏，done 栏一律返回 null（已完成不再警示） */
export function dueStatus(due: string | undefined, column?: string): DueStatus | null {
  if (!due || column === 'done') return null;
  const d = parseLocalDate(due);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((d.getTime() - today.getTime()) / dayMs);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= NEAR_DAYS) return 'near';
  return 'normal';
}

/** 到期状态的文案（卡片 tooltip / 弹窗提示用） */
export const DUE_STATUS_TEXT: Record<DueStatus, string> = {
  overdue: '已超期',
  near: '临近到期',
  normal: '正常',
};

/** 到期状态配色：超期红、临近橙（与 todo 的 amber 区分开）、正常/done 中性灰 */
export const DUE_STATUS_COLORS: Record<DueStatus | 'neutral', ChipColors> = {
  overdue: { color: '#b91c1c', background: '#fef2f2', border: '#fecaca' },
  near: { color: '#c2410c', background: '#ffedd5', border: '#fdba74' },
  normal: { color: '#475569', background: '#f8fafc', border: '#e2e8f0' },
  neutral: { color: '#475569', background: '#f8fafc', border: '#e2e8f0' },
};

/**
 * 卡片上的到期显示：同年显示 MM-DD 省年份，跨年补 YYYY-MM-DD（卡片空间小）。
 * 解析失败原样返回。
 */
export function dueShortText(due: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due.trim());
  if (!m) return due;
  return Number(m[1]) === new Date().getFullYear() ? `${m[2]}-${m[3]}` : due;
}
