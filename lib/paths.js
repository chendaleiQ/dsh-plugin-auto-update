/**
 * dsh-plugin-auto-update — path helpers shared by the log and the history.
 *
 * Both files are addressed by a settings field that starts with `~`, so the one
 * thing worth sharing is the expansion rule.
 */

import { homedir } from "node:os"
import { join } from "node:path"

/** Expand a leading `~` against the current home. */
export function expandHome(path) {
  const text = String(path ?? "")
  if (text === "~") return homedir()
  if (text.startsWith("~/")) return join(homedir(), text.slice(2))
  return text
}
