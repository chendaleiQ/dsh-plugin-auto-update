/**
 * dsh-plugin-auto-update — browser half.
 *
 * Registers one section on this bundle's page in the Plugins tab: a switch that
 * turns automatic updates on, and checkbox lists for what may update and how
 * far. Everything it shows and writes goes through the settings service
 * (`configForms`), which persists the change in the profile Cordis patch and
 * applies it to the running host plugin; the installed-bundle list comes from
 * the plugin manager's own remote namespace.
 */

window.__ModuleLoader__.load({
  id: "dsh-plugin-auto-update",
  factory: (require) => {
    const React = require("react")
    const { jsx, jsxs } = require("react/jsx-runtime")
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives")

    /** Dictionary namespace for this page. */
    const NS = "auto-update"
    /** Settings namespace: the host row id this plugin's patch inserts. */
    const NAMESPACE = "auto-update"
    /** Package this section belongs to; other subjects render nothing. */
    const BUNDLE = "dsh-plugin-auto-update"
    /** Required services. */
    const inject = ["slots", "locale", "configForms", "remote", "remote.pluginManager", "remote.settings"]

    const CSS_ID = "dsh-plugin-auto-update/section.css"
    const CSS = `
.dshAutoUpdate{display:flex;flex-direction:column;gap:12px}
.dshAutoUpdateTitle{margin:0;font-size:14px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}
.dshAutoUpdateHint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dshAutoUpdateRow{display:flex;align-items:center;justify-content:space-between;gap:16px}
.dshAutoUpdateLabel{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.dshAutoUpdateSub{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dshAutoUpdateGroup{display:flex;flex-direction:column;gap:8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);padding:10px 12px}
.dshAutoUpdateGroupTitle{margin:0;font-size:12px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dshAutoUpdateList{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.dshAutoUpdateItem{display:flex;align-items:center;gap:8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.dshAutoUpdateItem input{accent-color:var(--dsw-alias-brand-primary);width:14px;height:14px;margin:0;flex:none}
.dshAutoUpdateName{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;overflow-wrap:anywhere}
.dshAutoUpdateVersion{color:var(--dsw-alias-label-tertiary);font-size:12px;margin-left:auto;flex:none}
.dshAutoUpdateEmpty{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
`

    /** Dictionaries registered with the app's own locale service. */
    const DICTS = {
      zh: {
        title: "自动更新",
        intro: "让选中的插件自动保持最新版本。更新由插件管理器完成，失败会回滚到原版本。",
        enabled: "启用自动更新",
        enabledHint: "关闭时插件什么都不做",
        interval: "每 {n} 小时检查一次",
        packages: "自动更新的插件",
        all: "全部可更新的插件",
        emptyAll: "还没有从注册表安装的插件。",
        emptyNone: "已安装的插件都是本地安装或锁定版本，不参与自动更新。",
        reasonLocal: "本地安装",
        reasonPinned: "锁定版本",
        reasonError: "存在错误",
        summary: "共 {n} 个插件 · {m} 个可自动更新",
        diag: "设置：{status} · 可写：{writable} · 文档：{document}",
        writeFailed: "保存失败：{reason}",
        writeSaved: "已保存",
        listFailed: "读取已安装插件列表失败，请刷新后重试。",
        loading: "读取中…",
        policies: "升级范围",
        allowMajor: "允许跨大版本",
        allowPrerelease: "允许预发布版本（rc / beta）",
        dryRun: "仅演练（只写日志，不安装）",
        readOnly: "本部署的设置为只读。",
        unavailable: "设置服务还没有提供这个插件的配置，请重启后再试。",
        stateLine: "设置状态：{status}",
      },
      en: {
        title: "Auto update",
        intro: "Keep the selected plugins on their newest release. Updates run through the plugin manager; a failed install rolls back.",
        enabled: "Enable auto update",
        enabledHint: "Nothing happens while this is off",
        interval: "Checks every {n} h",
        packages: "Plugins that may update",
        all: "Every updatable plugin",
        emptyAll: "No plugin has been installed from a registry yet.",
        emptyNone: "Every installed plugin is local or pinned, so none can update.",
        reasonLocal: "local install",
        reasonPinned: "pinned",
        reasonError: "has an error",
        summary: "{n} installed · {m} updatable",
        diag: "Settings: {status} · writable: {writable} · document: {document}",
        writeFailed: "Save failed: {reason}",
        writeSaved: "Saved",
        listFailed: "Could not read the installed plugins; refresh and try again.",
        loading: "Loading…",
        policies: "Version policy",
        allowMajor: "Allow a new major version",
        allowPrerelease: "Allow prereleases (rc / beta)",
        dryRun: "Dry run (log only, install nothing)",
        readOnly: "Settings are read-only on this deployment.",
        unavailable: "The settings service does not serve this plugin's configuration yet; restart and try again.",
        stateLine: "Settings state: {status}",
      },
    }

    /** A dependency value that names a mutable range rather than a pin or a path. */
    function isFloatingSpec(spec) {
      const text = String(spec ?? "").trim()
      if (text === "") return false
      if (/^(link|file|workspace|portal|git|github|https?):/.test(text)) return false
      if (/^\.{1,2}\//.test(text) || text.startsWith("/") || text.startsWith("~/")) return false
      if (/^(npm|jsr):/.test(text)) return true
      return !/^=?v?\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(text)
    }

    /** Why a bundle cannot take part, or null when it can. */
    function blockReason(bundle) {
      if (bundle.error !== undefined) return "error"
      const source = String(bundle.source ?? "")
      if (/^(link|file|workspace|portal)/.test(source)) return "local"
      if (!isFloatingSpec(source)) return "pinned"
      return null
    }

    /**
     * Every bundle the profile installs, each with the reason it cannot update
     * (null when it can). Local and pinned installs stay visible, so the list
     * explains itself instead of looking empty.
     */
    function installedBundles(bundles) {
      return (Array.isArray(bundles) ? bundles : []).filter((bundle) => {
        if (bundle === null || typeof bundle !== "object") return false
        if (bundle.availability !== "profile") return false
        if (bundle.installed !== true) return false
        return typeof bundle.name === "string" && typeof bundle.version === "string"
      }).map((bundle) => ({ ...bundle, blocked: blockReason(bundle) }))
        .sort((left, right) => left.name.localeCompare(right.name))
    }

    /**
     * Read one remote answer: this deployment answers `{ ok, value }`, and a
     * refusal carries `{ ok: false, error }`. Anything else is a bug worth
     * surfacing rather than an empty list.
     */
    function listFromResponse(response) {
      if (response?.ok !== true) {
        const reason = response?.error?.message ?? response?.error?.code ?? "refused"
        throw new Error(String(reason))
      }
      return Array.isArray(response.value) ? response.value : []
    }

    /** Install the section's stylesheet once per document. */
    function installStyles() {
      if (typeof document === "undefined") return () => {}
      const existing = document.querySelector(`style[data-plugin-css=${JSON.stringify(CSS_ID)}]`)
      if (existing !== null) return () => {}
      const tag = document.createElement("style")
      tag.dataset.plugin = BUNDLE
      tag.dataset.pluginCss = CSS_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => tag.remove()
    }

    /**
     * Mount the plugin page section.
     * @param ctx - the browser plugin context.
     */
    function apply(ctx) {
      const css = installStyles()
      ctx.effect(() => css, "auto-update: section styles")

      // The app's locale service owns the language; registering here keeps the
      // section in step with Settings → General rather than the window language.
      ctx.effect(() => ctx.locale.register(NS, DICTS), "auto-update: dictionaries")
      const t = ctx.locale.bind(NS)

      const form = ctx.configForms.get(NAMESPACE)

      /** Re-render when the active language — or a late dictionary — changes. */
      const useLocale = () => React.useSyncExternalStore(
        (listener) => ctx.locale.subscribe(listener),
        () => ctx.locale.getSnapshot().revision,
      )

      const useForm = () => React.useSyncExternalStore(
        (listener) => form.subscribe(listener),
        () => form.getSnapshot(),
      )

      /** The shared settings document, for diagnosing a form that never loads. */
      const mirror = ctx.configForms.describe?.()
      const useMirror = () => React.useSyncExternalStore(
        (listener) => mirror?.subscribe?.(listener) ?? (() => {}),
        () => mirror?.getSnapshot?.(),
      )

      /** The updatable bundles, read once per mount from the manager's remote. */
      const useUpdatableBundles = () => {
        const [state, setState] = React.useState({ status: "loading", bundles: [] })
        React.useEffect(() => {
          let alive = true
          const read = () => {
            Promise.resolve()
              .then(() => ctx.remote.pluginManager.listBundles())
              .then((response) => {
                if (alive) setState({ status: "ready", bundles: installedBundles(listFromResponse(response)) })
              })
              .catch((error) => {
                if (alive) setState({ status: "failed", bundles: [], error: String(error?.message ?? error) })
              })
          }
          read()
          return () => {
            alive = false
          }
        }, [])
        return state
      }

      /** One section on this bundle's page; other subjects get nothing. */
      function AutoUpdateSection({ subject }) {
        const snapshot = useForm()
        const mirrorState = useMirror()
        const [write, setWrite] = React.useState(null)
        const bundles = useUpdatableBundles()
        useLocale()
        if (subject === undefined || subject === null || subject.kind !== "bundle") return null
        if (subject.pkg?.name !== BUNDLE) return null

        const updatable = bundles.bundles.filter((bundle) => bundle.blocked === null)
        const value = snapshot?.value ?? {}
        const writable = snapshot?.writable !== false
        const unavailable = snapshot?.status === "unavailable"
        const enabled = value.enabled === true
        const packages = Array.isArray(value.packages) ? value.packages : ["*"]
        const everything = packages.includes("*")
        const selected = (name) => everything || packages.includes(name)
        /** The namespace's revision in the shared document, or undefined while it is unread. */
        const revisionOf = () => {
          const view = mirror?.getSnapshot?.()?.view
          return view?.namespaces?.find((row) => row.ns === NAMESPACE)?.revision
        }

        /**
         * Write one field through the settings remote, retrying once after a
         * refresh: a stale revision is the common failure, and the reason the
         * remote gives is worth showing instead of a bare "refused".
         */
        const persist = async (field, value) => {
          let lastError
          const ops = [{ op: "set", path: [field], value }]
          for (let attempt = 0; attempt < 2; attempt += 1) {
            const response = await ctx.remote.settings.mutate(NAMESPACE, ops, attempt === 0 ? revisionOf() : await freshRevision())
            if (response?.ok === true) {
              mirror?.acceptView?.(response.value)
              return { ok: true }
            }
            if (response?.error !== undefined) lastError = response.error
            if (attempt === 0) await mirror?.load?.()
          }
          const code = lastError?.code ?? lastError?.message ?? "refused"
          return { ok: false, reason: String(code) }
        }

        /** Reload the document and read this namespace's revision again. */
        const freshRevision = async () => {
          await mirror?.load?.()
          return revisionOf()
        }

        const set = (field, next) => {
          if (!writable) {
            setWrite({ ok: false, reason: "read-only" })
            return
          }
          Promise.resolve()
            .then(() => persist(field, next))
            .then((result) => setWrite(result))
            .catch((error) => setWrite({ ok: false, reason: String(error?.message ?? error) }))
        }
        const writePackages = (names) => set("packages", names)

        /** Checking "all" stores the wildcard; unchecking stores an empty allowlist. */
        const onAll = (checked) => writePackages(checked ? ["*"] : [])
        /** A single toggle keeps the explicit list when the wildcard was not in play. */
        const onOne = (name, checked) => {
          const base = everything ? updatable.map((item) => item.name) : packages.filter((item) => item !== "*")
          const next = checked ? [...new Set([...base, name])] : base.filter((item) => item !== name)
          writePackages(next)
        }

        return jsxs("section", {
          className: "dshAutoUpdate",
          "data-plugin-auto-update": true,
          children: [
            jsx("h4", { className: "dshAutoUpdateTitle", children: t("title") }),
            jsx("p", { className: "dshAutoUpdateHint", children: t("intro") }),
            unavailable
              ? jsx("p", { className: "dshAutoUpdateHint", children: t("unavailable") })
              : null,
            !writable ? jsx("p", { className: "dshAutoUpdateHint", children: t("readOnly") }) : null,
            jsx("p", {
              className: "dshAutoUpdateEmpty",
              "data-auto-update-diag": "1",
              children: t("diag", {
                status: String(snapshot?.status ?? "unknown"),
                writable: String(writable),
                document: String(mirrorState?.status ?? "unknown"),
              }),
            }),
            write === null
              ? null
              : jsx("p", {
                  className: "dshAutoUpdateEmpty",
                  "data-auto-update-write": write.ok ? "saved" : "failed",
                  children: write.ok ? t("writeSaved") : t("writeFailed", { reason: String(write.reason) }),
                }),
            jsx("div", { className: "dshAutoUpdateRow", children: [
              jsxs("div", { children: [
                jsx("div", { className: "dshAutoUpdateLabel", children: t("enabled") }),
                jsx("div", { className: "dshAutoUpdateSub", children: t("enabledHint") }),
              ] }),
              jsx(primitives.Switch, {
                checked: enabled,
                label: t("enabled"),
                disabled: !writable || unavailable,
                onChange: (next) => set("enabled", next === true),
              }),
            ] }),
            enabled
              ? jsxs("div", { className: "dshAutoUpdateGroup", children: [
                  jsxs("div", { className: "dshAutoUpdateRow", children: [
                    jsxs("div", { className: "dshAutoUpdateRow", children: [
                    jsx("h5", { className: "dshAutoUpdateGroupTitle", children: t("packages") }),
                    jsx("span", { className: "dshAutoUpdateSub", "data-auto-update-count": `${bundles.bundles.length}/${updatable.length}`, children: bundles.status === "ready" ? t("summary", { n: bundles.bundles.length, m: updatable.length }) : "" }),
                  ] }),
                    jsx("span", { className: "dshAutoUpdateSub", children: bundles.status === "loading" ? t("loading") : t("interval", { n: value.intervalHours ?? 6 }) }),
                  ] }),
                  bundles.status === "failed"
                    ? jsx("p", { className: "dshAutoUpdateEmpty", children: `${t("listFailed")} ${bundles.error ?? ""}`.trim() })
                    : null,
                  bundles.status === "ready" && bundles.bundles.length === 0
                    ? jsx("p", { className: "dshAutoUpdateEmpty", children: t("emptyAll") })
                    : null,
                  bundles.status === "ready" && bundles.bundles.length > 0 && updatable.length === 0
                    ? jsx("p", { className: "dshAutoUpdateEmpty", children: t("emptyNone") })
                    : null,
                  bundles.status === "ready" && bundles.bundles.length > 0
                    ? jsxs("ul", { className: "dshAutoUpdateList", children: [
                        updatable.length === 0
                          ? null
                          : jsx("li", { className: "dshAutoUpdateItem", children: [
                              jsx("input", {
                                type: "checkbox",
                                id: "dsh-auto-update-all",
                                checked: everything,
                                disabled: !writable,
                                onChange: (event) => onAll(event.target.checked === true),
                              }),
                              jsx("label", { htmlFor: "dsh-auto-update-all", children: t("all") }),
                            ] }),
                        ...bundles.bundles.map((bundle) => {
                          const id = `dsh-auto-update-${bundle.name}`
                          const reason = bundle.blocked === null
                            ? null
                            : bundle.blocked === "local"
                              ? t("reasonLocal")
                              : bundle.blocked === "pinned"
                                ? t("reasonPinned")
                                : t("reasonError")
                          return jsxs("li", { className: "dshAutoUpdateItem", children: [
                            jsx("input", {
                              type: "checkbox",
                              id,
                              checked: bundle.blocked === null && selected(bundle.name),
                              disabled: !writable || bundle.blocked !== null,
                              onChange: (event) => onOne(bundle.name, event.target.checked === true),
                            }),
                            jsx("label", { htmlFor: id, className: "dshAutoUpdateName", children: bundle.name }),
                            jsx("span", { className: "dshAutoUpdateVersion", children: reason === null ? bundle.version : `${bundle.version} · ${reason}` }),
                          ] })
                        }),
                      ] })
                    : null,
                ] })
              : null,
            jsxs("div", { className: "dshAutoUpdateGroup", children: [
              jsx("h5", { className: "dshAutoUpdateGroupTitle", children: t("policies") }),
              jsx("ul", { className: "dshAutoUpdateList", children: [
                ["allowMajor", t("allowMajor")],
                ["allowPrerelease", t("allowPrerelease")],
                ["dryRun", t("dryRun")],
              ].map(([field, label]) => {
                const id = `dsh-auto-update-${field}`
                return jsx("li", { className: "dshAutoUpdateItem", children: [
                  jsx("input", {
                    type: "checkbox",
                    id,
                    checked: value[field] === true,
                    disabled: !writable,
                    onChange: (event) => set(field, event.target.checked === true),
                  }),
                  jsx("label", { htmlFor: id, children: label }),
                ] }, field)
              }) }),
            ] }),
          ],
        })
      }

      ctx.effect(() => ctx.slots.inject("plugins.detail.section", () => ctx.slots.register({
        name: "plugins.detail.section",
        id: "auto-update",
        order: 40,
      }, AutoUpdateSection)), "auto-update: plugin page section")

      // Console handle for support: `__DSH_AUTO_UPDATE__.state()` says whether
      // the settings document is loaded and what this plugin's namespace holds.
      try {
        window.__DSH_AUTO_UPDATE__ = {
          version: "0.1.8",
          namespace: NAMESPACE,
          state: () => ({
            form: form.getSnapshot(),
            document: mirror?.getSnapshot?.(),
          }),
          set: (field, value) => form.set(field, value),
          retry: () => mirror?.load?.(),
        }
      } catch {
        /* a frozen window simply has no console handle */
      }

      ctx.effect(() => () => {
        form.dispose?.()
      }, "auto-update: form disposal")
    }

    return { inject, apply, internals: { installedBundles, listFromResponse, isFloatingSpec, blockReason } }
  },
})
