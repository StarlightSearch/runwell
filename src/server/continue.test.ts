import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { continueRun, resumeInfo, type Launch } from "./continue";
import type { RunRow } from "./runs";

const SID = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const dir = mkdtempSync(join(tmpdir(), "workflows-it's-"));
const run = (over: Partial<RunRow> = {}): RunRow => ({
  id: "r1", skillKey: "personal:x", skillRef: "x", n: 1, kind: "button", status: "finished", brief: "", cwd: dir, place: "folder",
  projectPath: null, model: null, allowAll: false, skillVersion: 1, createdAt: 1, startedAt: 1, endedAt: 2, waitingMs: 0,
  rating: null, note: null, error: null, sessionId: SID, mode: "auto", ...over,
});
function recorder(platform: NodeJS.Platform, opts: { has?: string[]; runResult?: { code: number | null; out: string }; detachedOk?: boolean } = {}) {
  const calls: { kind: string; cmd: string; args: string[]; cwd: string }[] = [];
  const launch: Launch = {
    platform,
    has: (c) => (opts.has ?? []).includes(c),
    detached: async (cmd, args, cwd) => (calls.push({ kind: "detached", cmd, args, cwd }), opts.detachedOk ?? true),
    run: async (cmd, args, cwd) => (calls.push({ kind: "run", cmd, args, cwd }), opts.runResult ?? { code: 0, out: "" }),
  };
  return { launch, calls };
}

describe("resumeInfo", () => {
  it("gives the command with the folder quoted, and null without a valid session id", () => {
    const info = resumeInfo(run(), "linux")!;
    expect(info.command).toBe(`cd '${dir.replace("'", "'\\''")}' && claude --resume ${SID}`);
    expect(info.desktop.available).toBe(false);
    expect(resumeInfo(run(), "darwin")!.desktop.available).toBe(true);
    expect(resumeInfo(run({ sessionId: null }), "linux")).toBeNull();
    expect(resumeInfo(run({ sessionId: "x; rm -rf /" }), "linux")).toBeNull();
  });
});

describe("continueRun", () => {
  it("refuses a live run and a run with no session", async () => {
    const { launch, calls } = recorder("linux", { has: ["xterm"] });
    expect(await continueRun(run({ status: "running" }), "terminal", "/bin/claude", launch)).toMatchObject({ ok: false, status: 409 });
    expect(await continueRun(run({ sessionId: null }), "terminal", "/bin/claude", launch)).toMatchObject({ ok: false, status: 409 });
    expect(calls).toEqual([]);
  });

  it("on Linux opens the first terminal found, in the run's folder, running claude --resume", async () => {
    const { launch, calls } = recorder("linux", { has: ["gnome-terminal", "xterm"] });
    expect(await continueRun(run(), "terminal", "/opt/claude", launch)).toEqual({ ok: true, message: "Opened in a terminal." });
    expect(calls).toEqual([{ kind: "detached", cmd: "gnome-terminal", args: [`--working-directory=${dir}`, "--", "/opt/claude", "--resume", SID], cwd: dir }]);
  });

  it("says to copy the command when no terminal can be opened", async () => {
    const { launch } = recorder("linux", { has: [] });
    expect(await continueRun(run(), "terminal", "/opt/claude", launch)).toMatchObject({ ok: false, status: 501 });
  });

  it("on Linux refuses Desktop with Claude Code's own reason, and runs nothing", async () => {
    const { launch, calls } = recorder("linux");
    expect(await continueRun(run(), "desktop", "/opt/claude", launch)).toMatchObject({ ok: false, status: 400, message: expect.stringContaining("macOS and Windows") });
    expect(calls).toEqual([]);
  });

  it("on macOS opens Terminal through osascript, and Desktop through script so claude has a terminal", async () => {
    const { launch, calls } = recorder("darwin");
    expect(await continueRun(run(), "terminal", "/opt/claude", launch)).toMatchObject({ ok: true });
    expect(calls[0]!.cmd).toBe("osascript");
    expect(calls[0]!.args[1]).toContain(`--resume ${SID}`);
    expect(await continueRun(run(), "desktop", "/opt/claude", launch)).toEqual({ ok: true, message: "Opened in Claude Desktop." });
    expect(calls[1]).toMatchObject({ kind: "run", cmd: "script", args: ["-q", "/dev/null", "/opt/claude", "--desktop", "--resume", SID] });
  });

  it("passes on Desktop's own message, without colour codes, when it fails", async () => {
    const { launch } = recorder("darwin", { runResult: { code: 1, out: "\x1b[31mSign in to Claude Desktop first.\x1b[0m\n" } });
    expect(await continueRun(run(), "desktop", "/opt/claude", launch)).toEqual({ ok: false, status: 502, message: "Sign in to Claude Desktop first." });
  });
});
