# dsh-plugin-auto-update

给 DSH 插件做**按包白名单的自动更新**：你决定开不开、哪些包可以自动升。

## 它做什么

- 定时去 npm 查已安装插件的**最新版本**
- 只更新你点名的包；本地 `link:` / `file:` 安装、锁定版本、报错的包一律跳过
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

## 配置

首次启动会生成 `~/.dsh/plugin-auto-update.json`，把它改成你要的样子：

```json
{
  "enabled": false,
  "packages": ["*"],
  "allowMajor": false,
  "allowPrerelease": false,
  "intervalHours": 6,
  "initialDelayMinutes": 5,
  "dryRun": false,
  "maxUpdatesPerRun": 5,
  "registry": "https://registry.npmjs.org",
  "timeoutMs": 20000,
  "notify": true,
  "settingsPath": "~/.dsh/plugin-auto-update.json",
  "logPath": "~/.dsh/plugin-auto-update.log"
}
```

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `false` | 总开关，关着就什么都不做 |
| `packages` | `["*"]` | 白名单。`["*"]` = 所有注册表安装的插件；也可以写 `["dsh-plugin-desktop-notify"]` |
| `allowMajor` | `false` | 是否允许升大版本（`1.x` → `2.0`） |
| `allowPrerelease` | `false` | 是否允许升到 `-rc` / `-beta` |
| `intervalHours` | `6` | 多久查一次 |
| `initialDelayMinutes` | `5` | 启动后延迟多久做第一次检查 |
| `dryRun` | `false` | 只写日志、不动手（先看一轮再开） |
| `maxUpdatesPerRun` | `5` | 单轮最多更新几个包 |
| `registry` | npm 官方 | 版本来源；国内可换 `https://registry.npmmirror.com` |
| `timeoutMs` | `20000` | 单次版本查询超时 |
| `notify` | `true` | macOS 下更新成功后弹一条横幅 |
| `settingsPath` / `logPath` | `~/.dsh/…` | 设置与日志的位置 |

**改完不用重启**：每轮都重新读这个文件。

> 注意：文件一旦存在，就以文件为准；`cordis.patch.yml` 里的 `config` 只用于**首次**生成这个文件。

常见配置：

```jsonc
// 只自动更新我自己的通知插件
{ "enabled": true, "packages": ["dsh-plugin-desktop-notify"] }

// 全部自动更新，但先演练一轮
{ "enabled": true, "dryRun": true }

// 只更新小版本，国内源
{ "enabled": true, "registry": "https://registry.npmmirror.com", "allowMajor": false }
```

## 日志

`~/.dsh/plugin-auto-update.log`，每行一个 JSON：

```json
{"at":"2026-10-27T07:10:00.000Z","kind":"cycle","decisions":[{"name":"dsh-plugin-desktop-notify","action":"updated","installed":"0.5.6","latest":"0.5.7"}]}
```

`kind` 有 `schedule` / `cycle` / `notify` / `settings` / `plugin-started`；`action` 有
`current` / `would-update` / `updated` / `failed` / `error`。

## 更新之后

- **渲染层半边**（`dsh.client`）由 HMR 直接换掉，不用重启
- **宿主半边**要重启 DSH 才生效；横幅和日志里的 `restartReason` 会写明
- 应用**不会**自动重启，重启时机由你决定

## 边界（有意为之）

- 只碰「从注册表安装、且依赖写成范围（`^` `~` `*` `latest`）」的包。`link:` / `file:` / 精确锁定的版本一律不动
- 随 DSH 自带的 bundle（`availability: "installation"`）不动
- 只升版本，不动你的其他配置；不改 `cordis.patch.yml`
- 网络或插件管理器出错时只记录，不会中断其他包
- Windows / Linux 没有桌面横幅（日志照写）；macOS 用 `osascript`

## 停用

插件页里停用即可。已经更新过的插件保持更新后的版本。

## 开发

```bash
node test/index.test.mjs
```

测试用假的 plugin manager 和假的 registry，不碰真实 profile、网络和 home 目录。
