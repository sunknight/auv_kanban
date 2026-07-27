# Auv Kanban · 使用说明

**A**gent **U**ser **V**elocity · 基于 Markdown 文件 + 目录的人/智能体共用看板。

> Markdown + 目录驱动的人/智能体共用看板。看板数据就是项目里的 `.kanban/` 目录，随 git 管理；人（CLI / Web）和 ZCode 智能体（Skill）通过文件系统协作。

## 一、安装（一次性）

```bash
npm install -g auv-kanban
```

安装后你会得到一个全局命令 `kanban`。验证：

```bash
kanban --version
```

## 二、给项目启用看板（每个项目一次）

```bash
cd ~/your-project
kanban init
```

会在项目根目录创建 `.kanban/`（含默认四栏：backlog / ready / doing / done）。把这个目录纳入 git 即可让团队共享同一块看板。

## 三、装 Skill（让智能体能用，每台机器一次）

### macOS / Linux

```bash
kanban skill install
```

会自动创建软链 `~/.zcode/skills/kanban` → 包内的 `skill/kanban/`。

### Windows

Windows 因普通用户无 symlink 权限，`kanban skill install` **不会自动安装**，而是打印手动复制指引。手动执行一次即可：

```powershell
# 1. 新建目标目录（路径里的 <你> 是你的 Windows 用户名）
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.zcode\skills\kanban"

# 2. 复制 SKILL.md（源文件随 npm 包发布）
Copy-Item "$env:APPDATA\npm\node_modules\auv-kanban\skill\kanban\SKILL.md" -Destination "$env:USERPROFILE\.zcode\skills\kanban\"
```

> 源文件路径也可通过 `kanban skill install` 打印的提示直接复制。装好后 ZCode 智能体里可用 `/kanban run <ID>` 触发自动执行任务。

## 四、起 Web 界面（可选）

```bash
kanban serve                 # 默认端口 38311
# 浏览器打开 http://localhost:38311
```

## 五、日常命令速查

| 命令 | 作用 |
|---|---|
| `kanban new "任务名"` | 在 backlog 新建任务，得到一个 ID（如 0001） |
| `kanban list` | 列出全部任务 |
| `kanban list --column ready` | 只看某栏 |
| `kanban show <ID>` | 看任务详情（标题/描述/提示词/子任务/当前路径） |
| `kanban move <ID> ready` | 把任务挪到指定栏（改进度） |
| `kanban check <ID> <序号>` | 勾选/取消第 N 个子任务 |
| `kanban progress <ID>` | 看任务进度 |
| `kanban sync` | 对齐 board.yml：重建栏软链（macOS/Linux）、修复孤儿与幽灵 id（所有平台，幂等可随时跑） |
| `kanban delete <ID>` | 删除任务 |

## 六、典型工作流

```bash
# 1. 记录一个想法
kanban new "优化首页加载"

# 2. 觉得可以做了，挪到 ready
kanban move 0001 ready

# 3. 在 ZCode 里触发智能体执行（需先装 Skill）
#    /kanban run 0001
#    智能体会自动：move 到 doing → 写 logs.md → 按提示词干活 → 勾子任务 → 完成后 move 到 done

# 4. 随时在 Web UI 看实时进度，或 CLI 看：
kanban show 0001
kanban progress 0001
```

## 七、数据长什么样

```
your-project/.kanban/
  board.yml            看板配置（栏定义、任务归属、next-id）
  tasks/               任务实体（永不移动、永不改名）
    0001-优化首页加载/
      main.md          主文件（H1=标题 / 描述 / 提示词 / 子任务）
      logs.md          执行进展日志（智能体增量追加）
      design.md ...    其他产物文档
  backlog/  ready/  doing/  done/    只读软链视图，指向 tasks/（仅 macOS/Linux；Windows 为空目录，不影响使用）
```

关键特性：**任务实体路径稳定**（永远在 `tasks/<ID>-<名>/`，改名只改 main.md 的 H1，不动目录），所以人和智能体可以放心并发读写。

## 八、常见问题

- **在子目录里能用吗？** 能。`kanban` 会自动向上查找最近的 `.kanban`。
- **软链断了 / 栏目录乱了？** 跑一次 `kanban sync` 即可重建（macOS/Linux）。
- **Windows 支持吗？** 支持。Windows 10/11 可正常安装使用，无需管理员权限或开发者模式。栏目录软链视图会自动跳过（数据不依赖软链），Skill 需手动复制一次（见上文「装 Skill」）。
- **不想用 Web，只用命令行？** 完全可以，所有操作都有对应 CLI。
- **端口被占？** `kanban serve --port 4000`。
