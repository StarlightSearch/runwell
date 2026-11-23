import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);

// src/launcher-entry.ts
import { spawn as spawn2 } from "node:child_process";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/launcher.ts
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// src/shared/version.ts
var VERSION = true ? "0.1.2" : "0.0.0-dev";

// src/server/lifecycle.ts
import { closeSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from "node:fs";
function readServerInfo(p) {
  try {
    const v = JSON.parse(readFileSync(p.serverJson, "utf8"));
    if (typeof v.pid === "number" && typeof v.port === "number" && typeof v.token === "string" && typeof v.version === "string") {
      return { pid: v.pid, port: v.port, token: v.token, version: v.version };
    }
  } catch {
  }
  return null;
}
async function probe(info, timeoutMs = 500) {
  try {
    const r = await fetch(`http://127.0.0.1:${info.port}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const v = await r.json();
    if (v.ok !== true || typeof v.version !== "string") return null;
    if (typeof v.pid === "number" && v.pid !== info.pid) return null;
    return { ok: true, version: v.version, activeRuns: typeof v.activeRuns === "number" ? v.activeRuns : 0 };
  } catch {
    return null;
  }
}
function cmpVersion(a, b) {
  const parse = (v) => v.split("-")[0].split(".").map((x2) => Number.parseInt(x2, 10) || 0);
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
function decide(existing, mine) {
  if (!existing) return "start";
  if (cmpVersion(existing.version, mine) >= 0) return "reuse";
  return existing.activeRuns > 0 ? "reuse" : "replace";
}

// src/server/paths.ts
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function paths(home) {
  const root = home ?? process.env.RUNWELL_HOME ?? join(homedir(), ".runwell");
  mkdirSync(root, { recursive: true, mode: 448 });
  const runs = join(root, "runs");
  const runDir = (id) => join(runs, id);
  return {
    root,
    db: join(root, "runwell.db"),
    serverJson: join(root, "server.json"),
    lock: join(root, "server.lock"),
    configJson: join(root, "config.json"),
    runs,
    workflows: join(root, "workflows"),
    runDir,
    events: (id) => join(runDir(id), "events.jsonl"),
    inputs: (id) => join(runDir(id), "inputs"),
    work: (id) => join(runDir(id), "work"),
    outputs: (id) => join(runDir(id), "outputs"),
    workflowJson: (id) => join(runDir(id), "workflow.json")
  };
}

// src/launcher.ts
var NODE_HINT = "Runwell needs Node 20 or newer. Install it from https://nodejs.org and try again.";
var nodeOk = (v = process.versions.node) => Number(v.split(".")[0]) >= 20;
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(home, ms, pred) {
  const end = Date.now() + ms;
  for (; ; ) {
    const info = readServerInfo(paths(home));
    const live = info && await probe(info, 300) ? info : null;
    if (pred(live)) return live;
    if (Date.now() > end) return null;
    await sleep(100);
  }
}
async function ensureServer(opts = {}) {
  const p = paths(opts.home);
  const info = readServerInfo(p);
  const health = info ? await probe(info) : null;
  const choice = decide(health, opts.version ?? VERSION);
  if (choice === "reuse" && info) return info;
  if (choice === "replace" && info) {
    try {
      const r = await fetch(`http://127.0.0.1:${info.port}/api/shutdown`, { method: "POST", headers: { authorization: `Bearer ${info.token}` }, signal: AbortSignal.timeout(1e3) });
      if (r.status === 409) return info;
    } catch {
    }
    await waitFor(p.root, 3e3, (live) => live === null);
  }
  const entry = opts.serverEntry ?? fileURLToPath(new URL("./server.js", import.meta.url));
  const child = spawn(process.execPath, [entry], { detached: true, stdio: "ignore", env: { ...process.env, RUNWELL_HOME: p.root } });
  child.on("error", () => {
  });
  child.unref();
  if (!opts.wait) return null;
  return waitFor(p.root, 5e3, (live) => live !== null && live.pid !== info?.pid);
}

// src/launcher-entry.ts
async function main() {
  if (!process.argv.includes("--now")) {
    const info = readServerInfo(paths());
    if (info && decide(await probe(info), VERSION) === "replace") {
      const c = spawn2(process.execPath, [fileURLToPath2(import.meta.url), "--now"], { detached: true, stdio: "ignore" });
      c.on("error", () => {
      });
      c.unref();
      return;
    }
  }
  await ensureServer({ wait: false });
}
if (!nodeOk()) {
  process.stderr.write(`${NODE_HINT}
`);
  process.exit(0);
}
main().then(
  () => process.exit(0),
  () => process.exit(0)
);
