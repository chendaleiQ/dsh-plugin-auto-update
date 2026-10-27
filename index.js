/**
 * dsh-plugin-auto-update — host half.
 *
 * Settings live in the profile Cordis patch as volatile fields, so the page this
 * bundle registers in the Plugins tab can edit them live. The update cycle
 * itself lives in `./lib/plan.js`, which stays testable without the app.
 */

import z from "@deepseek-ai/schemastery"

import { DEFAULTS, createUpdater, resolveSettings } from "./lib/plan.js"

export * from "./lib/plan.js"

/** Settings namespace: the profile entry id this plugin's row is addressed by. */
const NAMESPACE = "auto-update"

/** Settings the plugin page edits; every field is volatile, so edits apply live. */
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  packages: z.array(z.string()).default(["*"]).volatile(),
  allowMajor: z.boolean().default(false).volatile(),
  allowPrerelease: z.boolean().default(false).volatile(),
  dryRun: z.boolean().default(false).volatile(),
  intervalHours: z.number().default(6).volatile(),
  initialDelayMinutes: z.number().default(1).volatile(),
  maxUpdatesPerRun: z.number().default(5).volatile(),
  registry: z.string().default("https://registry.npmjs.org").volatile(),
  timeoutMs: z.number().default(20000).volatile(),
  logPath: z.string().default("~/.dsh/plugin-auto-update.log").volatile(),
})

/**
 * Mount the plugin into a profile.
 *
 * The page in the Plugins tab writes the same fields this half reads, through
 * the settings service: every field is volatile, so an edit is committed into
 * the running config object without remounting this plugin.
 *
 * @param {object} ctx Cordis context of the host.
 * @param {object} rawConfig Bundle config from cordis.patch.yml.
 */
export function apply(ctx, rawConfig) {
  /** The live config object the loader keeps updated in place. */
  const live = () => ctx.fiber?.config ?? ctx.config ?? rawConfig ?? {}
  /**
   * A volatile field is a reference the loader keeps current (`{ get(), [write] }`,
   * frozen, carrying a symbol), not the value itself; read through it so a
   * settings-page edit is visible here at once. Detected structurally rather
   * than through cosmokit: a link-installed plugin may only import the packages
   * the runtime actually ships, and cosmokit is not one of them.
   */
  const isVolatileRef = (value) => typeof value === "object"
    && value !== null
    && typeof value.get === "function"
    && Object.getOwnPropertySymbols(value).length > 0
  const pluck = (config, key) => {
    const value = config?.[key]
    return isVolatileRef(value) ? value.get() : value
  }
  /**
   * The settings document is the source of truth: it merges the bundle defaults
   * with the profile override the page writes, while the config object this
   * plugin was mounted with can still be the bundle layer alone.
   */
  const settingsFromDocument = () => {
    try {
      const forms = ctx.get?.("settings")
      const row = forms?.describe?.().find?.((item) => item.ns === NAMESPACE)
      if (row === undefined) return undefined
      return resolveSettings(row.value ?? {})
    } catch {
      return undefined
    }
  }
  const settingsOf = () => settingsFromDocument() ?? resolveSettings(
    Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, pluck(live(), key)])),
  )

  const updater = createUpdater({
    readSettings: settingsOf,
    logPath: settingsOf().logPath,
    manager: () => {
      try {
        return ctx.get?.("pluginManager")
      } catch {
        return undefined
      }
    },
  })

  // The page is ours; keep the settings service from generating one.
  ctx.inject(["settings"], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), "auto-update: settings presentation")
  })

  /**
   * One timeout drives everything: when it fires the settings are read again,
   * so switching the feature on takes effect without a restart (a disabled
   * plugin wakes up once a minute to look).
   */
  let timer
  let stopped = false
  const POLL_MS = 60_000
  const arm = (delayMs) => {
    if (stopped) return
    timer = setTimeout(fire, Math.max(1000, delayMs))
    timer.unref?.()
  }
  const fire = async () => {
    if (stopped) return
    let enabled = false
    let intervalMs = DEFAULTS.intervalHours * 3_600_000
    try {
      const settings = settingsOf()
      enabled = settings.enabled === true
      intervalMs = Math.max(0.05, settings.intervalHours) * 3_600_000
      if (enabled) await updater.runOnce()
    } catch (error) {
      await updater.log({ kind: "cycle", error: String(error?.message ?? error) })
    }
    arm(enabled ? intervalMs : POLL_MS)
  }
  const schedule = async () => {
    const settings = settingsOf()
    await updater.log({
      kind: "schedule",
      enabled: settings.enabled === true,
      firstCheckMinutes: settings.initialDelayMinutes,
      intervalHours: settings.intervalHours,
    })
    arm(Math.max(0, settings.initialDelayMinutes) * 60_000)
  }

  ctx.effect(() => {
    void schedule()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, "auto-update: schedule")

  // A settings edit is a deliberate "look now", and so is a management change;
  // without these the next look would wait for the interval to pass.
  ctx.effect(() => {
    // The loader emits this one filtered to the edited plugin's own fiber, so it
    // must be heard here rather than on the root.
    const listener = () => {
      void updater.runOnce({ force: true }).catch(() => {})
    }
    ctx.on?.("loader/volatile-update", listener)
    return () => {
      ctx.off?.("loader/volatile-update", listener)
    }
  }, "auto-update: settings changes")

  // A management change is the natural moment to look again; the next tick
  // would otherwise wait for the interval to pass.
  ctx.effect(() => {
    // The manager emits on its own context, which bubbles to the root — not to
    // a sibling row. Listen on the root so a management change is noticed.
    const host = ctx.root ?? ctx
    const listener = () => {
      void updater.runOnce({ force: true }).catch(() => {})
    }
    host.on?.("plugin-manager/changed", listener)
    return () => {
      host.off?.("plugin-manager/changed", listener)
    }
  }, "auto-update: manager changes")

  void updater.log({ kind: "plugin-started", pid: process.pid, platform: process.platform })
}
