# dsh-plugin-auto-update

Automatic, per-package updates for the DSH plugins you choose: switch it on in the
plugin page and tick the plugins that may upgrade themselves.

[![npm](https://img.shields.io/npm/v/@chendaleiq%2Fdsh-plugin-auto-update)](https://www.npmjs.com/package/@chendaleiq/dsh-plugin-auto-update)
[![license](https://img.shields.io/npm/l/@chendaleiq%2Fdsh-plugin-auto-update)](LICENSE)
[![DeepSeek Harness plugin](https://img.shields.io/badge/DSH-plugin-4D6BFE)](https://github.com/chendaleiQ/dsh-plugin-auto-update)

![Tick the packages to update, it checks npm on a schedule, every cycle is logged](https://raw.githubusercontent.com/chendaleiQ/dsh-plugin-auto-update/main/assets/demo.gif)

## What it does

- Looks up the **newest published version** of installed plugin bundles on npm
- Only touches packages you ticked; local `link:` / `file:` installs, pinned
  versions and bundles with a manager error are skipped
- Never jumps a **major** version and never installs a **prerelease** by default
- Updates go through the profile's running `pluginManager` — profile write lock,
  pnpm run, bundle-patch check and HMR reload stay with it. A failed install
  **reinstalls the previous version**

## Install

Plugins → Install → paste the package name:

```
@chendaleiq/dsh-plugin-auto-update
```

Restart DSH afterwards: a host half only loads on a fresh generation. The GitHub
address and an absolute local directory work the same way.

## Settings: a panel on the plugin's page

Plugins → **DSH Plugin Auto Update**, at the bottom of the detail page:

- **Version policy** — allow a new major, allow prereleases
- **Plugins that may update** — every registry-installed bundle, each with a
  checkbox; the first row means "all of them"
- **Check now** — runs a cycle immediately instead of waiting for the schedule
- To stop it, switch the bundle off in the plugin page; there is no separate
  switch inside the panel
- A bundle that cannot update is greyed out with its reason (local install,
  pinned, or has an error)

Edits apply immediately; no restart.

## Language

The copy follows DSH's language setting: Chinese by default, English once the app
is switched.

## Log

`~/.dsh/plugin-auto-update.log`, one JSON object per line (`schedule`, `cycle`,
`notify`, `plugin-started`; actions `current`, `would-update`, `updated`,
`failed`, `error`).

## Deliberate limits

- Only registry-installed bundles whose dependency is a range (`^`, `~`, `*`,
  `latest`); `link:` / `file:` and exact pins are never touched
- Bundles shipped with the app are never touched; your other configuration stays
  as it is
- Registry or manager failures are logged and never interrupt the other packages
- A host half needs an app restart; a renderer half is swapped by HMR

## Advanced

Fields the panel leaves out (`intervalHours`, six hours by default,
`initialDelayMinutes`, `maxUpdatesPerRun`, `dryRun`, `registry`, `timeoutMs`,
`logPath`) live in this bundle's `config` in the profile patch, or as an
override in `~/.dsh/profiles/<profile>/cordis.patch.yml`. Those need a restart.

## Development

```bash
node test/index.test.mjs    # the host half's update cycle
node test/client.test.mjs   # the renderer half: slot, remote envelope, labels
```

## License

MIT · https://github.com/chendaleiQ/dsh-plugin-auto-update
