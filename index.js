/**
 * dsh-plugin-auto-update — host half.
 *
 * Settings live in the profile Cordis patch as volatile fields, so the page this
 * bundle registers in the Plugins tab can edit them live. The update cycle
 * itself lives in `./lib/plan.js`, which stays testable without the app.
 */

import { isVolatile } from "@deepseek-ai/cosmokit"
import z from "@deepseek-ai/schemastery"

import { DEFAULTS, createUpdater, resolveSettings } from "./lib/plan.js"

export * from "./lib/plan.js"

/** Settings the plugin page edits; every field is volatile, so edits apply live. */
export const Config = z.object({
  enabled: z.boolean().default(false).volatile(),
  packages: z.array(z.string()).default(["*"]).volatile(),
  allowMajor: z.boolean().default(false).volatile(),
  allowPrerelease: z.boolean().default(false).volatile(),
  dryRun: z.boolean().default(false).volatile(),
  intervalHours: z.number().default(6).volatile(),
  initialDelayMinutes: z.number().default(5).volatile(),
  maxUpdatesPerRun: z.number().default(5).volatile(),
  registry: z.string().default("https://registry.npmjs.org").volatile(),
  timeoutMs: z.number().default(20000).volatile(),
  notify: z.boolean().default(true).volatile(),
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
   * A volatile field is a reference the loader keeps current, not the value
   * itself; read through it so a settings-page edit is visible here at once.
   */
  const pluck = (config, key) => {
    const value = config?.[key]
    return isVolatile(value) ? value.get() : value
  }
  const settingsOf = () => resolveSettings(
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
