# dsh-plugin-auto-update

Per-package automatic updates for DSH plugin bundles: you decide whether it is
on, and which packages may update themselves.

## What it does

- Looks up the **newest published version** of installed plugin bundles on npm
- Only touches packages you listed; local `link:` / `file:` installs, pinned
  versions and bundles with a manager error are skipped
- Never jumps a **major** version and never installs a **prerelease** by default
- Updates go through the profile's running `pluginManager` service — profile
  write lock, pnpm run, bundle-patch check and HMR reload all stay with it. A
  failed install **reinstalls the previous version**

## Install

Plugins → Install → paste this directory's absolute path:

```
/Users/<you>/Desktop/mine/dsh-plugins/dsh-plugin-auto-update
```

Restart DSH afterwards: a host half only loads on a fresh generation. Once the
package is on npm, the package name (`dsh-plugin-auto-update`) works too.

## Settings

The first start writes `~/.dsh/plugin-auto-update.json`:

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Master switch; off does nothing |
| `packages` | `["*"]` | Allowlist. `["*"]` = every registry-installed bundle; or name packages |
| `allowMajor` | `false` | Allow `1.x` → `2.0` |
| `allowPrerelease` | `false` | Allow `-rc` / `-beta` |
| `intervalHours` | `6` | How often to look |
| `initialDelayMinutes` | `5` | First look after startup |
| `dryRun` | `false` | Log what would happen, change nothing |
| `maxUpdatesPerRun` | `5` | Updates per cycle |
| `registry` | npmjs | Where versions come from; `https://registry.npmmirror.com` works |
| `timeoutMs` | `20000` | Per-lookup timeout |
| `notify` | `true` | macOS banner after a cycle that changed something |
| `settingsPath` / `logPath` | `~/.dsh/…` | Where the file and the log live |

The file is re-read every cycle, so edits apply **without a restart**. Once the
file exists it wins; `config` in `cordis.patch.yml` only seeds the first copy.

```jsonc
// only my notification plugin
{ "enabled": true, "packages": ["dsh-plugin-desktop-notify"] }

// everything, but rehearse first
{ "enabled": true, "dryRun": true }
```

## Log

`~/.dsh/plugin-auto-update.log`, one JSON object per line (`schedule`, `cycle`,
`notify`, `settings`, `plugin-started`).

## After an update

- A **renderer half** is swapped by HMR; nothing to do
- A **host half** needs a DSH restart; the log and the banner say so through
  `restartReason`
- The app never restarts itself — you pick the moment

## Deliberate limits

- Only registry-installed bundles whose dependency is a range (`^`, `~`, `*`,
  `latest`). `link:` / `file:` and exact pins are never touched
- Bundles shipped with the app (`availability: "installation"`) are never touched
- Versions only: your patches and other configuration stay as they are
- Registry or manager failures are logged and never interrupt the other packages
- Desktop banners are macOS-only; other platforms keep the log

## Turning it off

Disable it in the plugin page. Bundles already updated stay updated.

## Development

```bash
node test/index.test.mjs
```

The tests use a fake plugin manager and a fake registry: no real profile,
network, or home directory is involved.
