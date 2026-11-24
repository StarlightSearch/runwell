/**
 * One Workflows server per user. Whoever starts it (the mod, the session hook, `npx workflows`) checks
 * `server.json` and the live server's /health first; a new server takes an exclusive lock file,
 * picks a port, writes `server.json` (mode 600, with a fresh token) and serves.
 */
import { randomBytes } from "node:crypto";
import { closeSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { createServer } from "node:net";
import type { Paths } from "./paths";
import { pidCommand } from "./proc";

const isWorkflowsServer = (pid: number) => {
  const cmd = pidCommand(pid);
  // Unknown (no /proc, no ps): keep the old, cautious answer.
  return cmd === null ? true : /server\.js|workflows|vitest|playwright/.test(cmd);
};

export interface ServerInfo {
  pid: number;
  port: number;
  token: string;
  version: string;
}

export function readServerInfo(p: Paths): ServerInfo | null {
  try {
    const v = JSON.parse(readFileSync(p.serverJson, "utf8"));
    if (typeof v.pid === "number" && typeof v.port === "number" && typeof v.token === "string" && typeof v.version === "string") {
      return { pid: v.pid, port: v.port, token: v.token, version: v.version };
    }
  } catch {
    /* missing or unreadable: no server */
  }
  return null;
}

/** The server server.json names, if it answers. A server on that port with another pid (someone else's, after a port was reused) is not ours. */
export async function probe(info: ServerInfo, timeoutMs = 500): Promise<{ ok: boolean; version: string; activeRuns: number } | null> {
  try {
    const r = await fetch(`http://127.0.0.1:${info.port}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const v = (await r.json()) as { ok?: unknown; version?: unknown; activeRuns?: unknown; pid?: unknown };
    if (v.ok !== true || typeof v.version !== "string") return null;
    if (typeof v.pid === "number" && v.pid !== info.pid) return null;
    return { ok: true, version: v.version, activeRuns: typeof v.activeRuns === "number" ? v.activeRuns : 0 };
  } catch {
    return null;
  }
}

/** Compares dotted versions numerically; a pre-release suffix is ignored. */
function cmpVersion(a: string, b: string): number {
  const parse = (v: string) => v.split("-")[0]!.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** Reuse a live server of the same or a newer version; replace an older idle one; never interrupt a run. */
export function decide(existing: { version: string; activeRuns: number } | null, mine: string): "reuse" | "replace" | "start" {
  if (!existing) return "start";
  if (cmpVersion(existing.version, mine) >= 0) return "reuse";
  return existing.activeRuns > 0 ? "reuse" : "replace";
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function freePort(wanted: number): Promise<number> {
  const tryPort = (port: number) =>
    new Promise<number | null>((resolve) => {
      const s = createServer();
      s.once("error", () => resolve(null));
      s.listen(port, "127.0.0.1", () => {
        const got = (s.address() as { port: number }).port;
        s.close(() => resolve(got));
      });
    });
  return tryPort(wanted).then((p) => p ?? tryPort(0).then((q) => q ?? 0));
}

function takeLock(p: Paths): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(p.lock, "wx", 0o600);
      writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      closeSync(fd);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      let holder = 0;
      try {
        holder = JSON.parse(readFileSync(p.lock, "utf8")).pid ?? 0;
      } catch {
        /* a half-written lock: treat as stale */
      }
      // A live holder counts only if it is still a Workflows server: after a crash and a reboot its pid can
      // belong to anything, and refusing then would keep Workflows from ever starting again.
      if (holder && alive(holder) && isWorkflowsServer(holder)) return false;
      rmSync(p.lock, { force: true });
    }
  }
  return false;
}

/** Takes the lock and writes server.json. Null when another live process holds the lock. */
export async function acquire(p: Paths, port: number, version = "0.0.0-dev"): Promise<{ info: ServerInfo; release(): void } | null> {
  if (!takeLock(p)) return null;
  const info: ServerInfo = { pid: process.pid, port: await freePort(port), token: randomBytes(32).toString("hex"), version };
  const tmp = `${p.serverJson}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(info), { mode: 0o600 });
  renameSync(tmp, p.serverJson);
  let released = false;
  return {
    info,
    release() {
      if (released) return;
      released = true;
      if (readServerInfo(p)?.pid === process.pid) rmSync(p.serverJson, { force: true });
      rmSync(p.lock, { force: true });
    },
  };
}

/** Calls `onIdle` once after `idleMs` with no touch; time while busy counts as activity. */
export function idleWatch(opts: { idleMs: number; isBusy(): boolean; onIdle(): void; now?(): number }): { touch(): void; stop(): void } {
  const now = opts.now ?? Date.now;
  let last = now();
  let fired = false;
  const timer = setInterval(() => {
    if (fired) return;
    if (opts.isBusy()) {
      last = now();
      return;
    }
    if (now() - last >= opts.idleMs) {
      fired = true;
      opts.onIdle();
    }
  }, Math.max(50, Math.min(opts.idleMs / 4, 60_000)));
  timer.unref?.();
  return {
    touch: () => {
      last = now();
    },
    stop: () => clearInterval(timer),
  };
}
