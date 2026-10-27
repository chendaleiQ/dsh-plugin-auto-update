/**
 * Tests for the auto-update host half.
 *
 * The cycle is exercised against a fake plugin manager and a fake registry, so
 * nothing here touches a real profile, network, or log under the home
 * directory.
 */

import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  acceptsUpdate,
  compareVersions,
  createUpdater,
  isFloatingSpec,
  newestVersion,
  parseVersion,
  resolveSettings,
  selectCandidates,
} from "../lib/plan.js"

test("versions parse and compare", () => {
  assert.deepEqual(parseVersion("1.2.3"), { major: 1, minor: 2, patch: 3, prerelease: "" })
  assert.deepEqual(parseVersion("v2.0.0-rc.1"), { major: 2, minor: 0, patch: 0, prerelease: "rc.1" })
  assert.equal(parseVersion("not-a-version"), null)
  assert.equal(compareVersions("1.2.3", "1.2.4"), -1)
  assert.equal(compareVersions("1.10.0", "1.9.9"), 1)
  assert.equal(compareVersions("2.0.0-rc.1", "2.0.0"), -1)
  assert.equal(compareVersions("2.0.0-rc.2", "2.0.0-rc.10"), -1)
  assert.equal(compareVersions("2.0.0", "2.0.0"), 0)
})

test("only accepted updates are offered", () => {
  assert.equal(acceptsUpdate("1.2.3", "1.2.4"), true)
  assert.equal(acceptsUpdate("1.2.3", "1.3.0"), true)
  assert.equal(acceptsUpdate("1.2.3", "1.2.3"), false)
  assert.equal(acceptsUpdate("1.2.3", "2.0.0"), false)
  assert.equal(acceptsUpdate("1.2.3", "2.0.0", { allowMajor: true }), true)
  assert.equal(acceptsUpdate("1.2.3", "1.3.0-rc.1"), false)
  assert.equal(acceptsUpdate("1.2.3", "1.3.0-rc.1", { allowPrerelease: true }), true)
})

test("pinned dependencies stay pinned", () => {
  assert.equal(isFloatingSpec("^1.2.3"), true)
  assert.equal(isFloatingSpec("~1.2.3"), true)
  assert.equal(isFloatingSpec("*"), true)
  assert.equal(isFloatingSpec("latest"), true)
  assert.equal(isFloatingSpec("1.2.3"), false)
  assert.equal(isFloatingSpec("=1.2.3"), false)
  assert.equal(isFloatingSpec("link:../local"), false)
  assert.equal(isFloatingSpec("file:../local"), false)
  assert.equal(isFloatingSpec("workspace:*"), false)
  assert.equal(isFloatingSpec(""), false)
})

test("candidates honour availability, error state and the allowlist", () => {
  const bundles = [
    { name: "a", version: "1.0.0", availability: "profile", installed: true, source: "^1.0.0" },
    { name: "b", version: "1.0.0", availability: "installation", installed: false },
    { name: "c", version: "1.0.0", availability: "profile", installed: true, error: { code: "not-bundle" } },
    { name: "d", version: "1.0.0", availability: "profile", installed: true, source: "link:../d" },
    { name: "e", version: "1.0.0", availability: "profile", installed: true, source: "1.0.0" },
  ]
  assert.deepEqual(selectCandidates(bundles, ["*"]).map((item) => item.name), ["a"])
  assert.deepEqual(selectCandidates(bundles, ["d", "e"]).map((item) => item.name), [])
  assert.deepEqual(
    selectCandidates(
      [...bundles, { name: "d", version: "1.0.0", availability: "profile", installed: true, source: "^1.0.0" }],
      ["d"],
    ).map((item) => item.name),
    ["d"],
  )
})

test("settings merge over the defaults and reject wrong types", () => {
  const resolved = resolveSettings({ enabled: true, packages: ["x"], intervalHours: "nope", dryRun: 1 })
  assert.equal(resolved.enabled, true)
  assert.deepEqual(resolved.packages, ["x"])
  assert.equal(resolved.intervalHours, 6)
  assert.equal(resolved.dryRun, false)
})

test("the registry lookup reports versions and failures", async () => {
  const ok = await newestVersion("https://example.test", "pkg", {
    fetchImpl: async (url) => {
      assert.equal(url, "https://example.test/pkg/latest")
      return { ok: true, json: async () => ({ version: "2.1.0" }) }
    },
  })
  assert.deepEqual(ok, { version: "2.1.0" })

  const scoped = await newestVersion("https://example.test/", "@scope/pkg", {
    fetchImpl: async (url) => {
      assert.equal(url, "https://example.test/@scope%2Fpkg/latest")
      return { ok: true, json: async () => ({ version: "3.0.0" }) }
    },
  })
  assert.deepEqual(scoped, { version: "3.0.0" })

  const missing = await newestVersion("https://example.test", "pkg", {
    fetchImpl: async () => ({ ok: false, status: 404 }),
  })
  assert.match(missing.error, /404/)

  const broken = await newestVersion("https://example.test", "pkg", {
    fetchImpl: async () => {
      throw new Error("socket closed")
    },
  })
  assert.match(broken.error, /socket closed/)
})

/** A config object plus a manager that records what happened to it. */
async function harness(options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "dsh-auto-update-"))
  const logPath = join(directory, "log.jsonl")
  const settings = resolveSettings({
    enabled: true,
    packages: ["*"],
    dryRun: false,
    notify: false,
    ...options.settings,
  })
  const calls = []
  const manager = {
    async listBundles() {
      return options.bundles ?? [
        { name: "plug", version: "1.0.0", availability: "profile", installed: true, source: "^1.0.0" },
      ]
    },
    async removeBundle(name) {
      calls.push(["remove", name])
      return { application: "applied", changed: true }
    },
    async installBundle(spec, installOptions) {
      calls.push(["install", spec, installOptions])
      if (options.failInstall === true) return { application: "failed", error: { code: "network" } }
      return { application: "applied", changed: true }
    },
  }
  const fetchImpl = options.fetchImpl ?? (async (url) => {
    if (url.includes("/plug/latest")) return { ok: true, json: async () => ({ version: "1.2.0" }) }
    return { ok: true, json: async () => ({ version: "1.0.0" }) }
  })
  const updater = createUpdater({
    readSettings: () => settings,
    logPath,
    manager: options.manager === null ? undefined : () => manager,
    fetchImpl,
    announce: false,
    cooldownMs: 0,
  })
  return { updater, calls, logPath, settings }
}

test("a disabled cycle touches nothing", async () => {
  const { updater, calls } = await harness({ settings: { enabled: false } })
  const result = await updater.runOnce()
  assert.equal(result.skipped, "disabled")
  assert.deepEqual(calls, [])
})

test("a dry run reports without changing anything", async () => {
  const { updater, calls } = await harness({ settings: { dryRun: true } })
  const result = await updater.runOnce()
  assert.deepEqual(calls, [])
  assert.equal(result.decisions[0].action, "would-update")
  assert.equal(result.decisions[0].latest, "1.2.0")
})

test("an enabled cycle updates through the manager", async () => {
  const { updater, calls, logPath } = await harness()
  const result = await updater.runOnce()
  assert.equal(result.updated, 1)
  assert.deepEqual(calls, [
    ["remove", "plug"],
    ["install", "plug@1.2.0", { enabled: true }],
  ])
  const logged = (await readFile(logPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line))
  const cycle = logged.find((entry) => entry.kind === "cycle")
  assert.equal(cycle.decisions[0].action, "updated")
})

test("a failed install puts the previous version back", async () => {
  const { updater, calls } = await harness({ failInstall: true })
  const result = await updater.runOnce()
  assert.equal(result.updated, 0)
  assert.deepEqual(calls, [
    ["remove", "plug"],
    ["install", "plug@1.2.0", { enabled: true }],
    ["install", "plug@1.0.0", { enabled: true }],
  ])
  assert.equal(result.decisions[0].action, "failed")
  assert.equal(result.decisions[0].rolledBack, true)
})

test("without a plugin manager the cycle is skipped", async () => {
  const { updater } = await harness({ manager: null })
  const result = await updater.runOnce()
  assert.equal(result.skipped, "no-plugin-manager")
})

test("defaults keep the plugin off and cover every field", () => {
  const settings = resolveSettings({})
  assert.equal(settings.enabled, false)
  assert.deepEqual(settings.packages, ["*"])
  assert.equal(settings.allowMajor, false)
  assert.equal(settings.allowPrerelease, false)
  assert.equal(settings.intervalHours, 6)
  assert.equal(settings.initialDelayMinutes, 5)
  assert.equal(settings.maxUpdatesPerRun, 5)
  assert.equal(settings.dryRun, false)
  assert.equal(settings.notify, true)
  assert.match(settings.logPath, /plugin-auto-update\.log$/)
})
