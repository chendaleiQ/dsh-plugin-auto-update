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
  id: "@chendaleiq/dsh-plugin-auto-update",
  factory: (require) => {
    const React = require("react")
    const { jsx, jsxs } = require("react/jsx-runtime")

    /** Dictionary namespace for this page. */
    const NS = "auto-update"
    /** Settings namespace: the host row id this plugin's patch inserts. */
    const NAMESPACE = "auto-update"
    /** Package this section belongs to; other subjects render nothing. */
    const BUNDLE = "@chendaleiq/dsh-plugin-auto-update"
    /** Required services. */
    const inject = ["slots", "locale", "configForms", "remote", "remote.pluginManager", "remote.settings"]

    const CSS_ID = "dsh-plugin-auto-update/section.css"
    const CSS = `
.dshAutoUpdate{display:flex;flex-direction:column;gap:10px}
.dshAutoUpdateTitle{margin:0;font-size:14px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}
.dshAutoUpdateHint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dshAutoUpdateRow{display:flex;align-items:center;justify-content:space-between;gap:16px}
.dshAutoUpdateLabel{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.dshAutoUpdateSub{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dshAutoUpdateGroup{display:flex;flex-direction:column;gap:8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);padding:9px 12px}
.dshAutoUpdateGroupTitle{margin:0;font-size:12px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dshAutoUpdateList{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.dshAutoUpdatePolicies{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0;padding:0;list-style:none}
.dshAutoUpdateItem{display:flex;align-items:center;gap:8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.dshAutoUpdateItem input{accent-color:var(--dsw-alias-brand-primary);width:14px;height:14px;margin:0;flex:none}
.dshAutoUpdateName{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;overflow-wrap:anywhere}
.dshAutoUpdateVersion{color:var(--dsw-alias-label-tertiary);font-size:12px;margin-left:auto;flex:none}
.dshAutoUpdateEnd{display:flex;align-items:center;gap:10px}
.dshAutoUpdateEmpty{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dshAutoUpdateHistory{display:flex;flex-direction:column;gap:8px}
.dshAutoUpdateRecords{display:flex;flex-direction:column;gap:0;margin:0;padding:0;list-style:none;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);overflow:hidden}
.dshAutoUpdateRecord{display:flex;align-items:baseline;gap:10px;padding:7px 12px;font-size:12px;line-height:18px}
.dshAutoUpdateRecord+.dshAutoUpdateRecord{border-top:.5px solid var(--dsw-alias-border-l2)}
.dshAutoUpdateWhen{flex:none;width:112px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dshAutoUpdateRecord .dshAutoUpdateName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshAutoUpdateArrow{flex:none;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dshAutoUpdateState{flex:none;font-size:11px;line-height:16px;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dshAutoUpdateState[data-tone="success"]{color:var(--dsw-alias-state-success-primary)}
.dshAutoUpdateState[data-tone="danger"]{color:var(--dsw-alias-state-error-primary)}
.dshAutoUpdateNote{flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dshAutoUpdateFooter{display:flex;align-items:center;justify-content:space-between;gap:12px}
.dshAutoUpdateLinks{display:flex;align-items:center;gap:12px}
.dshAutoUpdateLink{border:none;background:none;padding:0;font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dshAutoUpdateLink:hover{color:var(--dsw-alias-label-primary)}
.dshAutoUpdateLink:disabled{opacity:.5;cursor:default}
.dshAutoUpdateLink[data-intent="danger"]{color:var(--dsw-alias-state-error-primary)}
.dshAutoUpdateAction{box-sizing:border-box;min-height:26px;padding:2px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-fill-l1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.dshAutoUpdateAction:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dshAutoUpdateAction:disabled{opacity:.45;cursor:default}

`

    /** Dictionaries registered with the app's own locale service. */
    const DICTS = {
      zh: {
        title: "插件自动更新",
        intro: "让选中的插件自动保持最新版本。更新由插件管理器完成，失败会回滚到原版本。",
        packages: "自动更新的插件",
        all: "全部可更新的插件",
        emptyAll: "还没有从注册表安装的插件。",
        emptyNone: "已安装的插件都是本地安装或锁定版本，不参与自动更新。",
        reasonLocal: "本地安装",
        reasonPinned: "锁定版本",
        reasonError: "存在错误",
        summary: "共 {n} 个插件 · {m} 个可自动更新",
        writeFailed: "保存失败：{reason}",
        listFailed: "读取已安装插件列表失败，请刷新后重试。",
        loading: "读取中…",
        policies: "升级范围",
        checkNow: "立即检查",
        checking: "正在检查…",
        checked: "已检查",
        allowMajor: "允许跨大版本",
        allowPrerelease: "允许预发布版本（rc / beta）",
        dryRun: "仅演练（只写日志，不安装）",
        readOnly: "本部署的设置为只读。",
        unavailable: "设置服务还没有提供这个插件的配置，请重启后再试。",
        stateLine: "设置状态：{status}",
        historyTitle: "更新记录",
        historyIntro: "最近自动更新的结果，完整日志在 {path}。",
        historyEmpty: "还没有更新记录。下次检查发现可升级的插件时会记在这里。",
        historyLoading: "读取中…",
        historyFailed: "读取更新记录失败：{reason}",
        historyUnavailable: "这个部署没有提供更新记录接口，记录只在日志里。",
        historyRefresh: "刷新",
        historyMore: "显示更早的记录（共 {n} 条）",
        historyCount: "{n} 条记录",
        historyClear: "清空记录",
        historyClearConfirm: "确认清空",
        historyCleared: "已清空 {n} 条记录",
        historyClearFailed: "清空失败：{reason}",
        actionUpdated: "已更新",
        actionFailed: "更新失败",
        actionWouldUpdate: "可升级（演练）",
        restartRequired: "需重启生效",
        rolledBack: "已回滚，仍是原版本",
      },
      en: {
        title: "Auto update",
        intro: "Keep the selected plugins on their newest release. Updates run through the plugin manager; a failed install rolls back.",
        packages: "Plugins that may update",
        all: "Every updatable plugin",
        emptyAll: "No plugin has been installed from a registry yet.",
        emptyNone: "Every installed plugin is local or pinned, so none can update.",
        reasonLocal: "local install",
        reasonPinned: "pinned",
        reasonError: "has an error",
        summary: "{n} installed · {m} updatable",
        writeFailed: "Save failed: {reason}",
        listFailed: "Could not read the installed plugins; refresh and try again.",
        loading: "Loading…",
        policies: "Version policy",
        checkNow: "Check now",
        checking: "Checking…",
        checked: "Checked",
        allowMajor: "Allow a new major version",
        allowPrerelease: "Allow prereleases (rc / beta)",
        dryRun: "Dry run (log only, install nothing)",
        readOnly: "Settings are read-only on this deployment.",
        unavailable: "The settings service does not serve this plugin's configuration yet; restart and try again.",
        stateLine: "Settings state: {status}",
        historyTitle: "Update history",
        historyIntro: "What the automatic updates did lately; the full log is at {path}.",
        historyEmpty: "No updates recorded yet. Anything a check changes shows up here.",
        historyLoading: "Loading…",
        historyFailed: "Could not read the update history: {reason}",
        historyUnavailable: "This deployment serves no update history; the log still has every cycle.",
        historyRefresh: "Refresh",
        historyMore: "Show older records ({n} in total)",
        historyCount: "{n} records",
        historyClear: "Clear history",
        historyClearConfirm: "Confirm clearing",
        historyCleared: "Cleared {n} records",
        historyClearFailed: "Clearing failed: {reason}",
        actionUpdated: "updated",
        actionFailed: "failed",
        actionWouldUpdate: "updatable (dry run)",
        restartRequired: "restart to apply",
        rolledBack: "rolled back, still the old version",
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

    /** Document-relative route the host half answers with the history. */
    const HISTORY_ROUTE = "dsh-plugin-auto-update/history"

    /** Window event the settings panel fires when it started a check. */
    const CHECKED_EVENT = "dsh-auto-update:checked"

    /** The history actions the host stores. */
    const HISTORY_ACTIONS = ["updated", "failed", "would-update"]

    /** Whether a stored value is a record this page can show. */
    function isHistoryRecord(value) {
      return value !== null
        && typeof value === "object"
        && typeof value.at === "string"
        && typeof value.name === "string"
        && typeof value.from === "string"
        && typeof value.to === "string"
        && HISTORY_ACTIONS.includes(value.action)
    }

    /**
     * URLs worth trying for the history route, most likely first: the page's
     * own base (how every Host route is addressed in this app), then the
     * document origin, which differs when the shell serves the page from
     * another place than the web server that owns the route.
     */
    function historyUrls(base, origin) {
      const urls = []
      if (typeof base === "string" && base !== "") {
        try {
          urls.push(new URL(HISTORY_ROUTE, base).href)
        } catch {
          /* an opaque base names no route */
        }
      }
      if (typeof origin === "string" && /^https?:\/\//.test(origin)) {
        urls.push(`${origin.replace(/\/+$/, "")}/${HISTORY_ROUTE}`)
      }
      return [...new Set(urls)]
    }

    /** Where this page lives, as the route helpers need it. */
    function pageLocation() {
      const base = typeof document === "undefined" ? undefined : document.baseURI
      const origin = typeof location === "undefined" ? undefined : location.origin
      return { base, origin }
    }

    /**
     * Where a history request may go, in the order worth trying.
     *
     * A page served by the shell has a transport carrier whose `fetch` takes
     * the same document-relative paths as the app's own routes; a plain web
     * page has neither, so the route is resolved against its document base and
     * then against its origin. Trying all of them costs one failed request in
     * the cases where the first answer is wrong, and keeps the section working
     * on every carrier this app ships.
     */
    /**
     * A host function, bound to its owner before it is carried around.
     *
     * `window.fetch` refuses to run detached — calling it as a property of
     * another object is an "Illegal invocation" in every browser — and the
     * shell's carrier may make the same assumption about its `fetch`. Bind once
     * here, so a candidate can be called exactly like a plain function.
     */
    function boundMethod(owner, name) {
      const value = owner?.[name]
      return typeof value === "function" ? value.bind(owner) : undefined
    }

    function historyCandidates(options = {}) {
      const where = pageLocation()
      const transport = options.transport ?? globalThis.__DSH_TRANSPORT__
      const transportFetch = boundMethod(transport, "fetch")
      const fetchImpl = options.fetchImpl ?? boundMethod(globalThis, "fetch")
      const candidates = []
      if (transportFetch !== undefined) candidates.push({ fetch: transportFetch, url: HISTORY_ROUTE })
      if (fetchImpl !== undefined) {
        for (const url of historyUrls(options.base ?? where.base, options.origin ?? where.origin)) {
          candidates.push({ fetch: fetchImpl, url })
        }
      }
      return candidates
    }

    /** One request against every candidate until one answers a usable document. */
    async function requestHistory(method, options = {}) {
      const candidates = historyCandidates(options)
      if (candidates.length === 0) throw new Error("no page base")
      let lastError
      for (const candidate of candidates) {
        try {
          const response = await candidate.fetch(candidate.url, {
            method,
            headers: { accept: "application/json" },
            cache: "no-store",
          })
          if (response?.ok !== true) {
            lastError = new Error(`HTTP ${response?.status ?? "?"}`)
            continue
          }
          const body = await response.json()
          if (body?.ok !== true) {
            lastError = new Error(String(body?.error ?? "refused"))
            continue
          }
          return body
        } catch (error) {
          lastError = error
        }
      }
      throw lastError ?? new Error("refused")
    }

    /** Read the host's history document through the route in `index.js`. */
    async function readRemoteHistory(options = {}) {
      const body = await requestHistory("GET", options)
      return {
        records: (Array.isArray(body.records) ? body.records : []).filter(isHistoryRecord),
        historyPath: typeof body.historyPath === "string" ? body.historyPath : "",
      }
    }

    /** Delete every stored record through the same route. */
    async function clearRemoteHistory(options = {}) {
      const body = await requestHistory("DELETE", options)
      return typeof body.cleared === "number" ? body.cleared : 0
    }

    /** The records this page lists: newest first, capped unless `limit` is Infinity. */
    function historyRows(records, limit = 10) {
      const valid = (Array.isArray(records) ? records : []).filter(isHistoryRecord)
      const newestFirst = valid.slice().reverse()
      if (!Number.isFinite(limit)) return newestFirst
      return newestFirst.slice(0, Math.max(0, limit))
    }

    /** Dictionary key for one record's state. */
    function actionLabelKey(action) {
      if (action === "updated") return "actionUpdated"
      if (action === "failed") return "actionFailed"
      return "actionWouldUpdate"
    }

    /** Which theme token family the state chip uses. */
    function actionTone(action) {
      if (action === "updated") return "success"
      if (action === "failed") return "danger"
      return "neutral"
    }

    /** Local date and time for a stored ISO instant. */
    function formatRecordTime(value, localeTag) {
      const at = new Date(String(value ?? ""))
      if (Number.isNaN(at.getTime())) return String(value ?? "")
      try {
        return new Intl.DateTimeFormat(localeTag === "" ? undefined : localeTag, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(at)
      } catch {
        return at.toISOString().slice(0, 16).replace("T", " ")
      }
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

      /** The shared settings document: holds the revision a write needs. */
      const mirror = ctx.configForms.describe?.()

      /**
       * Tell the history section below that a check just started or finished.
       * The two sections are separate registrations with no shared state, so a
       * window event is the channel between them.
       */
      const announceCheck = () => {
        try {
          if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return
          window.dispatchEvent(new Event(CHECKED_EVENT))
        } catch {
          /* an announcement that cannot be made changes nothing */
        }
      }

      /** The updatable bundles, read once per mount from the manager's remote. */
      const useUpdatableBundles = (token, enabled) => {
        const [state, setState] = React.useState({ status: "loading", bundles: [] })
        React.useEffect(() => {
          if (!enabled) return undefined
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
        }, [token, enabled])
        return state
      }

      /** One section on this bundle's page; other subjects get nothing. */
      function AutoUpdateSection({ subject }) {
        const snapshot = useForm()
        const [write, setWrite] = React.useState(null)
        const [checking, setChecking] = React.useState(0)
        const [refreshToken, setRefreshToken] = React.useState(0)
        /** The two look-again timers the check button starts; cleared on unmount. */
        const timers = React.useRef([])
        // This section is injected into every bundle's page, so it keeps the
        // same hooks on all of them and only does its work for its own package.
        const ours = subject !== undefined
          && subject !== null
          && subject.kind === "bundle"
          && subject.pkg?.name === BUNDLE
        const bundles = useUpdatableBundles(refreshToken, ours)
        useLocale()
        React.useEffect(() => () => {
          for (const timer of timers.current) clearTimeout(timer)
          timers.current = []
        }, [])
        if (!ours) return null

        const updatable = bundles.bundles.filter((bundle) => bundle.blocked === null)
        const value = snapshot?.value ?? {}
        const writable = snapshot?.writable !== false
        const unavailable = snapshot?.status === "unavailable"
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
            unavailable ? jsx("p", { className: "dshAutoUpdateHint", children: t("unavailable") }) : null,
            !writable ? jsx("p", { className: "dshAutoUpdateHint", children: t("readOnly") }) : null,
            write === null || write.ok !== false
              ? null
              : jsx("p", {
                  className: "dshAutoUpdateEmpty",
                  "data-auto-update-write": "failed",
                  children: t("writeFailed", { reason: String(write.reason) }),
                }),
            jsxs("div", { className: "dshAutoUpdateGroup", children: [
              jsx("h5", { className: "dshAutoUpdateGroupTitle", children: t("policies") }),
              jsx("ul", { className: "dshAutoUpdatePolicies", children: ["allowMajor", "allowPrerelease"].map((field) => jsx("li", { className: "dshAutoUpdateItem", children: [
                jsx("input", {
                  type: "checkbox",
                  id: `dsh-auto-update-${field}`,
                  checked: value[field] === true,
                  disabled: !writable,
                  onChange: (event) => set(field, event.target.checked === true),
                }),
                jsx("label", { htmlFor: `dsh-auto-update-${field}`, children: t(field) }),
              ] }, field)) }),
            ] }),
            jsxs("div", { className: "dshAutoUpdateGroup", children: [
                  jsxs("div", { className: "dshAutoUpdateRow", children: [
                    jsx("h5", { className: "dshAutoUpdateGroupTitle", children: t("packages") }),
                    jsxs("div", { className: "dshAutoUpdateEnd", children: [
                      jsx("span", { className: "dshAutoUpdateSub", "data-auto-update-count": `${bundles.bundles.length}/${updatable.length}`, children: bundles.status === "ready" ? t("summary", { n: bundles.bundles.length, m: updatable.length }) : "" }),
                      jsx("button", {
                        type: "button",
                        className: "dshAutoUpdateAction",
                        "data-auto-update-check": true,
                        disabled: !writable || checking !== 0,
                        onClick: () => {
                          // Writing the trigger is the signal: the host runs a cycle
                          // when this row's config changes.
                          set("trigger", Date.now())
                          setChecking(1)
                          announceCheck()
                          timers.current.push(setTimeout(() => {
                            setRefreshToken((token) => token + 1)
                            setChecking(0)
                            announceCheck()
                          }, 8000))
                          timers.current.push(setTimeout(() => setRefreshToken((token) => token + 1), 1500))
                        },
                        children: checking !== 0 ? t("checking") : t("checkNow"),
                      }),
                    ] }),
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
                            ] }, "all"),
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
                          ] }, bundle.name)
                        }),
                      ] })
                    : null,
            ] }),
          ],
        })
      }

      /**
       * One section that lists what the automatic updates actually did.
       *
       * The rows come from the host's own history route: the page cannot read
       * files, and the history is not a setting, so the host answers it over
       * HTTP. A deployment without that route says so instead of looking empty.
       */
      function AutoUpdateHistorySection({ subject }) {
        useLocale()
        const locale = ctx.locale.getSnapshot()
        const [state, setState] = React.useState({ status: "loading", records: [], historyPath: "", error: "" })
        const [token, setToken] = React.useState(0)
        const [expanded, setExpanded] = React.useState(false)
        const [clearing, setClearing] = React.useState({ armed: false, busy: false, result: null })
        /** Disarms the two-click clear when the second click never comes. */
        const armTimer = React.useRef(undefined)
        /**
         * This section is injected into every bundle's detail page, so it must
         * run and clean up the same hooks whether or not this page belongs to
         * this plugin: a different subject between renders would otherwise
         * change the hook count and throw. The check only gates the work.
         */
        const ours = subject !== undefined
          && subject !== null
          && subject.kind === "bundle"
          && subject.pkg?.name === BUNDLE

        React.useEffect(() => {
          if (!ours) return undefined
          let alive = true
          setState((previous) => ({ ...previous, status: previous.records.length === 0 ? "loading" : "refreshing" }))
          Promise.resolve()
            .then(() => readRemoteHistory())
            .then((value) => {
              if (alive) setState({ status: "ready", records: value.records, historyPath: value.historyPath, error: "" })
            })
            .catch((error) => {
              if (alive) setState((previous) => ({ ...previous, status: "failed", error: String(error?.message ?? error) }))
            })
          return () => {
            alive = false
          }
        }, [token, ours])

        // "Check now" lives in the settings section above; it announces itself
        // here so the list does not keep showing what was true before the check.
        React.useEffect(() => {
          if (!ours) return undefined
          if (typeof window === "undefined" || typeof window.addEventListener !== "function") return undefined
          const timers = []
          const listener = () => {
            setToken((value) => value + 1)
            timers.push(setTimeout(() => setToken((value) => value + 1), 7000))
          }
          window.addEventListener(CHECKED_EVENT, listener)
          return () => {
            window.removeEventListener?.(CHECKED_EVENT, listener)
            for (const timer of timers) clearTimeout(timer)
          }
        }, [ours])

        React.useEffect(() => () => {
          clearTimeout(armTimer.current)
        }, [])

        if (!ours) return null

        const localeTag = typeof locale?.active === "string" ? locale.active : undefined
        const shown = historyRows(state.records, expanded ? Infinity : 10)
        const total = state.records.length
        const failed = state.status === "failed"
        const unavailable = failed && /404/.test(state.error)

        const refresh = () => {
          clearTimeout(armTimer.current)
          setClearing({ armed: false, busy: false, result: null })
          setToken((value) => value + 1)
        }
        const clear = () => {
          clearTimeout(armTimer.current)
          if (!clearing.armed) {
            setClearing({ armed: true, busy: false, result: null })
            armTimer.current = setTimeout(() => {
              setClearing({ armed: false, busy: false, result: null })
            }, 5000)
            return
          }
          setClearing({ armed: false, busy: true, result: null })
          Promise.resolve()
            .then(() => clearRemoteHistory())
            .then((cleared) => {
              setState((previous) => ({ status: "ready", records: [], historyPath: previous.historyPath, error: "" }))
              setClearing({ armed: false, busy: false, result: { ok: true, cleared } })
            })
            .catch((error) => {
              setClearing({ armed: false, busy: false, result: { ok: false, reason: String(error?.message ?? error) } })
            })
        }

        return jsxs("section", {
          className: "dshAutoUpdate",
          "data-plugin-auto-update-history": true,
          children: [
            jsx("h4", { className: "dshAutoUpdateTitle", children: t("historyTitle") }),
            jsx("p", {
              className: "dshAutoUpdateHint",
              title: state.historyPath === "" ? undefined : state.historyPath,
              children: t("historyIntro", { path: state.historyPath === "" ? "—" : state.historyPath }),
            }),
            clearing.result === null || clearing.result.ok === true
              ? null
              : jsx("p", {
                  className: "dshAutoUpdateEmpty",
                  "data-auto-update-clear": "failed",
                  children: t("historyClearFailed", { reason: String(clearing.result.reason) }),
                }),
            clearing.result?.ok === true
              ? jsx("p", { className: "dshAutoUpdateEmpty", "data-auto-update-clear": "done", children: t("historyCleared", { n: clearing.result.cleared }) })
              : null,
            jsxs("div", { className: "dshAutoUpdateHistory", children: [
              unavailable
                ? jsx("p", { className: "dshAutoUpdateEmpty", children: t("historyUnavailable") })
                : failed
                  ? jsx("p", { className: "dshAutoUpdateEmpty", children: t("historyFailed", { reason: state.error }) })
                  : null,
              state.status === "loading"
                ? jsx("p", { className: "dshAutoUpdateEmpty", children: t("historyLoading") })
                : null,
              !failed && state.status !== "loading" && total === 0
                ? jsx("p", { className: "dshAutoUpdateEmpty", children: t("historyEmpty") })
                : null,
              total === 0
                ? null
                : jsx("ul", { className: "dshAutoUpdateRecords", children: shown.map((record) => jsxs("li", {
                    className: "dshAutoUpdateRecord",
                    "data-auto-update-record": record.action,
                    title: typeof record.reason === "string" ? record.reason : undefined,
                    children: [
                      jsx("span", { className: "dshAutoUpdateWhen", children: formatRecordTime(record.at, localeTag) }),
                      jsx("span", { className: "dshAutoUpdateName", children: record.name }),
                      jsx("span", { className: "dshAutoUpdateArrow", children: `${record.from} → ${record.to}` }),
                      record.action === "failed" && record.rolledBack === true
                        ? jsx("span", { className: "dshAutoUpdateNote", children: t("rolledBack") })
                        : null,
                      record.action === "updated" && record.application === "restart-required"
                        ? jsx("span", { className: "dshAutoUpdateNote", children: t("restartRequired") })
                        : null,
                      jsx("span", {
                        className: "dshAutoUpdateState",
                        "data-tone": actionTone(record.action),
                        children: t(actionLabelKey(record.action)),
                      }),
                    ],
                  }, `${record.at}-${record.name}-${record.to}`)) }),
              jsxs("div", { className: "dshAutoUpdateFooter", children: [
                jsx("span", { className: "dshAutoUpdateSub", "data-auto-update-history-count": total, children: total === 0 ? "" : t("historyCount", { n: total }) }),
                jsxs("div", { className: "dshAutoUpdateLinks", children: [
                  total > shown.length
                    ? jsx("button", {
                        type: "button",
                        className: "dshAutoUpdateLink",
                        "data-auto-update-history-more": true,
                        onClick: () => setExpanded(true),
                        children: t("historyMore", { n: total }),
                      })
                    : null,
                  jsx("button", {
                    type: "button",
                    className: "dshAutoUpdateLink",
                    "data-auto-update-history-refresh": true,
                    disabled: state.status === "refreshing",
                    onClick: refresh,
                    children: t("historyRefresh"),
                  }),
                  total === 0
                    ? null
                    : jsx("button", {
                        type: "button",
                        className: "dshAutoUpdateLink",
                        "data-auto-update-history-clear": clearing.armed ? "armed" : "idle",
                        "data-intent": "danger",
                        disabled: clearing.busy === true,
                        onClick: clear,
                        children: clearing.armed ? t("historyClearConfirm") : t("historyClear"),
                      }),
                ] }),
              ] }),
            ] }),
          ],
        })
      }

      ctx.effect(() => ctx.slots.inject("plugins.detail.section", () => ctx.slots.register({
        name: "plugins.detail.section",
        id: "auto-update",
        order: 40,
      }, AutoUpdateSection)), "auto-update: plugin page section")

      ctx.effect(() => ctx.slots.inject("plugins.detail.section", () => ctx.slots.register({
        name: "plugins.detail.section",
        id: "auto-update-history",
        order: 50,
      }, AutoUpdateHistorySection)), "auto-update: history section")

      // Console handle for support: `__DSH_AUTO_UPDATE__.state()` says whether
      // the settings document is loaded and what this plugin's namespace holds;
      // `history()` reads the same route the page reads.
      try {
        window.__DSH_AUTO_UPDATE__ = {
          version: "0.2.2",
          namespace: NAMESPACE,
          state: () => ({
            form: form.getSnapshot(),
            document: mirror?.getSnapshot?.(),
          }),
          history: () => readRemoteHistory(),
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

    return {
      inject,
      apply,
      internals: {
        installedBundles,
        listFromResponse,
        isFloatingSpec,
        blockReason,
        historyUrls,
        historyRows,
        isHistoryRecord,
        actionLabelKey,
        actionTone,
        formatRecordTime,
        readRemoteHistory,
        clearRemoteHistory,
        CHECKED_EVENT,
      },
    }
  },
})
