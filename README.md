# Agent Kanban

基于 Markdown 文件 + 目录的**人 / 智能体共用看板**。完全无数据库，看板数据随项目 git 管理；人与 ZCode 智能体通过文件系统这块共享黑板协作。

## 特性

- **Markdown + 目录驱动**：任务实体是 `.kanban/tasks/` 下的子目录（含 main.md + 素材），栏归属（状态）记录在 `board.yml`。
- **随项目版本管理**：看板数据在项目 `.kanban/` 下，纳入 git。
- **三方共用**：人（Web UI / CLI）、Web 服务（可视化层）、ZCode 智能体（Skill + CLI）共用文件系统。
- **稳定路径**：任务实体目录创建后冻结——永不移动、永不改名（改标题只重写 H1），写入永远按 ID 定位到 `tasks/<ID>-<名>/`。栏目录是只读软链视图，改进度只改 board.yml。
- **子目录即用**：在项目任意子目录执行 `kanban`（list/show/new/move/check/progress/sync/delete），会从当前目录向上查找最近的 `.kanban` 作为项目根；存在多个 `.kanban` 时取最近的（最深）父目录。`kanban init` 例外，始终在当前目录创建新的看板。

## 安装

```bash
npm install -g auv-kanban
```

## 快速开始

```bash
# 1. 给项目启用看板
cd ~/my-project
kanban init

# 2. 装 Skill（一次性，所有项目生效）
kanban skill install

# 3. 起 Web 服务（默认端口 38311）
kanban serve
# 浏览器打开 http://localhost:38311

# 4. 记录想法
kanban new "优化首页加载"

# 5. 挪到 ready（允许执行）
kanban move 0001 ready

# 6. 在 ZCode 里触发智能体执行
#    /kanban run 0001
```

## 目录结构

```
<项目>/.kanban/
  board.yml              看板配置（栏定义、order 栏归属、next-id、tasks 元数据）
  tasks/                 任务实体统一目录（永不移动、永不改名）
    0001-任务名/
      main.md            主文件（H1=显示名 / 描述 / 提示词 / 子任务）
      logs.md            执行进展日志（智能体执行时增量追加，Web 详情准实时可见）
      design.md          任务的设计文档（智能体执行时产物）
      ...
  backlog/               待办（只读软链视图，指向 ../tasks/）
    0001-任务名 -> ../tasks/0001-任务名
  ready/                 允许执行
  doing/                 进行中
  done/                  完成
```

> 实体集中在 `tasks/`，栏目录里的软链只是浏览用的视图。改进度用 `kanban move`（只改 board.yml + 迁软链，实体不动）；软链出错用 `kanban sync` 重建。

## main.md 结构

```markdown
# 任务标题

## 描述
任务背景、目标等。

## 提示词
智能体执行时读取这段开展任务。

## 子任务
- [ ] 子任务一
- [x] 子任务二
```

## CLI 命令

| 命令 | 说明 |
|---|---|
| `kanban init [项目]` | 初始化看板（建 .kanban、默认四栏、board.yml，注册到全局 config） |
| `kanban serve [--port]` | 启动 Web 服务（默认 38311） |
| `kanban skill install` | 安装 Skill 到 ~/.zcode/skills/kanban/ |
| `kanban list [--column]` | 列出任务 |
| `kanban new <名称>` | 在 backlog 创建任务 |
| `kanban show <ID>` | 显示任务详情（含当前绝对路径） |
| `kanban move <ID> <栏>` | 移动任务到指定栏（只改 board.yml，实体不动） |
| `kanban check <ID> <序号>` | toggle 第 N 个子任务勾选 |
| `kanban progress <ID>` | 显示任务进度 |
| `kanban sync` | 重建所有栏软链以对齐 board.yml（修复断链/孤儿，幂等） |
| `kanban delete <ID>` | 删除任务（实体目录，ID 不回收） |
| `kanban projects [add|remove] [path]` | 管理全局项目列表 |

## 智能体执行

装好 Skill 后，在 ZCode 里 `/kanban run <ID>` 触发。智能体会：
1. `kanban show <ID>` 读任务路径与提示词
2. `kanban move <ID> doing`
3. 创建 `logs.md` 写第一条进展（开始执行、起始时间）
4. 按提示词执行，**所有产物文档写入任务子目录**（非 docs/）；每个阶段性事件增量追加一条到 `logs.md`
5. 完成子任务时 `kanban check`，并往 `logs.md` 追加进度
6. 归档 design/plan/notes/readme，往 `logs.md` 写收尾条
7. 全部完成后 `kanban move <ID> done`

关键纪律：智能体每次写文件前都按 ID 重新定位（实体路径稳定在 `tasks/`，但栏归属/main.md 内容可能被另一方改写，重定位是为读最新、避免覆盖）。

### 任务文档顺序

任务详情（Web UI）里的文档按固定语义顺序展示：

```
main.md → logs.md → design.md → plan.md → readme.md → notes.md → 其余按文件名字母序
```

- `logs.md`（执行进展日志）：doing 栏任务打开详情时默认选中，文件变化时自动刷新并滚到底——执行中可准实时查看进度，完成后可回看全过程。
- 其余文档为归档产物（详见 Skill 的「任务文档归档纪律」）。

## 全局配置

`~/.kanban/config.json` 存项目列表与默认端口。

```json
{
  "projects": [{ "path": "/abs/path", "name": "basename" }],
  "defaultPort": 38311
}
```
