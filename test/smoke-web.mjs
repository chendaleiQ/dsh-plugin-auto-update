#!/usr/bin/env node
/**
 * Reproduce dsh.so's L5 "web smoke" locally, against any published artifact.
 *
 * dsh.so grades a plugin L5 only when the sandbox installs it *and* the dsh web
 * app boots with it, serves HTTP, and lists the plugin in the client inventory.
 * This script runs exactly those four steps in a throwaway DSH_HOME, so a
 * version can be checked before it is submitted for verification:
 *
 *   node test/smoke-web.mjs                       # this package (npm pack tarball)
 *   node test/smoke-web.mjs <spec>                # e.g. @chendaleiq/dsh-plugin-auto-update@0.2.0
 *   DSH_SMOKE_DSH=0.2.1-rc.5 node test/smoke-web.mjs <spec>
 *                                                 # boot that dsh release via npx
 *
 * Exit code 0 = every check passed. Each failing check names itself.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");

const BOOT_TIMEOUT_MS = 120_000;
const POLL_MS = 500;

/** How to invoke dsh: the installed CLI, or a pinned release through npx. */
function dshCommand() {
  const pinned = process.env.DSH_SMOKE_DSH;
  if (pinned) return { bin: "npx", prefix: ["-y", `@deepseek-ai/dsh@${pinned}`] };
  return { bin: "dsh", prefix: [] };
}

const { bin, prefix } = dshCommand();

/** Run a dsh subcommand to completion; non-zero exit is a failed check. */
function dsh(args, { env, timeout = 600_000 } = {}) {
  const result = spawnSync(bin, [...prefix, ...args], {
    env,
    encoding: "utf8",
    timeout,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

/** The install spec under test: the tarball this checkout would publish, or argv. */
function resolveSpec() {
  const given = process.argv[2];
  if (given) return given;
  const packed = spawnSync("npm", ["pack", "--silent", "--pack-destination", tmpdir()], {
    cwd: packageRoot,
    encoding: "utf8",
    // A sandboxed run may not be able to write the default npm cache.
    env: { ...process.env, npm_config_cache: join(tmpdir(), "npm-cache-smoke") },
  });
  const name = (packed.stdout ?? "").trim().split("\n").pop();
  if (packed.status !== 0 || !name) {
    throw new Error(`npm pack failed: ${packed.stderr || packed.stdout}`);
  }
  const tarball = join(tmpdir(), name);
  if (!existsSync(tarball)) throw new Error(`npm pack reported ${tarball}, which is missing`);
  return tarball;
}

const checks = [];
function record(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  const mark = ok ? "✔" : "✘";
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Wait for a condition that the booted app has to reach on its own. */
async function until(predicate, timeoutMs, stepMs = POLL_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return undefined;
}

/** The plugin name the checks look for in the inventory. */
function pluginNameOf(spec) {
  if (spec.startsWith("@")) {
    const [scope, rest] = spec.slice(1).split("/");
    return `@${scope}/${rest.split("@")[0]}`;
  }
  if (spec.startsWith("/") || spec.startsWith("file:") || spec.endsWith(".tgz")) {
    const pkg = JSON.parse(
      spawnSync("tar", ["-xzOf", spec.replace(/^file:/, ""), "package/package.json"], {
        encoding: "utf8",
      }).stdout || "{}",
    );
    return pkg.name;
  }
  return spec.split("@")[0];
}

async function main() {
  const spec = resolveSpec();
  const name = pluginNameOf(spec);
  const home = mkdtempSync(join(tmpdir(), "dsh-smoke-"));
  const profile = "smoke";
  const env = {
    ...process.env,
    DSH_HOME: home,
    npm_config_cache: join(home, "npm-cache"),
  };
  console.log(`spec: ${spec}`);
  console.log(`plugin: ${name}`);
  console.log(`DSH_HOME: ${home}`);

  const cleanup = () => rmSync(home, { recursive: true, force: true });

  // 1. A fresh profile composed from the shipped web template.
  const init = dsh(["--profile", profile, "--from-default-profile", "web", "--dump-config"], { env });
  record("profile composed from the web template", init.ok, init.ok ? "" : init.stderr.slice(0, 200));
  if (!init.ok) return cleanup();

  // 2. The install the verifier runs, in an isolated sandbox.
  const added = dsh(["plugin", "--profile", profile, "add", spec], { env });
  record("L4 sandbox install", added.ok, added.ok ? "" : (added.stderr || added.stdout).slice(0, 300));
  if (!added.ok) return cleanup();

  const composed = dsh(["--profile", profile, "--dump-config"], { env });
  record("plugin row present in the composed tree", composed.ok && composed.stdout.includes(name));

  // 3. Boot the web app with the plugin mounted.
  const boot = spawn(bin, [...prefix, "--profile", profile, "--no-open", "--port", "0"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  boot.stdout?.on("data", (chunk) => { log += chunk; });
  boot.stderr?.on("data", (chunk) => { log += chunk; });

  const started = await until(() => log.match(/dsh web: (http:\/\/[^\s]+)/)?.[1], BOOT_TIMEOUT_MS);
  record(
    "L5.2 web boot ready",
    Boolean(started),
    started ? "" : `app never printed its URL; log tail: ${log.slice(-400)}`,
  );
  if (!started) {
    boot.kill("SIGKILL");
    return cleanup();
  }

  const base = new URL(started).origin;
  // The token URL answers with a session cookie and a redirect; follow it by hand
  // because fetch has no cookie jar.
  const auth = await fetch(started, { redirect: "manual" });
  const cookieHeader = (auth.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  record("L5.3 HTTP served", auth.status === 200 || auth.status === 303, `HTTP ${auth.status}`);

  const pageResponse = await fetch(`${base}/?token=${new URL(started).searchParams.get("token")}`, {
    redirect: "manual",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
  const page = cookieHeader
    ? await fetch(`${base}/`, { redirect: "manual", headers: { cookie: cookieHeader } })
        .then((r) => (r.status === 200 ? r.text() : ""))
        .catch(() => "")
    : "";
  record("plugin listed in the client inventory", page.includes(`${name}/client.js`), `page HTTP ${pageResponse.status}`);

  const clientMatch = page.match(new RegExp(`plugins/[^"']*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/client\\.js[^"']*`));
  if (clientMatch) {
    const bundle = await fetch(`${base}/${clientMatch[0].replaceAll("&amp;", "&")}`);
    record("client bundle builds and serves", bundle.status === 200, `HTTP ${bundle.status}`);
  } else {
    record("client bundle builds and serves", false, "no bundle URL in the page");
  }

  const history = await fetch(`${base}/dsh-plugin-auto-update/history`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  }).catch(() => undefined);
  const routeOk = history !== undefined && (history.status === 200 || history.status === 401);
  record("host half mounted (history route answers)", routeOk, history ? `HTTP ${history.status}` : "no response");

  boot.kill("SIGKILL");
  cleanup();

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length > 0) process.exitCode = 1;
}

await main();
