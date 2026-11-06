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
  appendHistory,
  clearHistory,
  compareVersions,
  createUpdater,
  historyRecordOf,
  historyRecordsOf,
  isFloatingSpec,
  newestVersion,
  normalizeHistoryLimit,
  parseVersion,
  readHistoryDocument,
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
  const historyPath = join(directory, "history.json")
  const settings = resolveSettings({
    enabled: true,
    packages: ["*"],
    dryRun: false,
    ...options.settings,
    logPath,
    historyPath,
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
    cooldownMs: 0,
  })
  return { updater, calls, logPath, historyPath, settings }
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

test("defaults are on and cover every field", () => {
  const settings = resolveSettings({})
  assert.equal(settings.enabled, true)
  assert.deepEqual(settings.packages, ["*"])
  assert.equal(settings.allowMajor, false)
  assert.equal(settings.allowPrerelease, false)
  assert.equal(settings.intervalHours, 6)
  assert.equal(settings.initialDelayMinutes, 1)
  assert.equal(settings.maxUpdatesPerRun, 5)
  assert.equal(settings.dryRun, false)
  assert.match(settings.logPath, /plugin-auto-update\.log$/)
})

test("defaults name a history file and a record limit", () => {
  const settings = resolveSettings({})
  assert.match(settings.historyPath, /plugin-auto-update-history\.json$/)
  assert.equal(settings.historyLimit, 200)
  assert.equal(normalizeHistoryLimit(0), 1)
  assert.equal(normalizeHistoryLimit(12345), 2000)
  assert.equal(normalizeHistoryLimit("many"), 200)
})

test("only decisions about a version become records", () => {
  const at = "2026-11-05T01:00:00.000Z"
  assert.deepEqual(
    historyRecordOf({ name: "plug", installed: "1.0.0", latest: "1.1.0", action: "updated", application: "applied" }, at),
    { at, name: "plug", from: "1.0.0", to: "1.1.0", action: "updated", application: "applied" },
  )
  assert.equal(historyRecordOf({ name: "plug", installed: "1.0.0", latest: "1.0.0", action: "current" }, at), null)
  assert.equal(historyRecordOf({ name: "plug", action: "error", reason: "fetch failed" }, at), null)
  assert.deepEqual(
    historyRecordsOf(
      [
        { name: "a", installed: "1.0.0", latest: "1.0.0", action: "current" },
        { name: "b", installed: "1.0.0", latest: "1.2.0", action: "failed", reason: "network", rolledBack: true },
      ],
      at,
    ).map((record) => [record.name, record.action, record.rolledBack]),
    [["b", "failed", true]],
  )
})

test("an update lands in the history the panel reads", async () => {
  const { updater, historyPath } = await harness()
  await updater.runOnce()
  const document = await readHistoryDocument(historyPath)
  assert.equal(document.records.length, 1)
  assert.deepEqual(
    [document.records[0].name, document.records[0].from, document.records[0].to, document.records[0].action],
    ["plug", "1.0.0", "1.2.0", "updated"],
  )
  const read = await updater.readHistory()
  assert.equal(read.records.length, 1)
  assert.equal(read.historyPath, historyPath)
})

test("a dry run records the preview, once", async () => {
  const { updater, historyPath } = await harness({ settings: { dryRun: true } })
  await updater.runOnce()
  await updater.runOnce()
  const document = await readHistoryDocument(historyPath)
  assert.deepEqual(document.records.map((record) => record.action), ["would-update"])
})

test("a failed update records the rollback", async () => {
  const { updater, historyPath } = await harness({ failInstall: true })
  await updater.runOnce()
  const document = await readHistoryDocument(historyPath)
  assert.equal(document.records.length, 1)
  assert.equal(document.records[0].action, "failed")
  assert.equal(document.records[0].rolledBack, true)
  assert.match(document.records[0].reason, /install failed/)
})

test("a cycle that changes nothing leaves the history alone", async () => {
  const { updater, historyPath } = await harness({
    bundles: [{ name: "plug", version: "1.2.0", availability: "profile", installed: true, source: "^1.2.0" }],
    fetchImpl: async () => ({ ok: true, json: async () => ({ version: "1.2.0" }) }),
  })
  await updater.runOnce()
  assert.deepEqual((await readHistoryDocument(historyPath)).records, [])
})

test("the history keeps the newest records under the cap", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dsh-auto-update-history-"))
  const path = join(directory, "history.json")
  const record = (name, from, to) => historyRecordOf({ name, installed: from, latest: to, action: "updated" }, "2026-11-05T00:00:00.000Z")
  await appendHistory(path, [record("a", "1.0.0", "1.0.1")], { limit: 2 })
  await appendHistory(path, [record("b", "1.0.0", "1.0.1")], { limit: 2 })
  await appendHistory(path, [record("c", "1.0.0", "1.0.1")], { limit: 2 })
  const document = await readHistoryDocument(path)
  assert.deepEqual(document.records.map((item) => item.name), ["b", "c"])
})

test("the same outcome stored twice is folded", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dsh-auto-update-history-"))
  const path = join(directory, "history.json")
  const record = historyRecordOf({ name: "a", installed: "1.0.0", latest: "1.0.1", action: "failed", reason: "network" }, "2026-11-05T00:00:00.000Z")
  assert.equal(await appendHistory(path, [record], { limit: 10 }), 1)
  assert.equal(await appendHistory(path, [record], { limit: 10 }), 0)
  assert.equal((await readHistoryDocument(path)).records.length, 1)
  const moved = { ...record, from: "1.0.1", to: "1.0.2" }
  assert.equal(await appendHistory(path, [moved], { limit: 10 }), 1)
  assert.equal((await readHistoryDocument(path)).records.length, 2)
})

test("a corrupt history file reads as empty and is replaced on the next write", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dsh-auto-update-history-"))
  const path = join(directory, "history.json")
  await writeFile(path, "{not json", "utf8")
  assert.deepEqual((await readHistoryDocument(path)).records, [])
  const record = historyRecordOf({ name: "a", installed: "1.0.0", latest: "1.0.1", action: "updated" }, "2026-11-05T00:00:00.000Z")
  assert.equal(await appendHistory(path, [record], { limit: 10 }), 1)
  assert.deepEqual((await readHistoryDocument(path)).records.map((item) => item.name), ["a"])
})

test("clearing removes the stored records", async () => {
  const { updater, historyPath } = await harness()
  await updater.runOnce()
  assert.equal(await updater.clearHistory(), 1)
  assert.deepEqual((await readHistoryDocument(historyPath)).records, [])
  assert.equal(await clearHistory(join(historyPath, "..", "missing.json")), 0)
})

test("a failure that now says something else is news, not a repeat", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dsh-auto-update-history-"))
  const path = join(directory, "history.json")
  const at = "2026-11-05T00:00:00.000Z"
  const first = historyRecordOf({ name: "a", installed: "1.0.0", latest: "1.1.0", action: "failed", reason: "network" }, at)
  const second = historyRecordOf({ name: "a", installed: "1.0.0", latest: "1.1.0", action: "failed", reason: "registry answered 500" }, at)
  assert.equal(await appendHistory(path, [first], { limit: 10 }), 1)
  assert.equal(await appendHistory(path, [second], { limit: 10 }), 1)
  const document = await readHistoryDocument(path)
  assert.deepEqual(document.records.map((record) => record.reason), ["network", "registry answered 500"])
})

test("the cap can swallow this call's own records, and the count says so", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dsh-auto-update-history-"))
  const path = join(directory, "history.json")
  const at = "2026-11-05T00:00:00.000Z"
  const records = ["a", "b", "c"].map((name) => historyRecordOf({ name, installed: "1.0.0", latest: "1.1.0", action: "updated" }, at))
  assert.equal(await appendHistory(path, records, { limit: 2 }), 2)
  assert.deepEqual((await readHistoryDocument(path)).records.map((record) => record.name), ["b", "c"])
})

test("a clear and an append that overlap leave a readable document, not a resurrection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dsh-auto-update-history-"))
  const path = join(directory, "history.json")
  const at = "2026-11-05T00:00:00.000Z"
  const first = historyRecordOf({ name: "a", installed: "1.0.0", latest: "1.1.0", action: "updated" }, at)
  const second = historyRecordOf({ name: "b", installed: "1.0.0", latest: "1.1.0", action: "updated" }, at)
  await appendHistory(path, [first], { limit: 10 })
  const [appended, cleared] = await Promise.all([
    appendHistory(path, [second], { limit: 10 }),
    clearHistory(path),
  ])
  assert.equal(appended, 1)
  // The append ran first, so the clear removed both records it could see.
  assert.equal(cleared, 2)
  assert.deepEqual((await readHistoryDocument(path)).records, [])
  assert.equal(await appendHistory(path, [second], { limit: 10 }), 1)
  assert.deepEqual((await readHistoryDocument(path)).records.map((record) => record.name), ["b"])
})

test("clearing an empty history drops the file and reports nothing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dsh-auto-update-history-"))
  const path = join(directory, "history.json")
  assert.equal(await clearHistory(path), 0)
  await appendHistory(path, [historyRecordOf({ name: "a", installed: "1.0.0", latest: "1.1.0", action: "updated" }, "2026-11-05T00:00:00.000Z")], { limit: 5 })
  assert.equal(await clearHistory(path), 1)
  assert.equal(await clearHistory(path), 0)
})

test("a generic refusal keeps the manager's own diagnostic", async () => {
  // A manager whose removal is refused the way the plugin manager refuses one
  // it cannot explain: code `operation-error` plus the text that says why.
  const refusing = createUpdater({
    readSettings: () => resolveSettings({ enabled: true, packages: ["*"], historyPath: join(tmpdir(), "unused-history.json"), logPath: join(tmpdir(), "unused.log") }),
    logPath: join(tmpdir(), "unused.log"),
    cooldownMs: 0,
    fetchImpl: async () => ({ ok: true, json: async () => ({ version: "1.2.0" }) }),
    manager: () => ({
      async listBundles() {
        return [{ name: "plug", version: "1.0.0", availability: "profile", installed: true, source: "^1.0.0" }]
      },
      async removeBundle() {
        return { application: "failed", error: { code: "operation-error", diagnostic: "ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/x: Not Found" } }
      },
      async installBundle() {
        throw new Error("install must not run when the removal failed")
      },
    }),
  })
  const result = await refusing.runOnce()
  assert.equal(result.decisions[0].action, "failed")
  assert.match(result.decisions[0].reason, /operation-error/)
  assert.match(result.decisions[0].reason, /ERR_PNPM_FETCH_404/)
})
