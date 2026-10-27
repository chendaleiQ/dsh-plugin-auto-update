/**
 * dsh-plugin-auto-update
 *
 * Host half only: keep selected plugin bundles on their newest compatible
 * release, without going through "uninstall, reinstall, done by hand".
 *
 * Design notes
 *
 * - Updates go through the running profile's own `pluginManager` service
 *   (`listBundles` / `removeBundle` / `installBundle`). That service owns the
 *   profile write lock, the pnpm run, the bundle-patch check and the HMR
 *   recompose, so this plugin never touches `package.json` or `node_modules`
 *   itself. If the service is missing (a headless profile), the plugin does
 *   nothing at all.
 * - Nothing is updated unless the user switched it on AND named the package:
 *   `packages: ["*"]` means every registry-installed bundle, an explicit list
 *   means exactly those. Local `link:` / `file:` installs are never touched.
 * - Pinned installs stay pinned. A dependency recorded as an exact version
 *   (`"1.2.3"`) is left alone, because the person who wrote it chose a pin; a
 *   range (`^1.2.3`, `~1.2.3`, `*`) is what this plugin advances.
 * - The settings file is re-read on every cycle, so editing
 *   `~/.dsh/plugin-auto-update.json` takes effect without a restart.
 * - Replacing a host half needs a restart to take effect; the cycle reports
 *   `restartRequired` and the desktop decides when to run it. A renderer half
 *   is picked up by HMR on its own.
 */

import { execFile } from "node:child_process"
import { appendFile, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

/** Defaults written to the settings file the first time the plugin runs. */
export const DEFAULTS = {
  /** Master switch. Off until the person turns it on. */
  enabled: false,
  /** `["*"]` = every registry-installed bundle; otherwise an allowlist of package names. */
  packages: ["*"],
  /** A newer major is offered only when this is true. */
  allowMajor: false,
  /** `1.0.0-rc.1` is offered only when this is true. */
  allowPrerelease: false,
  /** How often to look, in hours. */
  intervalHours: 6,
  /** First look after this many minutes, so startup is not disturbed. */
  initialDelayMinutes: 1,
  /** Log what would happen without changing anything. */
  dryRun: false,
  /** Stop after this many updates in one cycle. */
  maxUpdatesPerRun: 5,
  /** Registry used to look up the newest version. */
  registry: "https://registry.npmjs.org",
  /** Per-request timeout for the registry lookup. */
  timeoutMs: 20000,
  /** A desktop banner (macOS) after a cycle that changed something. */
  notify: true,
  /** Where the log lives. */
  logPath: "~/.dsh/plugin-auto-update.log",
}

const PLUGIN_LOG_LIMIT = 4000

/** Expand a leading `~` against the current home. */
export function expandHome(path) {
  const text = String(path ?? "")
  if (text === "~") return homedir()
  if (text.startsWith("~/")) return join(homedir(), text.slice(2))
  return text
}

/**
 * Parse `X.Y.Z[-prerelease][+build]`.
 * @returns {{major:number, minor:number, patch:number, prerelease:string}|null}
 */
export function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    String(value ?? "").trim(),
  )
  if (match === null) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? "",
  }
}

/** Compare two release identifiers; numeric segments compare as numbers. */
function comparePrerelease(left, right) {
  if (left === right) return 0
  if (left === "") return 1
  if (right === "") return -1
  const a = left.split(".")
  const b = right.split(".")
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const one = a[index]
    const two = b[index]
    if (one === undefined) return -1
    if (two === undefined) return 1
    const numericOne = /^\d+$/.test(one)
    const numericTwo = /^\d+$/.test(two)
    if (numericOne && numericTwo) {
      const difference = Number(one) - Number(two)
      if (difference !== 0) return difference < 0 ? -1 : 1
      continue
    }
    if (numericOne !== numericTwo) return numericOne ? -1 : 1
    if (one !== two) return one < two ? -1 : 1
  }
  return 0
}

/**
 * Compare two versions the way semver orders releases.
 * @returns {-1|0|1} negative when `left` is older.
 */
export function compareVersions(left, right) {
  const a = typeof left === "string" ? parseVersion(left) : left
  const b = typeof right === "string" ? parseVersion(right) : right
  if (a === null || b === null) return 0
  for (const field of ["major", "minor", "patch"]) {
    if (a[field] !== b[field]) return a[field] < b[field] ? -1 : 1
  }
  return comparePrerelease(a.prerelease, b.prerelease)
}

/**
 * Whether `latest` is an update this configuration accepts for `installed`.
 * @param {string} installed Version currently on disk.
 * @param {string} latest Version offered by the registry.
 * @param {{allowMajor?:boolean, allowPrerelease?:boolean}} policy
 */
export function acceptsUpdate(installed, latest, policy = {}) {
  const current = parseVersion(installed)
  const next = parseVersion(latest)
  if (current === null || next === null) return false
  if (compareVersions(current, next) >= 0) return false
  if (next.prerelease !== "" && policy.allowPrerelease !== true) return false
  if (current.prerelease === "" && next.major !== current.major && policy.allowMajor !== true) return false
  return true
}

/** A dependency value that names a mutable range rather than a pin or a local path. */
export function isFloatingSpec(spec) {
  const text = String(spec ?? "").trim()
  if (text === "") return false
  if (/^(link|file|workspace|portal|git|github|https?):/.test(text)) return false
  // Path specs point at a checkout, whose version is whatever that checkout says.
  if (/^\.{1,2}\//.test(text) || text.startsWith("/") || text.startsWith("~/")) return false
  if (/^(npm|jsr):/.test(text)) return true
  // `1.2.3` / `=1.2.3` are pins; `^1.2.3`, `~1.2.3`, `>=1`, `*`, `latest` are ranges.
  return !/^=?v?\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(text)
}

/**
 * Pick the bundles worth looking at: installed through the profile, version
 * known, no manager error, not a local path, and named by the allowlist.
 */
export function selectCandidates(bundles, packages) {
  const allow = Array.isArray(packages) ? packages : ["*"]
  const everything = allow.includes("*")
  return (bundles ?? []).filter((bundle) => {
    if (bundle === null || typeof bundle !== "object") return false
    if (bundle.availability !== "profile") return false
    if (bundle.installed !== true) return false
    if (typeof bundle.name !== "string" || typeof bundle.version !== "string") return false
    if (bundle.error !== undefined) return false
    if (!isFloatingSpec(bundle.source)) return false
    return everything || allow.includes(bundle.name)
  })
}

/** Read the newest published version of one package. */
export async function newestVersion(registry, name, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs
  if (typeof fetchImpl !== "function") return { error: "fetch is unavailable" }
  const base = String(registry ?? DEFAULTS.registry).replace(/\/+$/, "")
  const encoded = name.startsWith("@") ? name.replace("/", "%2F") : encodeURIComponent(name)
  const url = `${base}/${encoded}/latest`
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.ok !== true) return { error: `registry answered ${String(response.status)}` }
    const body = await response.json()
    if (typeof body?.version !== "string") return { error: "registry answer has no version" }
    return { version: body.version }
  } catch (error) {
    return { error: String(error?.message ?? error) }
  }
}

/** Merge the stored settings over the defaults, ignoring unknown keys. */
export function resolveSettings(stored) {
  const resolved = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS)) {
    const value = stored?.[key]
    if (value === undefined) continue
    if (Array.isArray(DEFAULTS[key])) {
      if (Array.isArray(value) && value.every((item) => typeof item === "string")) resolved[key] = value
      continue
    }
    if (typeof DEFAULTS[key] === "number") {
      if (typeof value === "number" && Number.isFinite(value)) resolved[key] = value
      continue
    }
    if (typeof DEFAULTS[key] === "boolean") {
      if (typeof value === "boolean") resolved[key] = value
      continue
    }
    if (typeof value === "string" && value !== "") resolved[key] = value
  }
  return resolved
}

/** One line per action, JSON so it stays greppable. */
export async function appendLog(path, entry) {
  const target = expandHome(path)
  await mkdir(dirname(target), { recursive: true })
  await appendFile(target, `${JSON.stringify(entry)}\n`, "utf8")
}

/** A desktop banner on macOS; other platforms keep the log line only. */
function announce(title, body) {
  if (process.platform !== "darwin") return
  try {
    execFile(
      "/usr/bin/osascript",
      [
        "-e",
        'on run argv\n display notification (item 1 of argv) with title (item 2 of argv)\nend run',
        body,
        title,
      ],
      { timeout: 10000 },
      () => {},
    )
  } catch {
    /* a banner is best effort */
  }
}

/** The outcome of handing the update to the plugin manager. */
function outcomeOf(result, fallback) {
  if (result === null || typeof result !== "object") return { application: fallback }
  if (result.application === "failed") {
    const reason = result.error?.code ?? result.error?.message ?? "unknown"
    return { application: "failed", reason: String(reason) }
  }
  return {
    application: typeof result.application === "string" ? result.application : fallback,
    ...result.restartReason === undefined ? {} : { restartReason: result.restartReason },
  }
}

/**
 * One updater instance: a settings file, a plugin manager, and a log.
 * Everything external is injected so the cycle can be tested without a desktop.
 */
export function createUpdater(options = {}) {
  const managerOf = typeof options.manager === "function" ? options.manager : () => options.manager
  const readSettings = typeof options.readSettings === "function"
    ? options.readSettings
    : () => resolveSettings(options.config ?? {})
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const logPath = options.logPath ?? DEFAULTS.logPath
  let running = false
  let lastRunAt = 0
  // `plugin-manager/changed` fires around our own install, so a short cooldown
  // keeps one update from turning into a burst of registry lookups.
  const cooldownMs = options.cooldownMs ?? 5000

  const log = async (entry) => {
    try {
      await appendLog(logPath, { at: new Date().toISOString(), ...entry })
    } catch {
      /* the log must never break a cycle */
    }
  }

  const updateOne = async (bundle, latest) => {
    const manager = managerOf()
    if (manager === undefined) return { ok: false, error: "pluginManager is gone" }
    let removed
    try {
      removed = await manager.removeBundle(bundle.name)
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) }
    }
    const removal = outcomeOf(removed, "applied")
    if (removal.application === "failed") return { ok: false, error: `remove failed: ${removal.reason}` }
    let installed
    try {
      installed = await manager.installBundle(`${bundle.name}@${latest}`, { enabled: true })
    } catch (error) {
      // Put the previous version back: leaving the bundle uninstalled would be
      // worse than the failed update.
      try {
        await manager.installBundle(`${bundle.name}@${bundle.version}`, { enabled: true })
      } catch {
        /* the rollback is best effort; the log names it either way */
      }
      return { ok: false, error: String(error?.message ?? error), rolledBack: true }
    }
    const installing = outcomeOf(installed, "applied")
    if (installing.application === "failed") {
      try {
        await manager.installBundle(`${bundle.name}@${bundle.version}`, { enabled: true })
      } catch {
        /* see above */
      }
      return { ok: false, error: `install failed: ${installing.reason}`, rolledBack: true }
    }
    return { ok: true, application: installing.application, restartReason: installing.restartReason }
  }

  const runOnce = async (runOptions = {}) => {
    if (running) return { skipped: "busy" }
    if (runOptions.force !== true && Date.now() - lastRunAt < cooldownMs) return { skipped: "cooldown" }
    running = true
    lastRunAt = Date.now()
    try {
      const resolved = readSettings()
      const manager = managerOf()
      if (manager === undefined) {
        await log({ kind: "cycle", skipped: "no-plugin-manager" })
        return { skipped: "no-plugin-manager" }
      }
      const bundles = await manager.listBundles()
      const candidates = selectCandidates(bundles, resolved.packages)
      if (resolved.enabled !== true) {
        await log({ kind: "cycle", skipped: "disabled", candidates: candidates.map((item) => item.name) })
        return { skipped: "disabled", candidates: candidates.length }
      }
      const decisions = []
      let changed = 0
      for (const bundle of candidates) {
        if (changed >= resolved.maxUpdatesPerRun) break
        const newest = await newestVersion(resolved.registry, bundle.name, {
          fetchImpl,
          timeoutMs: resolved.timeoutMs,
        })
        if (newest.error !== undefined) {
          decisions.push({ name: bundle.name, action: "error", reason: newest.error })
          continue
        }
        if (!acceptsUpdate(bundle.version, newest.version, resolved)) {
          decisions.push({ name: bundle.name, action: "current", installed: bundle.version, latest: newest.version })
          continue
        }
        if (resolved.dryRun === true) {
          decisions.push({ name: bundle.name, action: "would-update", installed: bundle.version, latest: newest.version })
          continue
        }
        const outcome = await updateOne(bundle, newest.version)
        changed += outcome.ok ? 1 : 0
        decisions.push({
          name: bundle.name,
          action: outcome.ok ? "updated" : "failed",
          installed: bundle.version,
          latest: newest.version,
          ...outcome.ok
            ? { application: outcome.application, ...outcome.restartReason === undefined ? {} : { restartReason: outcome.restartReason } }
            : { reason: outcome.error, rolledBack: outcome.rolledBack === true },
        })
      }
      await log({ kind: "cycle", decisions })
      const updated = decisions.filter((item) => item.action === "updated")
      if (updated.length > 0) {
        const names = updated.map((item) => `${item.name} → ${item.latest}`).join(", ")
        await log({ kind: "notify", names })
        if (options.announce ?? true) {
          announce("DSH 插件已自动更新", `${names}${updated.some((item) => item.restartReason !== undefined) ? "，重启后生效" : ""}`)
        }
      }
      return { decisions, updated: updated.length }
    } finally {
      running = false
    }
  }

  return { runOnce, log, settings: () => readSettings() }
}

