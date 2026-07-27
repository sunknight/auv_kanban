export interface SubTask { no: string; index: number; done: boolean; tag: string; text: string; }
export interface ParsedMainMd { title: string; description: string; prompt: string; subtasks: SubTask[]; }
export interface Task {
  id: string; name: string; dirName: string; column: string;
  path: string; main: ParsedMainMd | null; progress: [number, number];
}
export interface ColumnWithTasks { name: string; display: string; tasks: Task[]; }
export interface Board { columns: ColumnWithTasks[]; }
export interface ProjectEntry { path: string; name: string; }

/** 任务目录里的文档项 */
export interface DocInfo { name: string; ext: string; isImage: boolean; }
/** 文档内容：文本类返回 content，图片返回 dataUrl */
export type DocContent =
  | { type: 'text' | 'markdown'; content: string }
  | { type: 'image'; dataUrl: string };
