/**
 * 帮助内容（纯前端常量，随 web bundle 发布）。
 *
 * 设计取舍：为什么不直接读取项目 docs/USAGE.md？
 * - npm 安装的最终用户机器上没有本仓库的 docs/ 目录，web 服务运行时无法依赖它。
 * - 帮助内容需要自包含在 bundle 里，做到「装好就能看」。
 * - web 帮助面向最终用户的操作场景，措辞与面向开发者的 USAGE.md 略有侧重差异。
 *
 * 如需更新帮助，直接改本文件的两个常量即可。
 */

// 快速入门：30 秒上手，最短路径跑通「建任务 → 执行 → 看结果」。
export const HELP_QUICK_START = `## 30 秒上手

1. **装好命令行**：\`npm install -g auv-kanban\`，得到全局命令 \`kanban\`。
2. **给项目启用看板**：在项目根目录执行 \`kanban init\`，生成 \`.kanban/\`。
3. **起 Web 界面**：执行 \`kanban serve\`，浏览器打开提示的本机地址（默认端口 38311）。
4. **新建任务**：在 Web 里点对应栏的「+」，或命令行 \`kanban new "任务名"\`。
5. **准备执行**：把任务挪到 **ready**（允许执行）。
6. **让智能体干活**：在智能体里 \`/kanban run\`（自动取 ready 队首）或 \`/kanban run 0001\`；一句话 \`/kanban create 标题\` 建任务并直接执行；参数记不清就裸输 \`/kanban\` 走分步向导。
7. **看实时进度**：Web 详情里打开 \`logs.md\`，可看智能体增量写入的执行过程。

> 核心心智模型：任务实体是 \`.kanban/tasks/<ID>-名/\` 下的目录，**永不移动、永不改名**；
> 栏（backlog / ready / doing / done）只记录归属。人和智能体通过文件系统这块共享黑板协作。
`;

// 完整使用说明：覆盖安装、命令、工作流、数据结构、安全须知。
export const HELP_FULL = `## 一、安装

\`\`\`bash
npm install -g auv-kanban
\`\`\`

验证：\`kanban --version\`。

## 二、给项目启用看板（每个项目一次）

\`\`\`bash
cd ~/your-project
kanban init
\`\`\`

在项目根创建 \`.kanban/\`（含默认四栏：backlog / ready / doing / done），纳入 git 即可团队共享。

## 三、装 Skill（让智能体能用，每台机器一次）

Skill 可装到各智能体（zcode / claude / codex / gemini 等）的 skills 目录。

**macOS / Linux**

\`\`\`bash
kanban skill install
\`\`\`

默认探测本机已装的智能体全部装上，各建软链 \`~/<agent>/skills/kanban\` → 包内的 \`skill/kanban/\`（改一次源全部生效）；\`--agent claude,codex\` 指定目标，\`--list\` 只看探测结果。

**Windows**

普通用户无 symlink 权限，\`kanban skill install\` 会打印手动复制指引，按提示复制一次即可。

## 四、起 Web 界面

\`\`\`bash
kanban serve                 # 默认端口 38311
kanban serve --port 4000     # 指定端口
\`\`\`

任务详情里点「**打开目录**」可直接用系统文件管理器（macOS Finder / Windows 资源管理器）打开该任务的实体目录，往里拖素材、看文档都方便。

任务目录里出现**无法预览的文件**（html/json 等白名单外文件或子目录）时，详情会自动维护一份 \`files.md\` **目录清单**：tree 风格**递归**列出目录全部文件（含子目录内文件；软链只列名不展开），tree 块在代码围栏内逐行显示不挤行，清单标签固定在「任务文档」标题行最右侧；智能体可在其中给各文件补充「 —— 作用说明」（更新清单时按相对路径保留）。详情弹窗已加宽，文档预览区更宽敞。

## 五、日常命令速查

| 命令 | 作用 |
|---|---|
| \`kanban new "任务名"\` | 在 backlog 新建任务，得到 ID（如 0001） |
| \`kanban list\` | 列出全部任务 |
| \`kanban list --column ready\` | 只看某栏 |
| \`kanban show <ID>\` | 看任务详情 |
| \`kanban move <ID> ready\` | 把任务挪到指定栏 |
| \`kanban check <ID> <编号>\` | 勾选子任务（编号 2 位，如 03；幂等） |
| \`kanban uncheck <ID> <编号>\` | 取消勾选子任务 |
| \`kanban update [--no-run] <ID> <需求>\` | 追加补充需求并重开到 doing；默认立即执行，\`--no-run\` 只补不跑 |
| \`kanban progress <ID>\` | 看任务进度 |
| \`kanban sync\` | 对齐 board.yml：重建栏软链、修复孤儿与幽灵 id |
| \`kanban delete <ID>\` | 删除任务 |

## 六、智能体协作：/kanban 斜杠命令

装好 Skill 后，在智能体会话里用斜杠命令操作看板（由智能体解释执行，各智能体的触发语法以其自身为准）：

| 斜杠命令 | 说明 |
|---|---|
| \`/kanban run <ID>\` | 执行指定任务：设计 → 实施 → 收尾 |
| \`/kanban run\` | 取 ready 队首执行，完成后询问是否继续下一个 |
| \`/kanban run --design <ID>\` | 只做预研设计，产出设计/计划文档后回 ready 待实施；下次 run 复用设计直接实施 |
| \`/kanban create <标题>\` | 一句话建任务并立即执行（首行=标题，后续行=描述） |
| \`/kanban create --design <标题>\` | 建任务后只做设计 |
| \`/kanban create --backfill <标题>\` | 把会话中已开干、忘了从看板起步的工作补录为任务 |
| \`/kanban update [--no-run] <ID> <需求>\` | 给已有任务补需求并重开，默认立即执行 |
| \`/kanban\`（裸）或 \`/kanban ?\` | 分步询问向导 |

- **分步向导**：裸输 \`/kanban\` 或 \`/kanban ?\` 时，智能体不猜、不默认执行，改用点击式分步问齐参数后开跑（第一问：执行任务 / 新建任务 / 补充需求 / 查看与速查）；命令后加 \`?\`（如 \`/kanban run ?\`）跳过第一问直入对应分支。选项来自看板真实任务动态生成。
- **补录执行中的工作（--backfill）**：会话干到一半才想起没建任务？\`/kanban create --backfill <标题>\` 回溯会话真实工作——已完成的子任务标 \`[x]\`、剩余待办标 \`[ ]\`，并从实际改动提炼设计文档；任务落 **doing** 继续推进（不是事后归档），补录后询问「继续做下一项 / 结束任务」。

## 七、典型工作流

\`\`\`bash
# 1. 记录想法
kanban new "优化首页加载"

# 2. 可以做了，挪到 ready
kanban move 0001 ready

# 3. 在智能体里触发执行（需先装 Skill，斜杠命令见上节）
#    /kanban run 0001
#    智能体自动：move 到 doing → 写 logs.md → 干活 → 勾子任务 → 完成后 move done

# 4. Web UI 看实时进度，或 CLI 看：
kanban show 0001
kanban progress 0001
\`\`\`

## 八、数据长什么样

\`\`\`
your-project/.kanban/
  board.yml            看板配置（栏定义、任务归属、next-id）
  tasks/               任务实体（永不移动、永不改名）
    0001-优化首页加载/
      main.md          主文件（H1=标题 / 描述 / 提示词 / 子任务）
      logs.md          执行进展日志（智能体增量追加）
      design.md ...    其他产物文档
  backlog/ ready/ doing/ done/    只读软链视图，指向 tasks/（仅 macOS/Linux）
\`\`\`

关键特性：**任务实体路径稳定**（永远在 \`tasks/<ID>-名>/\`，改名只改 main.md 的 H1，不动目录），人和智能体可放心并发读写。

## 九、常见问题

- **在子目录里能用吗？** 能。\`kanban\` 会自动向上查找最近的 \`.kanban\`。
- **软链断了 / 栏目录乱了？** 跑一次 \`kanban sync\` 即可（macOS/Linux）。
- **Windows 支持吗？** 支持。栏目录软链视图自动跳过（数据不依赖软链），Skill 需手动复制一次。
- **不想用 Web，只用命令行？** 完全可以，所有操作都有对应 CLI。

## 十、安全使用须知

\`kanban serve\` 按**本地单用户工具**定位：

- **仅监听本机**：绑定 \`127.0.0.1\`，不对外网/局域网开放。
- **无认证**：所有 \`/api/*\` 路由不带身份校验；任何能访问该端口的程序都能读写看板。
- **项目白名单**：请求里的 \`project\` 必须是已注册项目之一，否则 403。
- **文档已净化**：Web 详情渲染的 Markdown 经 DOMPurify 净化。

**请勿**把监听地址改回 \`0.0.0.0\` 后接公网。如需远程访问，请加带鉴权的反向代理。
`;
