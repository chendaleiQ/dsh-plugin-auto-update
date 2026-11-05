/**
 * Browser-half wiring test.
 *
 * The module is loaded the way the client module loader loads plugins, with a
 * stubbed React and a fake plugin context, so the test sees which slot the
 * section registers into without rendering anything.
 */

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import vm from "node:vm"

const SOURCE = await readFile(join(import.meta.dirname, "..", "lib", "client.js"), "utf8")

/** Run the module against the stubs and return what it registered. */
function load() {
  const registered = []
  let module
  const require = (name) => {
    if (name === "react") {
      return {
        useSyncExternalStore: () => ({}),
        useState: () => [{ status: "ready", bundles: [] }, () => {}],
        useEffect: () => {},
        useRef: () => ({ current: undefined }),
      }
    }
    if (name === "react/jsx-runtime") {
      return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
    }
    if (name === "@deepseek-ai/dsh-client-ui-primitives") {
      return { Switch: () => null }
    }
    throw new Error(`unexpected require: ${name}`)
  }
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load: (definition) => {
          module = definition.factory(require)
        },
      },
    },
    document: {
      documentElement: { lang: "zh-CN" },
      querySelector: () => null,
      createElement: () => ({ dataset: {}, remove() {} }),
      head: { appendChild: () => {} },
    },
    navigator: { language: "zh-CN" },
    URL,
    console,
  }
  vm.runInNewContext(SOURCE, sandbox, { filename: "client.js" })

  const disposers = []
  const form = {
    getSnapshot: () => ({ status: "ready", writable: true, value: { enabled: false } }),
    subscribe: () => () => {},
    set: async () => true,
    dispose: async () => {},
  }
  const locale = {
    register: () => () => {},
    bind: () => (key, params) => (params === undefined ? key : `${key}:${JSON.stringify(params)}`),
    subscribe: () => () => {},
    getSnapshot: () => ({ revision: 1, active: "zh-CN" }),
  }
  const ctx = {
    locale,
    effect: (factory) => {
      const dispose = factory()
      if (typeof dispose === "function") disposers.push(dispose)
      return () => {}
    },
    configForms: { get: () => form },
    remote: { pluginManager: { listBundles: async () => [] } },
    slots: {
      inject: (name, register) => {
        register()
        return () => {}
      },
      register: (options, component) => {
        registered.push({ options, component })
        return () => {}
      },
    },
  }
  module.apply(ctx)
  return { registered, module, disposers, form }
}

test("both sections register on the plugin detail page", () => {
  const { registered, module } = load()
  assert.deepEqual(Array.from(module.inject), ["slots", "locale", "configForms", "remote", "remote.pluginManager", "remote.settings"])
  assert.deepEqual(registered.map((entry) => entry.options.id), ["auto-update", "auto-update-history"])
  assert.deepEqual(registered.map((entry) => entry.options.order), [40, 50])
  for (const entry of registered) {
    assert.equal(entry.options.name, "plugins.detail.section")
    assert.equal(typeof entry.component, "function")
  }
})

test("loading twice does not throw on a missing document body", () => {
  assert.doesNotThrow(() => load())
})

test("a remote answer is unwrapped, and a refusal keeps its reason", () => {
  const { module } = load()
  const { listFromResponse, installedBundles } = module.internals
  const rows = [{ name: "plug", version: "1.0.0", availability: "profile", installed: true, source: "^1.0.0" }]
  assert.deepEqual(installedBundles(listFromResponse({ ok: true, value: rows })).map((item) => item.name), ["plug"])
  assert.throws(() => listFromResponse({ ok: false, error: { code: "unavailable" } }), /unavailable/)
  assert.throws(() => listFromResponse(undefined), /refused/)
  assert.deepEqual(installedBundles(listFromResponse({ ok: true, value: [] })), [])
})

test("a bundle is labelled with why it cannot update", () => {
  const { module } = load()
  const { installedBundles } = module.internals
  const labelled = installedBundles([
    { name: "a", version: "1.0.0", availability: "profile", installed: true, source: "^1.0.0" },
    { name: "b", version: "1.0.0", availability: "profile", installed: true, source: "link:../b" },
    { name: "c", version: "1.0.0", availability: "profile", installed: true, source: "1.0.0" },
    { name: "d", version: "1.0.0", availability: "installation", installed: false },
  ])
  assert.deepEqual(labelled.map((item) => [item.name, item.blocked]), [["a", null], ["b", "local"], ["c", "pinned"]])
})

test("the history route resolves against the page, then the origin", () => {
  const { module } = load()
  const { historyUrls } = module.internals
  assert.deepEqual(Array.from(historyUrls("http://127.0.0.1:60098/", undefined)), [
    "http://127.0.0.1:60098/dsh-plugin-auto-update/history",
  ])
  assert.deepEqual(Array.from(historyUrls("http://127.0.0.1:60098/", "http://127.0.0.1:60098")), [
    "http://127.0.0.1:60098/dsh-plugin-auto-update/history",
  ])
  assert.deepEqual(Array.from(historyUrls("dsh-app://app/", "http://127.0.0.1:60098")), [
    "dsh-app://app/dsh-plugin-auto-update/history",
    "http://127.0.0.1:60098/dsh-plugin-auto-update/history",
  ])
  assert.deepEqual(Array.from(historyUrls(undefined, undefined)), [])
})

test("history rows are newest first, filtered and capped", () => {
  const { module } = load()
  const { historyRows, isHistoryRecord } = module.internals
  const record = (name, at, action = "updated") => ({ at, name, from: "1.0.0", to: "1.1.0", action })
  const records = [record("a", "2026-11-01T00:00:00.000Z"), record("b", "2026-11-02T00:00:00.000Z"), { name: "broken" }]
  assert.deepEqual(Array.from(historyRows(records, 10), (item) => item.name), ["b", "a"])
  assert.deepEqual(Array.from(historyRows(records, 1), (item) => item.name), ["b"])
  assert.deepEqual(Array.from(historyRows([], 10)), [])
  assert.equal(isHistoryRecord(record("c", "2026-11-03T00:00:00.000Z")), true)
  assert.equal(isHistoryRecord({ ...record("d", "2026-11-03T00:00:00.000Z"), action: "current" }), false)
  assert.equal(isHistoryRecord({ name: "e", from: "1.0.0", to: "1.1.0", action: "updated" }), false)
})

test("a record is labelled by action and toned by outcome", () => {
  const { module } = load()
  const { actionLabelKey, actionTone } = module.internals
  assert.equal(actionLabelKey("updated"), "actionUpdated")
  assert.equal(actionLabelKey("failed"), "actionFailed")
  assert.equal(actionLabelKey("would-update"), "actionWouldUpdate")
  assert.equal(actionTone("updated"), "success")
  assert.equal(actionTone("failed"), "danger")
  assert.equal(actionTone("would-update"), "neutral")
})

test("stored times render, and an unparseable one is kept as text", () => {
  const { module } = load()
  const { formatRecordTime } = module.internals
  assert.match(formatRecordTime("2026-11-05T01:02:00.000Z", "en-US"), /2026/)
  assert.equal(formatRecordTime("not-a-time", "en-US"), "not-a-time")
})

test("the history reader tries every candidate URL", async () => {
  const { module } = load()
  const { readRemoteHistory, clearRemoteHistory } = module.internals
  const seen = []
  const fetchImpl = async (url, init) => {
    seen.push([url, init.method])
    if (url.startsWith("dsh-app:")) return { ok: false, status: 404 }
    if (init.method === "DELETE") return { ok: true, json: async () => ({ ok: true, cleared: 3 }) }
    return {
      ok: true,
      json: async () => ({ ok: true, records: [{ at: "2026-11-05T00:00:00.000Z", name: "a", from: "1.0.0", to: "1.1.0", action: "updated" }], historyPath: "/tmp/history.json" }),
    }
  }
  const read = await readRemoteHistory({ fetchImpl, base: "dsh-app://app/", origin: "http://127.0.0.1:60098" })
  assert.deepEqual(Array.from(read.records, (item) => item.name), ["a"])
  assert.equal(read.historyPath, "/tmp/history.json")
  assert.deepEqual(seen.map(([url]) => url), [
    "dsh-app://app/dsh-plugin-auto-update/history",
    "http://127.0.0.1:60098/dsh-plugin-auto-update/history",
  ])
  assert.equal(await clearRemoteHistory({ fetchImpl, base: "http://127.0.0.1:60098/", origin: undefined }), 3)
})

test("a refused history answer keeps its reason", async () => {
  const { module } = load()
  const { readRemoteHistory } = module.internals
  await assert.rejects(
    readRemoteHistory({ fetchImpl: async () => ({ ok: true, json: async () => ({ ok: false, error: "method not allowed" }) }), base: "http://h/" }),
    /method not allowed/,
  )
  await assert.rejects(
    readRemoteHistory({ fetchImpl: async () => ({ ok: false, status: 404 }), base: "http://h/" }),
    /404/,
  )
  await assert.rejects(readRemoteHistory({ fetchImpl: async () => ({ ok: true, json: async () => ({}) }), base: undefined, origin: undefined }), /no page base/)
})

test("a shell carrier is asked first, with the document-relative path", async () => {
  const { module } = load()
  const { readRemoteHistory } = module.internals
  const calls = []
  const transport = {
    fetch: async (url, init) => {
      calls.push([url, init.method])
      return { ok: true, json: async () => ({ ok: true, records: [], historyPath: "/tmp/history.json" }) }
    },
  }
  const value = await readRemoteHistory({
    transport,
    fetchImpl: async () => {
      throw new Error("the page fetch should not be reached")
    },
    base: "http://127.0.0.1:60098/",
  })
  assert.deepEqual(Array.from(value.records), [])
  assert.equal(value.historyPath, "/tmp/history.json")
  assert.deepEqual(calls, [["dsh-plugin-auto-update/history", "GET"]])
})

test("a failing shell carrier falls through to the page fetch", async () => {
  const { module } = load()
  const { readRemoteHistory } = module.internals
  const seen = []
  const transport = {
    fetch: async (url) => {
      seen.push(url)
      return { ok: false, status: 404 }
    },
  }
  const value = await readRemoteHistory({
    transport,
    base: "http://127.0.0.1:60098/",
    fetchImpl: async (url) => {
      seen.push(url)
      return { ok: true, json: async () => ({ ok: true, records: [], historyPath: "" }) }
    },
  })
  assert.deepEqual(Array.from(value.records), [])
  assert.deepEqual(seen, [
    "dsh-plugin-auto-update/history",
    "http://127.0.0.1:60098/dsh-plugin-auto-update/history",
  ])
})
