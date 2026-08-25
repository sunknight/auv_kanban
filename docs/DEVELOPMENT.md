# 开发指南

> 本文档面向 **auv-kanban 的开发者**：如何在本地搭建开发环境、改代码、测 Web 功能、与正式版并存运行。
> 如果你只是「使用」已发布的 kanban，看 [使用说明](USAGE.md) 即可，无需读本篇。

## 一、环境准备

```bash
# 1. 克隆并进入仓库
cd /Users/sunknight/web/code/sk_ideas/auv_kanban

# 2. 安装后端依赖
npm install

# 3. 安装前端依赖（前端是 src/web 下独立的 npm 子工程）
cd src/web && npm install && cd ..
```

要求：Node.js ≥ 18。

## 二、两条运行路径（重要）

auv-kanban 的 Web 由两部分组成，开发时要分清：

| 部分 | 作用 | 代码 |
|---|---|---|
| **后端 serve** | Fastify HTTP API + socket.io 实时推送 | `src/server/`、`src/core/`、`src/cli/` |
| **前端** | React 看板界面 | `src/web/`（Vite 工程） |

对应两种「跑起来」的方式：

### 方式 A：serve 托管构建产物（看生产效果）
后端 serve 启动后，浏览器访问到的是**已构建的前端静态文件**（`dist/web-dist`）。改前端代码**不会热更新**，需重新 `build:web`。

### 方式 B：vite HMR + serve 双进程（开发首选）
前端用 vite dev server（HMR，改前端即时生效），它的 `/api`、`/socket.io` 通过 proxy 转发给后端 serve。**测 Web 功能推荐这种**。

## 三、脚本速查

| 脚本 | 作用 | 跑的代码 |
|---|---|---|
| `npm run dev` | **一键开发**：concurrently 同时跑 dev:server + dev:web（--kill-others，一个挂全停，Ctrl+C 同时停） | 本地源码 |
| `npm run dev:server` | 后端热重载（tsx watch），改后端代码自动重启 | 本地源码 |
| `npm run dev:web` | 前端 vite dev（HMR），改前端代码即时生效 | 本地源码 |
| `npm run build` | 编译后端（tsc → `dist/`） | — |
| `npm run build:web` | 构建前端（vite → `dist/web-dist`） | — |
| `npm run build:all` | 先前端后后端全量构建（发布前用） | — |
| `npm test` | 跑全部测试（vitest，当前 113 个用例） | — |
| `npm start` | 用编译产物 `bin/kanban` 启动生产服务 | 本地 `dist/` |
| `npm run stop` | 停止服务（默认停 38311） | — |
| `npm run restart` | 停 → 编译后端 → 启动 | 本地 `dist/` |
| `npm run restart:all` | 停 → 全量构建 → 启动 | 本地 `dist/` |

> ⚠️ 以上所有 `npm run *` 脚本跑的都是**本地代码**（源码或本地 dist），不是全局安装的 `kanban`。开发期间始终用这些脚本，别用全局 `kanban serve`（见下文「代码来源差异」）。

## 四、端口策略

开发模式用**两个端口**：前端 vite 一个、后端 serve 一个，各听各的，避免双进程抢同一端口。

### 默认端口（约定）

| 进程 | 默认端口 | 说明 |
|---|---|---|
| 正式版 `npm start` / `kanban serve` | 38311 | 单进程，serve 托管构建产物 |
| 开发后端 `npm run dev:server` | 38511 | tsx 热重载 |
| 开发前端 `npm run dev:web` | 38411 | vite HMR，浏览器开这个 |

> 开发模式下 `dev:server`（38511）和 `dev:web`（38411）端口不同，各管各的。前端的 `/api`、`/socket.io` 自动 proxy 到后端 38511。两个命令**不传任何变量**就能自动配对。

### 开发调试（最常用）

**一个终端一键启动**（推荐）：

```bash
npm run dev
# 同时起后端 38511 + 前端 38411，日志带 [server]/[web] 前缀区分
# Ctrl-C 一起停；任一进程挂掉另一个也会自动停（--kill-others）
# 浏览器打开 http://localhost:38411
```

也可以开**两个终端**分开跑（需要单独重启某一端时用）：

```bash
# 终端1：后端 serve（热重载，默认听 38511）
npm run dev:server

# 终端2：前端 vite（HMR，默认听 38411，proxy 到 38511）
npm run dev:web
# 浏览器打开 http://localhost:38411
```

### 正式版（默认端口）

```bash
npm start                    # 后端 serve，端口 38311
# 浏览器打开 http://localhost:38311
```

### 自定义端口（环境变量）

两个环境变量覆盖默认值：

| 变量 | 作用 | 默认 | 谁读它 |
|---|---|---|---|
| `PORT` | 当前进程监听端口 | dev:server=38511 / dev:web=38411 | serve + vite |
| `BACKEND_PORT` | 后端端口（vite proxy 目标） | 38511 | 仅 vite |

```bash
# 例：后端听 39000
PORT=39000 npm run dev:server

# 例：前端听 39001，proxy 到后端 39000（两个变量都传）
PORT=39001 BACKEND_PORT=39000 npm run dev:web
```

> 端口优先级（后端）：`--port` 参数 > `PORT` 环境变量 > config.defaultPort(38311)。
> 注意：`dev:web` 的 `PORT` 是**前端自己监听的端口**，不是后端；后端端口用 `BACKEND_PORT` 告诉前端去哪 proxy。

### 停止服务

```bash
npm run dev:stop             # 一键停开发环境（38411 前端 + 38511 后端）
npm run stop                 # 停正式版（38311）
PORT=38511 npm run stop      # 单独停开发后端
PORT=38411 npm run stop      # 单独停开发前端
```

> `dev:stop` 一次停开发环境两个进程；`stop` 默认只停正式版 38311，不会误伤开发进程（反之亦然）。

## 五、开发版与正式版并存（无冲突）

可以同时运行正式版和开发版，互不干扰：

| 进程 | 端口 | 代码 |
|---|---|---|
| 正式版 `kanban serve` 或 `npm start` | 38311 | 全局安装版 / 本地 dist |
| 开发后端 `npm run dev:server` | 38511 | 本地源码（热重载） |
| 开发前端 `npm run dev:web` | 38411 | 本地源码（HMR） |

三个端口（38311/38411/38511）互不重叠，浏览器分别开 `localhost:38311`（正式版）和 `localhost:38411`（开发版）即可。

### 数据共享（重要特性）

正式版和测试版**读写同一份看板数据**：

- 同一份 `~/.kanban/config.json`（项目列表）
- 同一份各项目的 `.kanban/` 目录（任务、board.yml）

所以**你在测试版改的看板数据，正式版立刻能看到**，反之亦然。这是特性不是 bug——两个后端都是"读文件 → 广播给自己客户端"，文件系统是单一真相源，不会互相覆盖。

**唯一注意**：不要在两个浏览器标签页**同时编辑同一个任务**（如都改 0001），可能后写覆盖先写。但这是"同一份数据并发改"的通病，单 serve + 多标签页也一样，与并存无关。

## 六、代码来源差异（容易踩的坑）

`npm run start` 和全局 `kanban serve` **命令语义一样，但跑的代码不同**：

| 命令 | 跑哪份代码 | 是否含本地最新改动 |
|---|---|---|
| `npm run start` / `dev:server` | 本地 `dist/` 或源码 | ✅ 是 |
| `kanban serve`（全局命令） | 全局安装的 npm 包 | ❌ 否（停在上次 `npm i -g` 的版本） |

判断全局 `kanban` 指向哪：
```bash
ls -la "$(which kanban)"
# 指向 .../node_modules/auv-kanban/...  → 全局正式包
# 指向你的本地源码目录               → npm link 状态
```

### 让全局 kanban 跟随源码（开发常用）

```bash
npm link              # 全局 kanban → 本地源码，build 后即生效
npm install -g auv-kanban   # 调试完切回正式包
```

详见 [发布流程](RELEASE.md) 的「npm link」一节。

## 七、改完代码后的验证流程

```bash
# 1. 改后端代码
npm run build         # 编译，确认无 TS 错误
npm test              # 跑测试，确认无回归

# 2. 改前端代码
npm run build:web     # 或用 dev:web 热更新即时看效果

# 3. 端到端验证（默认端口，不影响正式版 38311）
npm run dev          # 一键起后端 38511 + 前端 38411，浏览器开 localhost:38411
```

## 八、常见问题

- **`npm run start` 和 `kanban serve` 有什么区别？** 语义一样都是启 serve，但前者跑本地代码、后者跑全局安装版。开发期间用前者。详见上文「代码来源差异」。
- **为什么 dev:web 默认听 38411 而不是 5173？** 已改为读 `PORT`（默认 38411），让开发端口可控、与正式版 38311 区分。vite 原生默认是 5173，本项目覆盖为 38411。想改回用 `PORT=5173 npm run dev:web`。
- **前端和后端为什么端口不同？** 双进程模式（vite HMR + serve）各自监听，避免抢同一端口。前端 38411、后端 38511，前端自动 proxy 到后端。详见「端口策略」。
- **端口被占？** 用 `PORT=xxxxx` 指定别的端口；或 `npm run stop` 停掉占用的。
- **改了后端代码看不到效果？** 用 `dev:server`（热重载）或改完 `npm run build` 再 `start`。全局 `kanban serve` 不会反映本地改动。
- **前端改了不生效？** 用 `dev:web`（HMR）；若用 `start`/`serve` 看的是构建产物，需 `build:web`。
- **怎么同时跑正式版和测试版？** 见上文「并存」一节，端口不冲突、数据共享。
