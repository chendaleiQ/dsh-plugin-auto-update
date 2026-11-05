/**
 * dsh-plugin-auto-update — the route the panel reads the history from.
 *
 * The panel is a page, so it cannot read the history file; the history is not a
 * setting, so it is not in the settings document either. The host half answers
 * it over HTTP on the app's own server, and this module is that answer.
 *
 * Kept apart from the Cordis wiring so it can be tested without a desktop: all
 * it knows is a request, a response, and the two updater calls.
 */

/**
 * Build the handler for one route registration.
 *
 * @param {object} options
 * @param {() => Promise<{records: object[], historyPath: string}>} options.readHistory
 * @param {() => Promise<number>} options.clearHistory
 * @param {() => unknown} [options.limitOf] Current record cap, echoed for the panel.
 * @returns {(req: object, res: object) => Promise<void>}
 */
export function createHistoryRoute(options = {}) {
  const readHistory = options.readHistory
  const clearHistory = options.clearHistory
  const limitOf = typeof options.limitOf === "function" ? options.limitOf : () => undefined

  return async (req, res) => {
    res.setHeader("content-type", "application/json; charset=utf-8")
    res.setHeader("cache-control", "no-store")
    const answer = (status, body) => {
      res.statusCode = status
      res.end(JSON.stringify(body))
    }
    try {
      const method = String(req?.method ?? "GET").toUpperCase()
      if (method === "GET") {
        const history = await readHistory()
        answer(200, {
          ok: true,
          records: Array.isArray(history?.records) ? history.records : [],
          historyPath: typeof history?.historyPath === "string" ? history.historyPath : "",
          limit: limitOf(),
        })
        return
      }
      if (method === "DELETE") {
        answer(200, { ok: true, cleared: await clearHistory() })
        return
      }
      res.setHeader("allow", "GET, DELETE")
      answer(405, { ok: false, error: "method not allowed" })
    } catch (error) {
      answer(500, { ok: false, error: String(error?.message ?? error) })
    }
  }
}
