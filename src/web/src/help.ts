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
6. **让智能体干活**：在 ZCode 里 \`/kanban run\`（自动取 ready 队首）或 \`/kanban run 0001\`。
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

**macOS / Linux**

\`\`\`bash
kanban skill install
\`\`\`

自动创建软链 \`~/.zcode/skills/kanban\` → 包内的 \`skill/kanban/\`。

**Windows**

普通用户无 symlink 权限，\`kanban skill install\` 会打印手动复制指引，按提示复制一次即可。

## 四、起 Web 界面

\`\`\`bash
kanban serve                 # 默认端口 38311
kanban serve --port 4000     # 指定端口
\`\`\`

## 五、日常命令速查

| 命令 | 作用 |
|---|---|
| \`kanban new "任务名"\` | 在 backlog 新建任务，得到 ID（如 0001） |
| \`kanban list\` | 列出全部任务 |
| \`kanban list --column ready\` | 只看某栏 |
| \`kanban show <ID>\` | 看任务详情 |
| \`kanban move <ID> ready\` | 把任务挪到指定栏 |
| \`kanban check <ID> <序号>\` | 勾选/取消第 N 个子任务 |
| \`kanban progress <ID>\` | 看任务进度 |
| \`kanban sync\` | 对齐 board.yml：重建栏软链、修复孤儿与幽灵 id |
| \`kanban delete <ID>\` | 删除任务 |

## 六、典型工作流

\`\`\`bash
# 1. 记录想法
kanban new "优化首页加载"

# 2. 可以做了，挪到 ready
kanban move 0001 ready

# 3. 在 ZCode 里触发智能体执行（需先装 Skill）
#    /kanban run 0001
#    智能体自动：move 到 doing → 写 logs.md → 干活 → 勾子任务 → 完成后 move done

# 4. Web UI 看实时进度，或 CLI 看：
kanban show 0001
kanban progress 0001
\`\`\`

## 七、数据长什么样

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

## 八、常见问题

- **在子目录里能用吗？** 能。\`kanban\` 会自动向上查找最近的 \`.kanban\`。
- **软链断了 / 栏目录乱了？** 跑一次 \`kanban sync\` 即可（macOS/Linux）。
- **Windows 支持吗？** 支持。栏目录软链视图自动跳过（数据不依赖软链），Skill 需手动复制一次。
- **不想用 Web，只用命令行？** 完全可以，所有操作都有对应 CLI。

## 九、安全使用须知

\`kanban serve\` 按**本地单用户工具**定位：

- **仅监听本机**：绑定 \`127.0.0.1\`，不对外网/局域网开放。
- **无认证**：所有 \`/api/*\` 路由不带身份校验；任何能访问该端口的程序都能读写看板。
- **项目白名单**：请求里的 \`project\` 必须是已注册项目之一，否则 403。
- **文档已净化**：Web 详情渲染的 Markdown 经 DOMPurify 净化。

**请勿**把监听地址改回 \`0.0.0.0\` 后接公网。如需远程访问，请加带鉴权的反向代理。
`;
