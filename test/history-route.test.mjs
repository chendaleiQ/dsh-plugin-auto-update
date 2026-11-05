/**
 * Tests for the history route.
 *
 * The route is the only way the page reaches the stored records, so its answers
 * matter: what a read returns, that a clear reports what it dropped, that an
 * unknown method is refused, and that a failing file read is reported instead
 * of thrown into the server.
 */

import assert from "node:assert/strict"
import test from "node:test"

import { createHistoryRoute } from "../lib/history-route.js"

/** A request/response pair that records what the handler answered. */
function harness(options = {}) {
  const handler = createHistoryRoute({
    readHistory: options.readHistory ?? (async () => ({ records: [], historyPath: "/tmp/history.json" })),
    clearHistory: options.clearHistory ?? (async () => 0),
    limitOf: options.limitOf,
  })
  const request = (method) => {
    const answer = { status: undefined, body: "", headers: {} }
    const res = {
      setHeader: (name, value) => {
        answer.headers[name] = value
      },
      set statusCode(value) {
        answer.status = value
      },
      get statusCode() {
        return answer.status
      },
      end: (body) => {
        answer.body = body
      },
    }
    return { request: { method }, res, answer }
  }
  return { handler, request }
}

test("a read answers the records, their path and the cap", async () => {
  const records = [{ at: "2026-11-05T00:00:00.000Z", name: "plug", from: "1.0.0", to: "1.1.0", action: "updated" }]
  const { handler, request } = harness({
    readHistory: async () => ({ records, historyPath: "/home/u/.dsh/plugin-auto-update-history.json" }),
    limitOf: () => 200,
  })
  const { request: req, res, answer } = request("GET")
  await handler(req, res)
  assert.equal(answer.status, 200)
  assert.equal(answer.headers["content-type"], "application/json; charset=utf-8")
  const body = JSON.parse(answer.body)
  assert.deepEqual(body, {
    ok: true,
    records,
    historyPath: "/home/u/.dsh/plugin-auto-update-history.json",
    limit: 200,
  })
})

test("a clear reports how many records it dropped", async () => {
  const { handler, request } = harness({ clearHistory: async () => 7 })
  const { request: req, res, answer } = request("DELETE")
  await handler(req, res)
  assert.equal(answer.status, 200)
  assert.deepEqual(JSON.parse(answer.body), { ok: true, cleared: 7 })
})

test("an unknown method is refused and names the allowed ones", async () => {
  const { handler, request } = harness()
  const { request: req, res, answer } = request("POST")
  await handler(req, res)
  assert.equal(answer.status, 405)
  assert.equal(answer.headers.allow, "GET, DELETE")
  assert.equal(JSON.parse(answer.body).ok, false)
})

test("a failing read is reported, not thrown", async () => {
  const { handler, request } = harness({
    readHistory: async () => {
      throw new Error("permission denied")
    },
  })
  const { request: req, res, answer } = request("GET")
  await handler(req, res)
  assert.equal(answer.status, 500)
  assert.deepEqual(JSON.parse(answer.body), { ok: false, error: "permission denied" })
})

test("an updater that answers nothing still produces a valid document", async () => {
  const { handler, request } = harness({ readHistory: async () => undefined })
  const { request: req, res, answer } = request("GET")
  await handler(req, res)
  assert.equal(answer.status, 200)
  assert.deepEqual(JSON.parse(answer.body), { ok: true, records: [], historyPath: "" })
})
