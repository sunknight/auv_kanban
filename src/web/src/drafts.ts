// 编辑态草稿暂存：TaskModal 的「描述」内容写入浏览器 localStorage，
// 在关闭 modal / 刷新 / 切项目后可恢复。不写后端、不触发看板广播。
//
// 暂存范围：仅描述（标题/栏/子任务不暂存——它们随外部改动直接用磁盘最新值）。
// savedAt 用于与磁盘 mtime 对比：外部改动任务后，若 mtime > savedAt 说明磁盘更新，
// 用磁盘描述覆盖并清草稿；否则保留用户最新的草稿。
//
// localStorage 不可用（隐私模式/配额满/被禁用）时全静默失败，不阻断主功能。

/** 草稿载荷：只暂存描述 + 写入时刻。 */
export interface TaskDraft {
  description: string;
  savedAt: number;
}

// localStorage key：按「项目 + 任务ID」隔离
const draftKey = (project: string, taskId: string) => `kanban:draft:${project}:${taskId}`;

/** 读取草稿；无草稿或解析失败返回 null。 */
export function loadDraft(project: string, taskId: string): TaskDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(project, taskId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (
      typeof data?.description === 'string' &&
      typeof data?.savedAt === 'number'
    ) {
      return data as TaskDraft;
    }
    return null;
  } catch {
    // 解析失败 / localStorage 禁用：静默
    return null;
  }
}

/** 写入草稿（覆盖）。任何异常静默，不阻断编辑主流程。 */
export function saveDraft(project: string, taskId: string, draft: Omit<TaskDraft, 'savedAt'>): void {
  try {
    const payload: TaskDraft = { ...draft, savedAt: Date.now() };
    localStorage.setItem(draftKey(project, taskId), JSON.stringify(payload));
  } catch {
    // 配额满 / 隐私模式 / 禁用：静默
  }
}

/** 删除草稿（保存成功 / 存档 / 删除任务 / 外部改动覆盖时调用，防孤儿）。 */
export function clearDraft(project: string, taskId: string): void {
  try {
    localStorage.removeItem(draftKey(project, taskId));
  } catch {
    // 静默
  }
}
