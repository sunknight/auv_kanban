# Kanban Skill · 命令清单

kanban skill 在 agent 内执行时，命令分两层：**斜杠命令**（用户输入、触发整套流程）与 **CLI 子命令**（agent 在 bash 里实际调用的原语）。本文档为完整速查。

> 数据约定：看板在项目根的 `.kanban/`。任务实体 `.kanban/tasks/<ID>-<名称>/`，ID 为 4 位数字（如 `0007`），永不复用。栏有四种：`backlog`（待办）/ `ready`（允许执行）/ `doing`（进行中）/ `done`（完成）。

---

## 一、斜杠命令（/kanban …，skill 触发层）

用户输入的、让 agent 启动一套流程的指令。`run` 和 `create` 是 skill 层编排，会串联执行多条 CLI。

### run 系列（执行任务）

| 命令 | 含义 | 流程终止点 |
|------|------|-----------|
| `/kanban run <ID>` | 执行指定任务（设计+实施全流程） | 实施完成 → `move done` |
| `/kanban run` | **取 ready 栏队首那一个任务**执行 | 实施完成后追问是否继续下一个 |
| `/kanban run --design <ID>` | **只做预研/设计**，不实施 | 设计完成 → 回 `ready`，停 |

> ⚠️ `/kanban run`（不带 ID）**不是一次执行所有 ready 任务**——每次只取 ready 队首**一个**，做完后用 `AskUserQuestion` 问是否继续下一个。
>
> `--design` 的自然语言同义词：「预研/做设计/做方案/先设计 `<ID>`」「`<ID>` 先别动手只出方案」「`<ID>` 调研一下怎么做」等，都按 `run --design` 处理。

### create 系列（建任务并立即执行）

| 命令 | 含义 | 落点 |
|------|------|------|
| `/kanban create <标题>` | 建任务+填描述+全流程执行 | `move done` |
| `/kanban create --design <标题>` | 建任务+填描述+只设计 | 回 `ready`，停 |
| `/kanban create --backfill <标题>` | 把本会话**已在做**的工作补录为任务，继续推进 | 落 `doing`（非 done） |

- 第 1 行（命令后）= 标题；第 1 行之后的非空行 = 描述，原样填入 `## 描述` 段。

### update 系列（对已有任务补需求）

| 命令 | 含义 |
|------|------|
| `/kanban update <ID> <需求>` | 追加补充需求到子任务，重开到 `doing`，**默认立即执行**刚追加的那条 |
| `/kanban update --no-run <ID> <需求>` | 只追加需求、重开，**不执行**（稍后手动 `/kanban run`） |
| 自然语言「给 0010 补个需求：xxx」/「0010 还要 xxx」 | 默认 `update`（立即执行） |
| 自然语言「给 0010 补个需求，稍后做/先别做/只补需求：xxx」 | 判定为 `--no-run`（不执行） |

### 裸 /kanban（无参数）→ 交互向导

用户只输入 `/kanban`、不带任何命令时，skill 不猜测意图，改用 `AskUserQuestion` 分步点击式收集参数，问完拼出等价命令直接执行（详细规则与总览脑图见 SKILL.md「命令与向导总览脑图」「裸 /kanban 交互向导」两节）：

| 第一问「做什么？」 | 后续询问（独立问题合并一次问） | 拼出等价命令 |
|------------------|------------------------------|-------------|
| 执行任务 run | ① 任务：ready 队首（推荐）/ 第 2、3 个 / Other 输 ID ② 模式：全流程（推荐）/ 只预研 `--design` | `/kanban run [--design] <ID>` |
| 新建任务 create | ① 方式：新建并执行（推荐）/ `--design` / `--backfill` ② 标题：agent 候选（推荐）/ 草稿名后改 / Other 输入 ③ 描述：跳过（推荐）/ agent 提炼一句 / Other 输入 | `/kanban create [--design/--backfill] <标题>` |
| 补充需求 update | ① 任务：doing 前几个 / 最近 done / Other 输 ID ② 补完后：立即执行（推荐）/ `--no-run` ③ 需求：Other 输入 / 先看子任务清单 / 取消 | `kanban update [--no-run] <ID> <需求>` |
| 查看看板 | 整板概览（推荐）/ 任务详情（追问 ID）/ 进行中进度 | `kanban list` / `kanban show <ID>` / `kanban progress` |

- 向导开场先 `kanban list` 拿全栏真实任务，选项动态生成；推荐项随现状调整（ready 有任务→推 run，ready 空→推 create）。
- 低频操作（move/check/uncheck/sync/init/archive/delete）不进向导：用户在任一问选 Other 直接说，按 CLI 执行。
- 输入已带命令或意图明确（如「执行 0007」）不进向导，直接走对应流程。

---

## 二、CLI 子命令（agent 实际调用的原语）

斜杠命令背后，agent 在 bash 里调用的是这套 `kanban` CLI。**共 16 个子命令**，按用途分组：

### 2.1 任务流转与查看（skill 执行流程中最常用）

```
kanban show <ID>                 # 显示任务详情（绝对路径、栏、名称、描述、提示词、子任务带编号/标签）
kanban list [--column <栏>]      # 列出任务；--column 可指定 backlog/ready/doing/done
kanban new <名称>                # 在 backlog 创建新任务
kanban move <ID> <栏>            # 移动任务到指定栏（只改 board.yml，实体不动）
kanban check <ID> <编号>         # 勾选指定编号子任务（幂等，非 toggle）
kanban uncheck <ID> <编号>       # 取消勾选指定编号子任务（幂等，非 toggle）
kanban progress <ID>             # 显示某任务的子任务进度
```

### 2.2 补需求与执行

```
kanban update <ID> <需求>           # 追加一条补充需求（子任务带 [补充] 标签）并重开到 doing，默认追加后立即执行
kanban update --no-run <ID> <需求>  # 同上，但只补需求、不立即执行（稍后手动 /kanban run）
```

### 2.3 任务删除与存档

```
kanban delete <ID>               # 删除任务（实体目录，ID 不回收）
kanban archive <ID>              # 存档任务：从看板隐藏但保留目录与文档（移到 .kanban/archive/）
```

### 2.4 看板与项目级管理

```
kanban init [项目]               # 在指定项目（默认当前目录）创建 .kanban、默认四栏、board.yml，并注册到全局 config
kanban sync                      # 重建栏软链以对齐 board.yml（修复断链/孤儿，幂等）
kanban projects [action] [path] [name]  # 管理全局项目列表
kanban serve                     # 启动本地 Web 服务
kanban skill install             # 把 SKILL.md 安装到各 agent 的 skills 目录（软链到源）
```

### 参数说明

| 参数 | 含义 |
|------|------|
| `<ID>` | 4 位任务编号，如 `0007`（永不复用） |
| `<栏>` | `backlog`（待办）/ `ready`（允许执行）/ `doing`（进行中）/ `done`（完成） |
| `<编号>` | 子任务的 2 位编号（01/02/03…），用于跨命令定位 |
| `<名称>` | 新任务标题，单行、避免 `/` 等目录非法字符 |
| `<需求>` | 补充需求的文本，会以 `- [ ] NN [补充] 文本` 形式追加 |

> `run` 和 `--design` **不是** CLI 子命令——`run` 是 skill 层执行流程，由 agent 解释执行一串上面的 CLI；`--design` 是 `run` 的 skill 层参数，不是 CLI flag。
>
> `delete` 与 `archive` 的区别：`delete` 彻底删除实体目录（ID 永不回收）；`archive` 把任务移到 `.kanban/archive/`，从看板隐藏但保留目录与文档，可回流（如 `update` 一个已存档任务时需先解除存档）。

---

## 三、一次 run 流程里 agent 实际依次执行的 CLI（以 `/kanban run <ID>` 为例）

```
kanban show <ID>            # 阶段A：读路径、描述、提示词、是否已有 design/plan
kanban move <ID> doing      # 阶段A：流转到 doing
# … AskUserQuestion 澄清 → 写 design.md/plan.md …
# 阶段B 实施每个子任务循环：
kanban show <ID>            # 写前重新定位最新状态
kanban check <ID> <编号>    # 每完成一个子任务勾上
# 阶段C 收尾：
# … 自检/补写 notes.md、readme.md …
kanban move <ID> done       # 完成流转
# 若是无 ID 形态，再执行：
kanban list --column ready  # 看是否还有任务，询问是否继续
```

### run 三阶段概览

| 阶段 | 内容 | 产出文件 |
|------|------|----------|
| A 设计 | `move doing` → `AskUserQuestion` 逐个澄清 → 生成设计文档 | `design.md`、`plan.md`（此时即落盘） |
| B 实施 | 找首个未勾选子任务执行 → `check` 勾上 → 增量写 `logs.md` | 改源码 + `logs.md` 追加 |
| C 收尾 | 自检文档齐全 → 写收尾条 → `move done` | `notes.md`、`readme.md` |

### `--design` 与普通 run 的唯一差异

`--design` 在**阶段 A 末尾即停**（`move ready`，告知用户待实施）；普通 run 穿过阶段 A 直接进入阶段 B。已预研过的任务再次 `/kanban run <ID>` 会**直接读已有 `design.md`/`plan.md` 进入实施**，不重复做设计。

---

## 四、文件产出约定（任务子目录内）

| 文件 | 内容 | 生成时机 | 必须 |
|------|------|----------|------|
| `main.md` | 标题、描述（创建后不改）、提示词、子任务清单 | 建任务时 | ✅ |
| `design.md` | 背景问题、目标与验收、设计决策、数据模型/接口、边界取舍 | 阶段 A | ✅ |
| `plan.md` | 带编号实施清单、依赖与顺序、风险点 | 阶段 A | ✅ |
| `logs.md` | 过程流时间线日志（开始/阶段性事件/结束） | 执行全程增量追加 | ✅ |
| `notes.md` | 改动清单（逐文件）、设计要点回顾、验证结果、经验反思 | 阶段 C | ✅ |
| `readme.md` | 面向使用者的「怎么用」、规则、示例、实现位置指引 | 阶段 C | ✅ |
