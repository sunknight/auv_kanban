export interface SubTask { no: string; index: number; done: boolean; tag: string; text: string; }
export interface ParsedMainMd { title: string; description: string; prompt: string; subtasks: SubTask[]; }
/** todo.md 里的一条延后事项（本次不做、留待后续；与子任务语义不同） */
export interface TodoItem { no: string; index: number; done: boolean; text: string; }
export interface Task {
  id: string; name: string; dirName: string; column: string;
  path: string; main: ParsedMainMd | null; progress: [number, number];
  /** main.md 磁盘修改时间（毫秒）。外部改动判断用。 */
  mtime?: number;
  /** todo.md 的延后事项（无该文件为空数组） */
  todos: TodoItem[];
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
