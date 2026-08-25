/**
 * 多格式文档预览转换：docx/xlsx 在服务端转成可预览的 HTML / 表格数据。
 * mammoth 与 xlsx 体积较大，按需动态 import（首次请求 docx/xlsx 才加载，不拖慢启动）。
 * 纯文本类（sql/json/csv/...）与图片不走本模块，由路由直接读文件返回。
 */
import { readFileSync, statSync } from 'fs';

/** 预览载荷上限（字节）：超过则拒绝预览，避免超大 payload / 解析卡顿 */
export const LIMITS = {
  /** 文本类（txt/sql/json/csv/...）：2MB */
  text: 2 * 1024 * 1024,
  /** 图片（dataUrl 会再膨胀 ~4/3）：10MB */
  image: 10 * 1024 * 1024,
  /** docx/xlsx 解析：20MB */
  office: 20 * 1024 * 1024,
} as const;

/** docx 类扩展名（小写） */
export const DOCX_EXTS = new Set(['docx']);
/** excel 类扩展名（小写，含老格式 xls） */
export const EXCEL_EXTS = new Set(['xlsx', 'xls']);

/** docx → HTML（mammoth.convertToHtml，保留标题/列表/表格）。抛错向上转 400/500 语义由调用方包装。 */
export async function docxToHtml(full: string): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.convertToHtml({ path: full });
  return value;
}

export interface ExcelSheet {
  name: string;
  /** 行列数据（sheet_to_json header:1），值已字符串化（null → 空串） */
  rows: string[][];
}

/** xlsx/xls → 各 sheet 的行列数据（SheetJS）。空单元格为 ''。 */
export async function excelToSheets(full: string): Promise<ExcelSheet[]> {
  const XLSX = await import('xlsx');
  const buf = readFileSync(full);
  const wb = XLSX.read(buf, { type: 'buffer' });
  return wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    return {
      name,
      rows: rows.map(r => r.map(c => (c == null ? '' : String(c)))),
    };
  });
}

/** 文件大小超限时返回 true（statSync 失败按超限处理，交由调用方报错） */
export function overLimit(full: string, limit: number): boolean {
  try { return statSync(full).size > limit; } catch { return true; }
}
