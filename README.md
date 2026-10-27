# dsh-plugin-auto-update

给 DSH 插件做**按包白名单的自动更新**：在插件页里打开开关、勾选允许自动升级的插件即可。

## 它做什么

- 定时去 npm 查已安装插件的**最新版本**
- 只更新你勾选的包；本地 `link:` / `file:` 安装、锁定版本、报错的包一律跳过
- 默认**不跨大版本**、**不装预发布**
- 更新走 profile 里运行中的官方 `pluginManager` 服务：profile 写锁、pnpm 执行、bundle 补丁校验、
  HMR 重载都由它负责；安装失败会把**旧版本装回去**

## 安装

插件页 → 安装 → 填本目录的绝对路径：

```
/Users/<you>/Desktop/mine/dsh-plugins/dsh-plugin-auto-update
```

装完**重启 DSH**（宿主半边需要重启才会加载）。发布到 npm 之后也可以直接填包名
`dsh-plugin-auto-update`。

## 配置：插件页里的面板

重启后打开 **插件 → dsh-plugin-auto-update**，详情页底部就是配置面板：

- **启用自动更新** — 总开关，默认关
- **自动更新的插件** — 列出所有「从注册表安装、依赖写成范围」的插件，逐个勾选；
  第一行「全部可更新的插件」= 用通配符匹配所有
- **升级范围** — 允许跨大版本 / 允许预发布 / 仅演练（只写日志）

改动即时生效，**不需要重启**：这些字段是 volatile 配置，宿主半边在每轮检查时读最新值。

日志固定在 `~/.dsh/plugin-auto-update.log`，每行一个 JSON：

```json
{"at":"2026-10-27T07:10:00.000Z","kind":"cycle","decisions":[{"name":"dsh-plugin-desktop-notify","action":"updated","installed":"0.5.6","latest":"0.5.7"}]}
```

`kind` 有 `schedule` / `cycle` / `notify` / `plugin-started`；`action` 有
`current` / `would-update` / `updated` / `failed` / `error`。

## 更新之后

- **渲染层半边**（`dsh.client`）由 HMR 直接换掉，不用重启
- **宿主半边**要重启 DSH 才生效；日志和横幅里的 `restartReason` 会写明
- 应用**不会**自动重启，重启时机由你决定

## 边界（有意为之）

- 只碰「从注册表安装、且依赖写成范围（`^` `~` `*` `latest`）」的包。`link:` / `file:` / 精确锁定的版本一律不动
- 随 DSH 自带的 bundle（`availability: "installation"`）不动
- 只升版本，不动你的其他配置；不改 `cordis.patch.yml` 里的其它行
- 网络或插件管理器出错时只记录，不会中断其他包
- Windows / Linux 没有桌面横幅（日志照写）；macOS 用 `osascript`

## 高级配置

面板没覆盖的字段（检查间隔 `intervalHours`、首次延迟 `initialDelayMinutes`、
单轮上限 `maxUpdatesPerRun`、`registry`、`timeoutMs`、`notify`、`logPath`）可以在
本 bundle 的 profile patch 里写 `config`；也可以在
`~/.dsh/profiles/<profile>/cordis.patch.yml` 里覆盖同一行。改完需要重启。

## 停用

插件页里停用即可。已经更新过的插件保持更新后的版本。

## 开发

```bash
node test/index.test.mjs    # 宿主半边的更新循环
node test/client.test.mjs   # 浏览器半边注册的插槽
```

两个测试都用假对象：不碰真实 profile、网络、home 目录，也不需要启动 DSH。
