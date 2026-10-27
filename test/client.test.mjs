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

test("the section registers on the plugin detail page", () => {
  const { registered, module } = load()
  assert.deepEqual(Array.from(module.inject), ["slots", "locale", "configForms", "remote", "remote.pluginManager"])
  assert.equal(registered.length, 1)
  assert.equal(registered[0].options.name, "plugins.detail.section")
  assert.equal(registered[0].options.id, "auto-update")
  assert.equal(registered[0].options.order, 40)
  assert.equal(typeof registered[0].component, "function")
})

test("loading twice does not throw on a missing document body", () => {
  assert.doesNotThrow(() => load())
})
