/**
 * Starts the Runwell server if it is not running, without making the caller wait for it: the server is
 * spawned detached with no stdio and unref'd, so it outlives the CLI, the hook and the Claude session.
 * An older server with no run in progress is asked to shut down and replaced; one in a run is reused.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { VERSION } from "./shared/version";
import { decide, probe, readServerInfo, type ServerInfo } from "./server/lifecycle";
import { paths } from "./server/paths";

export const NODE_HINT = "Runwell needs Node 20 or newer. Install it from https://nodejs.org and try again.";
export const nodeOk = (v = process.versions.node) => Number(v.split(".")[0]) >= 20;

export interface EnsureOptions {
  home?: string;
  /** Wait (up to 5 s) for the server to answer; otherwise return right after the spawn. */
  wait?: boolean;
  /** The server bundle; defaults to server.js beside this file. */
  serverEntry?: string;
  /** This launcher's version, compared with the running server's. */
  version?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(home: string, ms: number, pred: (live: ServerInfo | null) => boolean): Promise<ServerInfo | null> {
  const end = Date.now() + ms;
  for (;;) {
    const info = readServerInfo(paths(home));
    const live = info && (await probe(info, 300)) ? info : null;
    if (pred(live)) return live;
    if (Date.now() > end) return null;
    await sleep(100);
  }
}

export async function ensureServer(opts: EnsureOptions = {}): Promise<ServerInfo | null> {
  const p = paths(opts.home);
  const info = readServerInfo(p);
  const health = info ? await probe(info) : null;
  const choice = decide(health, opts.version ?? VERSION);
  if (choice === "reuse" && info) return info;
  if (choice === "replace" && info) {
    try {
      const r = await fetch(`http://127.0.0.1:${info.port}/api/shutdown`, { method: "POST", headers: { authorization: `Bearer ${info.token}` }, signal: AbortSignal.timeout(1000) });
      if (r.status === 409) return info;
    } catch {
      /* already gone */
    }
    await waitFor(p.root, 3000, (live) => live === null);
  }
  const entry = opts.serverEntry ?? fileURLToPath(new URL("./server.js", import.meta.url));
  const child = spawn(process.execPath, [entry], { detached: true, stdio: "ignore", env: { ...process.env, RUNWELL_HOME: p.root } });
  child.on("error", () => {});
  child.unref();
  if (!opts.wait) return null;
  return waitFor(p.root, 5000, (live) => live !== null && live.pid !== info?.pid);
}

/**
 * Opens a URL in the person's browser. Resolves true once the opener has handed it over (it exits 0),
 * false when no opener ran or it failed; waits at most 5 s, so the CLI never exits before the hand-off.
 */
export function openUrl(url: string): Promise<boolean> {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  return new Promise((resolve) => {
    try {
      const c = spawn(cmd, [url], { detached: true, stdio: "ignore" });
      const t = setTimeout(() => (c.unref(), resolve(true)), 5000);
      c.once("error", () => (clearTimeout(t), resolve(false)));
      c.once("exit", (code) => (clearTimeout(t), resolve(code === 0)));
    } catch {
      resolve(false);
    }
  });
}
