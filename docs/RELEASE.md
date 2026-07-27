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

## 三、发布到 npm

```bash
npm publish --registry=https://registry.npmjs.org/ --otp=你的6位验证码
```

发布时 `prepublishOnly` 钩子会自动执行 `build:all`（构建前端+后端）+ `test`（113 个测试），全过才上传。

### 命令参数说明（重要）

| 参数 | 为什么必须加 |
|---|---|
| `--registry=https://registry.npmjs.org/` | 本机默认 registry 是淘宝镜像 `npmmirror.com`，**镜像站不支持登录/发布**。必须强制走官方源 |
| `--otp=xxxxxx` | npm 账号开了两步验证（2FA），发布必须提供验证码 |

### OTP 验证码从哪来？

打开你当初配置 2FA 时的**验证器 App**（Google Authenticator / Microsoft Authenticator / 1Password 等），找到 `npmjs.com` 这一条，显示的 **6 位数字**就是（每 30 秒变化）。

### 常见报错与解决

| 报错 | 原因 | 解决 |
|---|---|---|
| `Publishing to https://registry.npmmirror.com/` 然后失败 | 没加 `--registry`，走了镜像 | 命令补 `--registry=https://registry.npmjs.org/` |
| `E403 Two-factor authentication ... is required` | 没传 OTP | 命令补 `--otp=xxxxxx` |
| `E403 You do not have permission to publish` | 包名被占或未登录 | 先 `npm login --registry=...` 确认登录 |
| `EPUBLISHCONFLICT` | 该版本已发布过 | 改一个新版本号再发 |

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

# 2. 发布（替换 OTP）：
npm publish --registry=https://registry.npmjs.org/ --otp=XXXXXX

# 3. 验证：
npm view auv-kanban version
```
