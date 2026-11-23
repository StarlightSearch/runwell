/**
 * Is the person's `claude` there, which version, and is it signed in? The sign-in check runs
 * `claude auth status --json` (spike 4) and reads only `loggedIn`: the rest of its answer holds the
 * account's email and organisation, and is never stored or logged.
 */
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { locateClaude } from "./locate";

export { locateClaude } from "./locate";

export const NOT_FOUND = "Claude Code was not found. Install it, or set its path in Settings.";
export const SIGNED_OUT = "Run `claude` in a terminal and sign in.";
const MODS_FROM = "2.1.287";

export type SignedIn = "in" | "out" | "unknown";
export interface ClaudeState {
  found: boolean;
  path: string | null;
  version: string | null;
  signedIn: SignedIn;
  modsSupported: boolean;
  message: string | null;
}

function run(bin: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<{ code: number | null; stdout: string } | null> {
  return new Promise((resolve) => {
    execFile(bin, args, { env, timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err && (err as { killed?: boolean }).killed) return resolve(null);
      const code = err ? ((err as { code?: unknown }).code as number | null) ?? 1 : 0;
      resolve({ code: typeof code === "number" ? code : 1, stdout: String(stdout) });
    });
  });
}

export async function claudeVersion(bin: string, env: NodeJS.ProcessEnv = process.env, timeoutMs = 5000): Promise<string | null> {
  const r = await run(bin, ["--version"], env, timeoutMs);
  return r ? (/(\d+\.\d+\.\d+)/.exec(r.stdout)?.[1] ?? null) : null;
}

/** The child runs with the server's own environment (or the one given): nothing is added to it. */
export async function checkSignedIn(bin: string, env: NodeJS.ProcessEnv = process.env, timeoutMs = 5000): Promise<SignedIn> {
  const r = await run(bin, ["auth", "status", "--json"], env, timeoutMs);
  if (!r) return "unknown";
  try {
    const loggedIn = (JSON.parse(r.stdout) as { loggedIn?: unknown }).loggedIn;
    if (r.code === 0 && loggedIn === true) return "in";
    if (loggedIn === false) return "out";
  } catch {
    /* not JSON: unknown */
  }
  return "unknown";
}

export function isAuthError(text: string): boolean {
  return text.includes("authentication_failed") || text.trimStart().startsWith("Not logged in");
}

const atLeast = (v: string, min: string) => {
  const a = v.split(".").map(Number);
  const b = min.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
};

export async function claudeState(opts: { configured: string | null; env?: NodeJS.ProcessEnv; home?: string }): Promise<ClaudeState> {
  const env = opts.env ?? process.env;
  const path = locateClaude({ configured: opts.configured, env, home: opts.home ?? homedir() });
  if (!path) return { found: false, path: null, version: null, signedIn: "unknown", modsSupported: false, message: NOT_FOUND };
  const [version, signedIn] = await Promise.all([claudeVersion(path, env), checkSignedIn(path, env)]);
  return { found: true, path, version, signedIn, modsSupported: version ? atLeast(version, MODS_FROM) : false, message: signedIn === "out" ? SIGNED_OUT : null };
}
