# dsh-plugin-auto-update

Per-package automatic updates for DSH plugin bundles: turn it on in the Plugins
tab and tick the plugins that may upgrade themselves.

## What it does

- Looks up the **newest published version** of installed plugin bundles on npm
- Only touches packages you ticked; local `link:` / `file:` installs, pinned
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

## Settings: a panel on the plugin's page

After the restart open **Plugins → dsh-plugin-auto-update**; the panel sits at
the bottom of the detail page:

- **Enable auto update** — the master switch, off by default
- **Plugins that may update** — every registry-installed bundle whose dependency
  is a range, each with a checkbox; the first row means "all of them"
- **Version policy** — allow a new major, allow prereleases, dry run (log only)

Edits apply immediately, **without a restart**: the fields are volatile, and the
host half reads the live values on every cycle.

The log lives at `~/.dsh/plugin-auto-update.log`, one JSON object per line
(`schedule`, `cycle`, `notify`, `plugin-started`; actions `current`,
`would-update`, `updated`, `failed`, `error`).

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

## Advanced

Fields the panel leaves out (`intervalHours`, `initialDelayMinutes`,
`maxUpdatesPerRun`, `registry`, `timeoutMs`, `notify`, `logPath`) can be set in
this bundle's `config` in the profile patch, or overridden in
`~/.dsh/profiles/<profile>/cordis.patch.yml`. Those need a restart.

## Turning it off

Disable it in the plugin page. Bundles already updated stay updated.

## Development

```bash
node test/index.test.mjs    # the host half's update cycle
node test/client.test.mjs   # the browser half's slot registration
```

Both use fakes: no real profile, network, home directory, or running DSH.
