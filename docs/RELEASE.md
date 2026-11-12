# 发布流程

> 本文档记录 Auv Kanban 的发版步骤。每次发新版本时按此操作即可。
> 前置：已配置好 npm 账号 + GitHub 仓库（首次配置见文末「环境准备」）。

## 一、改版本号

编辑 `package.json`，把 `version` 字段从当前版本改到目标版本（遵循 semver）：

```diff
- "version": "0.1.1",
+ "version": "0.1.2",
```

> 版本号规则（semver）：
> - **补丁版**（0.1.1 → 0.1.2）：修 bug、小改动
> - **次版本**（0.1.x → 0.2.0）：新功能、向后兼容
> - **主版本**（x.y.z → 1.0.0）：破坏性变更

## 二、提交并打 tag

```bash
cd /Users/sunknight/web/code/sk_ideas/auv_kanban
git add package.json
git commit -m "chore: bump version to 0.1.2"
git tag v0.1.2
git push origin main --tags      # 注意带 --tags，否则 tag 不会推上去
```

> ⚠️ **常见坑**：只写 `git push origin main` 不会推 tag。必须带 `--tags`，或单独 `git push origin v0.1.2`。

> **如果 git push 网络超时**（`Failed to connect to github.com port 443`）：
> ```bash
> # 方案1：降级 HTTP 协议规避 framing 错误
> git -c http.version=HTTP/1.1 push origin main --tags
>
> # 方案2：用 gh API 直接在远程建 tag（基于已推送的 commit，绕过本地 push 通道）
> gh api repos/sunknight/auv_kanban/git/refs \
>   -f ref="refs/tags/v0.1.2" \
>   -f sha="$(git rev-parse v0.1.2)"
> ```

## 三、发布（Trusted Publishing，推 tag 自动发）

第二步推完 tag，GitHub Actions（[.github/workflows/release.yml](../.github/workflows/release.yml)）自动接手：构建前端+后端 → 跑全量测试（`prepublishOnly` 钩子）→ 通过 OIDC 换取 npm 短期令牌发布。**无需 npm token、无需 OTP**，也不受 npm「2027-01 起 bypass2FA token 限制直接发布」政策影响。

> **一次性配置（2026-11-12 已配好，留档备查）**：
> 1. npmjs.com → 包 `auv-kanban` → Settings → **Trusted publishing**：owner `sunknight` / repo `auv_kanban` / workflow `release.yml` / environment `release`
> 2. GitHub 仓库 Settings → **Environments** → 建 `release` 环境
> 3. 硬性前提：`package.json` 的 `repository.url` 必须与实际仓库**完全一致**（`auv_kanban` 下划线，不是 `auv-kanban`）
> 4. 坑：trusted publisher 配置保存后 **2 天内必须完成首次发布**，过期需删除重建；已建连接不可改，只能删了重建

### 发布失败时查什么

- Actions 页面看 workflow 日志（构建/测试失败会有明确报错）
- 报 404/权限类错误 → 对照上面「一次性配置」逐项核对（尤其 repo 名下划线、workflow 文件名、environment 名三处拼写）
- Trusted Publishing 整条链路故障时，可临时回退手工发布（见下）

### 备用：手工发布（Trusted Publishing 不可用时）

```bash
npm publish --registry=https://registry.npmjs.org/ --otp=你的6位验证码
```

- `--registry` 必须带：本机默认是淘宝镜像，镜像站不支持发布
- `--otp`：Classic Publish token + 账号 2FA 时必填（验证器 App 里 `npmjs.com` 的 6 位码，30 秒一变）
- ⚠️ E404「do not have permission」多为 **token 失效被 404 掩盖**，先 `npm whoami --registry=https://registry.npmjs.org/` 验证（E401 = token 过期/撤销，去 npmjs.com 换新）
- ⚠️ Granular token 勾了 bypass 2FA 的免码直发 **2027-01 起失效**（只能 staging + 网页人工批准），别再依赖

## 四、验证发布成功

```bash
# 查看 npm 上的最新版本
npm view auv-kanban version
```

应输出刚发布的版本号（如 `0.1.2`）。

## 五、（可选）更新本地全局 kanban 到新版

如果你本机之前装过全局 `auv-kanban`，升级到刚发布的版本：

```bash
npm install -g auv-kanban
kanban --version     # 确认是新版
```

---

## 环境准备（仅首次需要）

以下是一次性配置，配好后以后发版只需走上面「一~四」步。

### 1. npm 账号

- 去 https://www.npmjs.com/signup 注册账号
- 在 Account Settings 里**开启两步验证（2FA）**，用验证器 App 扫码绑定
- 本机登录：
  ```bash
  npm login --registry=https://registry.npmjs.org/
  ```
  > 同样必须带 `--registry`，否则登录到淘宝镜像会失败。

### 2. GitHub 仓库

仓库地址：https://github.com/sunknight/auv_kanban（Private）

本地已通过 `gh` CLI 登录，push 代码走 HTTPS + gh 凭证，无需手动输密码。验证：
```bash
gh auth status      # 应显示 Logged in to github.com account sunknight
```

### 3. 关于 npm link（开发调试用）

开发时若想让全局 `kanban` 即时跟随源码变化，可以临时 link 到本地仓库：
```bash
cd /Users/sunknight/web/code/sk_ideas/auv_kanban
npm link
```

发版前或调试完，切回正式包：
```bash
npm install -g auv-kanban   # 覆盖 link，装回 npm 正式版
```

> **判断当前全局 kanban 是 link 还是正式包**：
> ```bash
> ls -la "$(which kanban)"
> ```
> - 指向 `.../node_modules/auv-kanban/...` → 正式包
> - 指向你的本地源码目录 → npm link 状态

---

## 快速参考（每次发版复制即用）

```bash
cd /Users/sunknight/web/code/sk_ideas/auv_kanban

# 1. 改 package.json 的 version 后：
git add package.json
git commit -m "chore: bump version to <新版本>"
git tag v<新版本>
git push origin main --tags

# 2. 发布：推 tag 即自动触发 Actions（Trusted Publishing），无需任何 token/OTP
#    去 GitHub Actions 页面看进度：构建 → 254 个测试 → npm 发布

# 3. 验证（Actions 跑完后 1~2 分钟）：
npm view auv-kanban version

# 4. 更新本机全局 + 重启日常服务：
npm install -g auv-kanban --registry=https://registry.npmjs.org/
kill $(lsof -tiTCP:38311 -sTCP:LISTEN) && nohup node /opt/homebrew/bin/kanban serve > /tmp/kanban-serve-38311.log 2>&1 &
```
