/** 栏定义（来自 board.yml 的 columns） */
export interface ColumnDef {
  /** 目录名，如 backlog / ready / doing / done */
  name: string;
  /** UI 显示名，如"待办""允许执行" */
  display: string;
}

/** 任务的额外元数据（board.yml 的 tasks 映射值） */
export interface TaskMeta {
  /** 创建时间（ISO 字符串） */
  created: string;
}

/** 看板级配置（board.yml） */
export interface BoardConfig {
  /** 下一个可分配的任务 ID（数字） */
  'next-id': number;
  /** 栏定义列表（顺序即展示顺序） */
  columns: ColumnDef[];
  /** 各栏内任务 ID 的优先级顺序（靠前优先级高；未列出的按目录名补末尾）。栏归属的唯一来源。 */
  order: Record<string, string[]>;
  /** 任务额外元数据（id → meta），不含栏归属（归属由 order 隐含）。缺失视为无元数据。 */
  tasks?: Record<string, TaskMeta>;
}

/** 子任务（main.md 的 ## 子任务 区块内的一个 checkbox 行） */
export interface SubTask {
  /** 2 位编号（"01"/"02"/"03"…），全局唯一，用于跨命令定位（kanban check <id> 03） */
  no: string;
  /** 在区块内的位置序号（从 1 开始，按文件出现顺序） */
  index: number;
  /** 是否已完成 */
  done: boolean;
  /** 可选标签，如 "补充"（update 追加的需求）；普通拆解子任务为空字符串 */
  tag: string;
  /** 文本内容（去掉 "- [ ] " / "- [x] " 和编号、tag 前缀后的正文） */
  text: string;
  /** 在 main.md 文件中的行号（1-based，用于行级 patch） */
  line: number;
}

/** main.md 解析结果 */
export interface ParsedMainMd {
  /** # 标题 */
  title: string;
  /** ## 描述 段内容（纯文本） */
  description: string;
  /** ## 提示词 段内容（纯文本） */
  prompt: string;
  /** ## 子任务 区块内的子任务列表 */
  subtasks: SubTask[];
}

/** 一个任务（运行时聚合） */
export interface Task {
  /** 任务 ID（如 "0007"），目录名 ID 段 */
  id: string;
  /** 任务名称（目录名去掉 ID- 前缀） */
  name: string;
  /** 子目录名（完整，如 "0007-实现登录"） */
  dirName: string;
  /** 当前所在栏的 name（如 backlog） */
  column: string;
  /** 子目录绝对路径 */
  path: string;
  /** main.md 解析结果（可能为 null，若 main.md 缺失或损坏） */
  main: ParsedMainMd | null;
  /** 进度 [完成数, 总数] */
  progress: [number, number];
  /** main.md 的磁盘修改时间（毫秒，stat.mtimeMs）。用于前端判断任务是否被外部改动（对比暂存时间）。缺失时为 undefined。 */
  mtime?: number;
}

/** 全局 config.json 的一个项目条目 */
export interface ProjectEntry {
  path: string;
  name: string;
}

/** 全局 config.json */
export interface GlobalConfig {
  projects: ProjectEntry[];
  defaultPort: number;
  /** 最后打开的项目绝对路径（Web 刷新/重开时恢复用）。可能不存在/已失效，使用方需校验仍属 projects。 */
  lastProject?: string;
}
