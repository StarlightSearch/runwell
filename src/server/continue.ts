/**
 * "Continue in Claude": a finished run's Claude session reopened for the person, in a terminal
 * (`claude --resume <id>`, any platform) or in Claude Desktop (`claude --desktop --resume <id>`, which
 * Claude Code offers on macOS and Windows only and which needs a terminal, so it runs under `script`).
 * Sessions made by `claude -p` are not in Claude's resume picker, but resume by id works from any folder.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { RunRow } from "./runs";

export const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export interface Launch {
  /** Runs a program detached (a terminal window). Resolves false when it could not start. */
  detached(cmd: string, args: string[], cwd: string): Promise<boolean>;
  /** Runs a program to its end and returns its exit code and output. */
  run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number | null; out: string }>;
  /** Whether a program is on PATH. */
  has(cmd: string): boolean;
  platform: NodeJS.Platform;
}

export const systemLaunch: Launch = {
  detached: (cmd, args, cwd) =>
    new Promise((resolve) => {
      try {
        const c = spawn(cmd, args, { cwd, detached: true, stdio: "ignore" });
        c.once("error", () => resolve(false));
        c.once("spawn", () => (c.unref(), resolve(true)));
      } catch {
        resolve(false);
      }
    }),
  run: (cmd, args, cwd, timeoutMs) =>
    new Promise((resolve) => {
      let out = "";
      const c = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
      c.stdout.on("data", (d) => (out += d));
      c.stderr.on("data", (d) => (out += d));
      c.once("error", () => resolve({ code: null, out }));
      c.once("close", (code) => resolve({ code, out }));
    }),
  has: (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0,
  platform: process.platform,
};

export interface ResumeInfo {
  sessionId: string;
  /** The line to paste into a terminal. */
  command: string;
  desktop: { available: boolean; reason: string | null };
}

export function resumeInfo(run: RunRow, platform: NodeJS.Platform): ResumeInfo | null {
  if (!run.sessionId || !SESSION_ID.test(run.sessionId)) return null;
  const cwd = run.cwd && existsSync(run.cwd) ? run.cwd : null;
  const available = platform === "darwin" || platform === "win32";
  return {
    sessionId: run.sessionId,
    command: `${cwd ? `cd ${shq(cwd)} && ` : ""}claude --resume ${run.sessionId}`,
    desktop: { available, reason: available ? null : "Claude Code opens a session in Claude Desktop on macOS and Windows only." },
  };
}

const TERMINALS: { bin: string; args(cwd: string, line: string, argv: string[]): string[] }[] = [
  { bin: "x-terminal-emulator", args: (_c, line) => ["-e", "sh", "-c", line] },
  { bin: "gnome-terminal", args: (cwd, _l, argv) => [`--working-directory=${cwd}`, "--", ...argv] },
  { bin: "konsole", args: (cwd, _l, argv) => ["--workdir", cwd, "-e", ...argv] },
  { bin: "xfce4-terminal", args: (cwd, _l, argv) => ["--working-directory", cwd, "-x", ...argv] },
  { bin: "kitty", args: (cwd, _l, argv) => ["--directory", cwd, ...argv] },
  { bin: "alacritty", args: (cwd, _l, argv) => ["--working-directory", cwd, "-e", ...argv] },
  { bin: "xterm", args: (_c, line) => ["-e", "sh", "-c", line] },
];

const plain = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").trim();

/** Opens the run's session. Never while the run is live: two processes on one session lose messages. */
export async function continueRun(run: RunRow, where: "terminal" | "desktop", claudeBin: string, launch: Launch): Promise<{ ok: true; message: string } | { ok: false; status: number; message: string }> {
  if (["queued", "running", "waiting"].includes(run.status)) return { ok: false, status: 409, message: "This run is still going. Continue it once it has ended." };
  const info = resumeInfo(run, launch.platform);
  if (!info) return { ok: false, status: 409, message: "This run has no Claude session to continue." };
  const cwd = run.cwd && existsSync(run.cwd) ? run.cwd : homedir();
  const argv = [claudeBin, "--resume", info.sessionId];

  if (where === "desktop") {
    if (!info.desktop.available) return { ok: false, status: 400, message: info.desktop.reason! };
    // --desktop refuses when its output is not a terminal; `script` gives it one.
    const r = launch.platform === "darwin"
      ? await launch.run("script", ["-q", "/dev/null", claudeBin, "--desktop", "--resume", info.sessionId], cwd, 30_000)
      : await launch.run(claudeBin, ["--desktop", "--resume", info.sessionId], cwd, 30_000);
    return r.code === 0 ? { ok: true, message: "Opened in Claude Desktop." } : { ok: false, status: 502, message: plain(r.out).split("\n")[0] || "Claude Desktop could not open this session." };
  }

  const line = `cd ${shq(cwd)} && ${shq(claudeBin)} --resume ${info.sessionId}`;
  if (launch.platform === "darwin") {
    const script = line.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const ok = await launch.detached("osascript", ["-e", `tell application "Terminal" to do script "${script}"`, "-e", 'tell application "Terminal" to activate'], cwd);
    if (ok) return { ok: true, message: "Opened in Terminal." };
  } else if (launch.platform !== "win32") {
    for (const t of TERMINALS) {
      if (!launch.has(t.bin)) continue;
      if (await launch.detached(t.bin, t.args(cwd, line, argv), cwd)) return { ok: true, message: "Opened in a terminal." };
    }
  }
  return { ok: false, status: 501, message: "No terminal could be opened. Copy the command and run it in your own terminal." };
}
