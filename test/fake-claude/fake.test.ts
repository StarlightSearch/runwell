import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAKE_CLAUDE, FIXTURES, fakeEnv } from "./index";

const MSG = JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "/x go" }] } });

function run(args: string[], env: Record<string, string>, opts: { input?: string; signalAfterMs?: number; signal?: NodeJS.Signals; killAfterMs?: number } = {}) {
  return new Promise<{ code: number | null; signal: string | null; stdout: string; stderr: string }>((resolve) => {
    const cwd = mkdtempSync(join(tmpdir(), "runwell-fake-"));
    const p = spawn(FAKE_CLAUDE, args, { env: { PATH: process.env.PATH ?? "", ...env }, cwd });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    if (opts.input !== undefined) p.stdin.write(opts.input);
    if (opts.signalAfterMs !== undefined) setTimeout(() => p.kill(opts.signal ?? "SIGINT"), opts.signalAfterMs);
    if (opts.killAfterMs !== undefined) setTimeout(() => p.kill("SIGKILL"), opts.killAfterMs);
    p.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

const fixtureLines = (name: string) =>
  readFileSync(join(FIXTURES, `${name}.jsonl`), "utf8").split("\n").filter((l) => l.trim() && !l.includes('"__fake"'));

describe("fake claude", () => {
  it("prints its version", async () => {
    expect((await run(["--version"], {})).stdout.trim()).toBe("2.1.330 (Claude Code)");
  });

  it("answers the auth check signed in and signed out", async () => {
    const inn = await run(["auth", "status", "--json"], fakeEnv({ fixture: "happy" }));
    expect(inn.code).toBe(0);
    expect(JSON.parse(inn.stdout).loggedIn).toBe(true);
    const out = await run(["auth", "status", "--json"], fakeEnv({ fixture: "happy", auth: "out" }));
    expect(out.code).toBe(1);
    expect(JSON.parse(out.stdout).loggedIn).toBe(false);
  });

  it("replays the fixture's lines byte for byte after the first stdin line, and logs argv and stdin", async () => {
    const log = join(mkdtempSync(join(tmpdir(), "runwell-fakelog-")), "log.jsonl");
    const r = await run(["-p", "--output-format", "stream-json", "--input-format", "stream-json", "--verbose"], fakeEnv({ fixture: "failure", log }), { input: MSG + "\n" });
    expect(r.code).toBe(0);
    expect(r.stdout.split("\n").filter(Boolean)).toEqual(fixtureLines("failure"));
    const logged = readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(logged[0].argv).toContain("-p");
    expect(logged[1].stdin).toBe(MSG);
  });

  it("refuses --bare and any credential in its environment", async () => {
    expect((await run(["-p", "--bare"], fakeEnv({ fixture: "happy" }), { input: MSG + "\n" })).code).toBe(2);
    const keyed = await run(["-p"], { ...fakeEnv({ fixture: "happy" }), ANTHROPIC_API_KEY: "x" }, { input: MSG + "\n" });
    expect(keyed.code).toBe(2);
    expect(keyed.stderr).toContain("fake claude:");
  });

  it("ends on SIGINT with a stop result line", async () => {
    const r = await run(["-p"], fakeEnv({ fixture: "happy", holdMs: 5000 }), { signalAfterMs: 300 });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('"error_during_execution"');
  });

  it("with ignoreSigint survives SIGINT and dies on SIGKILL", async () => {
    const r = await run(["-p"], fakeEnv({ fixture: "happy", ignoreSigint: true, holdMs: 5000 }), { signalAfterMs: 200, killAfterMs: 600 });
    expect(r.signal).toBe("SIGKILL");
  });
});
