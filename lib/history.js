/**
 * dsh-plugin-auto-update — the update history the panel shows.
 *
 * Two files record what happened, and they are not the same file:
 *
 * - `plugin-auto-update.log` is for support: one JSON line per event, appended
 *   forever, never read by the page.
 * - `plugin-auto-update-history.json` is for the panel: only the decisions that
 *   say something about a package's version (`updated`, `failed`,
 *   `would-update`), capped, ordered oldest first, and rewritten atomically so
 *   a half-written file never replaces a good one.
 *
 * A cycle that only confirmed everyone is current writes nothing here. A
 * repeated identical outcome (the same package offering the same version,
 * failing the same way, or previewed again by a dry run) is folded into the
 * record already stored, so history stays a list of events rather than a list
 * of ticks.
 */

import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

import { expandHome } from "./paths.js"

/** Where the history lives unless the settings say otherwise. */
export const DEFAULT_HISTORY_PATH = "~/.dsh/plugin-auto-update-history.json"

/** How many records are kept; older ones fall off the front. */
export const DEFAULT_HISTORY_LIMIT = 200

/** Highest limit a settings edit may ask for, so one file stays readable. */
export const MAX_HISTORY_LIMIT = 2000

/** Format version of the stored document. */
export const HISTORY_VERSION = 1

/** The decisions worth remembering, in the order the panel lists them. */
export const HISTORY_ACTIONS = ["updated", "failed", "would-update"]

/** Whether a stored value is usable as one record. */
export function isHistoryRecord(value) {
  return value !== null
    && typeof value === "object"
    && typeof value.at === "string"
    && typeof value.name === "string"
    && typeof value.from === "string"
    && typeof value.to === "string"
    && HISTORY_ACTIONS.includes(value.action)
}

/**
 * Turn one cycle decision into a stored record, or null when the decision only
 * reports that a package is already current.
 *
 * @param {object} decision One entry of a cycle's `decisions`.
 * @param {string} [at] ISO time the cycle ran.
 */
export function historyRecordOf(decision, at = new Date().toISOString()) {
  if (decision === null || typeof decision !== "object") return null
  if (!HISTORY_ACTIONS.includes(decision.action)) return null
  if (typeof decision.name !== "string" || decision.name === "") return null
  if (typeof decision.installed !== "string" || typeof decision.latest !== "string") return null
  const record = {
    at,
    name: decision.name,
    from: decision.installed,
    to: decision.latest,
    action: decision.action,
  }
  if (typeof decision.application === "string") record.application = decision.application
  if (typeof decision.restartReason === "string") record.restartReason = decision.restartReason
  if (typeof decision.reason === "string") record.reason = decision.reason
  if (decision.rolledBack === true) record.rolledBack = true
  return record
}

/** The records one cycle produced, oldest first. */
export function historyRecordsOf(decisions, at) {
  return (Array.isArray(decisions) ? decisions : [])
    .map((decision) => historyRecordOf(decision, at))
    .filter((record) => record !== null)
}

/** Clamp a settings value into a usable record limit. */
export function normalizeHistoryLimit(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_HISTORY_LIMIT
  return Math.min(MAX_HISTORY_LIMIT, Math.max(1, Math.floor(value)))
}

/** The document a stored file holds, whether or not anything was stored yet. */
export function emptyHistoryDocument() {
  return { version: HISTORY_VERSION, records: [] }
}

/**
 * Read the stored document. A missing, unreadable, or corrupt file reads as an
 * empty history: the panel then offers nothing rather than surfacing a parse
 * error nobody can act on, and the next write starts the file over.
 */
export async function readHistoryDocument(path = DEFAULT_HISTORY_PATH) {
  const target = expandHome(path)
  let text
  try {
    text = await readFile(target, "utf8")
  } catch {
    return emptyHistoryDocument()
  }
  try {
    const parsed = JSON.parse(text)
    const records = Array.isArray(parsed?.records) ? parsed.records.filter(isHistoryRecord) : []
    return { version: HISTORY_VERSION, records }
  } catch {
    return emptyHistoryDocument()
  }
}

/**
 * Whether `record` repeats what the newest record for the same package already
 * says. A dry run or a failing package is seen again every cycle, and saying so
 * once is the point.
 */
function repeats(previous, record) {
  return previous !== undefined
    && previous.from === record.from
    && previous.to === record.to
    && previous.action === record.action
}

/** Write the document through a temporary file, so a torn write never lands. */
async function writeHistoryDocument(path, document) {
  const target = expandHome(path)
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8")
  try {
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
}

/**
 * Append one cycle's records, folding repeats and keeping the newest `limit`.
 *
 * @param {string} path History file path.
 * @param {object[]} records Records from `historyRecordsOf`.
 * @param {{limit?:number}} [options]
 * @returns {Promise<number>} how many records were actually stored.
 */
export async function appendHistory(path, records, options = {}) {
  const additions = (Array.isArray(records) ? records : []).filter(isHistoryRecord)
  if (additions.length === 0) return 0
  const limit = normalizeHistoryLimit(options.limit)
  const document = await readHistoryDocument(path)
  /** The newest stored record per package, so a repeat is recognised. */
  const newest = new Map()
  for (const record of document.records) newest.set(record.name, record)
  const fresh = []
  for (const record of additions) {
    if (repeats(newest.get(record.name), record)) continue
    fresh.push(record)
    newest.set(record.name, record)
  }
  if (fresh.length === 0) return 0
  const merged = [...document.records, ...fresh].slice(-limit)
  await writeHistoryDocument(path, { version: HISTORY_VERSION, records: merged })
  return fresh.length
}

/**
 * Delete the history file.
 *
 * @returns {Promise<number>} how many records were dropped.
 */
export async function clearHistory(path = DEFAULT_HISTORY_PATH) {
  const document = await readHistoryDocument(path)
  try {
    await unlink(expandHome(path))
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }
  return document.records.length
}
