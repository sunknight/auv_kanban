// 剪贴板工具：TaskCard（卡片复制按钮）与 TaskModal（详情复制按钮）共用，
// 避免两份实现漂移。

/**
 * 构造任务的执行命令字符串：`/kanban run <ID> # <名称>`。
 * 用 # 分隔符确保名称不影响 run 解析（kanban run 用首个 4 位 ID 定位任务，
 * # 后是展示性说明，agent 一眼可辨）。
 */
export function buildRunCommand(taskId: string, taskName: string): string {
  return `/kanban run ${taskId} # ${taskName}`;
}

/**
 * 复制文本到剪贴板。优先用 navigator.clipboard（安全上下文），
 * 降级到 execCommand 兜底（localhost http / 旧浏览器等非安全上下文）。
 * 返回是否复制成功。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 非安全上下文 / 旧浏览器兜底
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
