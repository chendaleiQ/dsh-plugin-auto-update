# dsh-plugin-auto-update

给 DSH 插件做**按包白名单的自动更新**：在插件页打开开关、勾选允许自动升级的插件即可。

## 它做什么

- 按计划去 npm 查已安装插件的**最新版本**
- 只更新你勾选的包；本地 `link:` / `file:` 安装、锁定版本、报错的包一律跳过
- 默认**不跨大版本**、**不装预发布**
- 更新走 profile 里运行中的官方 `pluginManager`：profile 写锁、pnpm 执行、bundle 补丁校验、HMR 重载都由它负责；安装失败会把**旧版本装回去**

## 安装

插件页 → 安装 → 填包名：

```
@chendaleiq/dsh-plugin-auto-update
```

装完**重启 DSH**（宿主半边需要新代际才加载）。也可以填 GitHub 地址或本地目录的绝对路径。

## 配置：插件页里的面板

插件 → **DSH 插件自动更新** → 详情页底部：

- **启用自动更新** —— 总开关，默认关
- **升级范围** —— 允许跨大版本 / 允许预发布
- **自动更新的插件** —— 列出所有从注册表安装的插件，逐个勾选；「全部可更新的插件」= 通配
- 不能更新的包会置灰并说明原因（本地安装 / 锁定版本 / 存在错误）

改动即时生效，不需要重启。

## 语言

跟随 DSH 的语言设置：默认中文，切英文后插件页和面板文案同步变英文。

## 日志

`~/.dsh/plugin-auto-update.log`，每行一个 JSON：

```json
{"at":"…","kind":"cycle","decisions":[{"name":"dsh-plugin-desktop-notify","action":"updated","installed":"0.5.6","latest":"0.5.7"}]}
```

`action` 有 `current` / `would-update` / `updated` / `failed` / `error`。

## 边界（有意为之）

- 只碰「从注册表安装、且依赖写成范围（`^` `~` `*` `latest`）」的包
- 随 DSH 自带的 bundle 不动；不修改你的其它配置
- 网络或插件管理器出错只记录，不中断其它包
- 宿主半边更新后需要重启应用；渲染层由 HMR 直接换掉

## 高级配置

面板没覆盖的字段（`intervalHours` 默认 6 小时、`initialDelayMinutes`、`maxUpdatesPerRun`、`dryRun`、`registry`、`timeoutMs`、`notify`、`logPath`）写在 profile patch 的 `config` 里，或覆盖 `~/.dsh/profiles/<profile>/cordis.patch.yml` 的同一行。改完需要重启。

## 开发

```bash
node test/index.test.mjs    # 宿主半边：检查与更新循环
node test/client.test.mjs   # 渲染层：插槽注册、远端信封、置灰原因
```

## 协议

MIT · 仓库 https://github.com/chendaleiQ/dsh-plugin-auto-update
