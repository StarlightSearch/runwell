import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { RunEvent } from "../shared/events";
import { FAKE_CLAUDE, FIXTURES, fakeEnv } from "../../test/fake-claude";
import { createClaudeDriver } from "./claude/driver";
import { loadConfig, saveConfig } from "./config";
import { migrate, openDb } from "./db";
import { paths } from "./paths";
import { createRunsService, type RunsDeps } from "./runs";
import type { SkillRow } from "./skills";
import { createHub } from "./sse";

const skill = (key: string, ref = key.split(":").pop()!): SkillRow => ({
  key, source: "personal", name: ref, ref, description: "", path: "/skills/" + ref, plugin: null, projectPath: null,
  warning: null, hash: "h", hasWorkflow: false, workflowNote: null, version: 1, ignored: false,
});

async function setup(opts: { fixture?: string; holdMs?: number; signedIn?: "in" | "out" | "unknown"; maxRuns?: number; projects?: { path: string; trusted: boolean }[] } = {}) {
  const p = paths(mkdtempSync(join(tmpdir(), "runwell-runs-")));
  if (opts.maxRuns) saveConfig(p, { maxRuns: opts.maxRuns });
  const db = await openDb(p.db);
  migrate(db);
  const hub = createHub();
  const published: RunEvent[] = [];
  const skills = new Map([["personal:motion-ad", skill("personal:motion-ad")], ["personal:seo", skill("personal:seo")]]);
  const fixture = opts.fixture ?? "happy";
  const fixturePath = fixture.includes("/") ? fixture : join(FIXTURES, `${fixture}.jsonl`);
  const driver = createClaudeDriver({ bin: FAKE_CLAUDE, home: p.root, extraEnv: fakeEnv({ fixture: fixturePath, holdMs: opts.holdMs }), graceMs: 100 });
  const spawned: string[] = [];
  const collected: string[] = [];
  const deps: RunsDeps = {
    paths: p, db, hub, config: () => loadConfig(p),
    driver: { ...driver, start: (spec) => (spawned.push(spec.runId), driver.start(spec)) },
    skill: (key) => skills.get(key) ?? null,
    projects: () => (opts.projects ?? []).map((x) => ({ path: x.path, name: "p", trusted: x.trusted, lastUsedAt: null, skillCount: 0 })),
    claude: async () => ({ found: true, signedIn: opts.signedIn ?? "in" }),
    workflow: async () => ({ steps: null, from: "none", note: null }),
    collectOutputs: async (run) => void collected.push(run.id),
    onRunEnd: () => {},
    pidCommand: () => null,
    now: Date.now,
  };
  const runs = createRunsService(deps);
  return { p, db, hub, runs, spawned, collected, published, deps };
}

const folder = { kind: "folder", contextProject: null } as const;
const input = (over: Partial<Parameters<ReturnType<typeof createRunsService>["start"]>[0]> = {}) =>
  ({ skillKey: "personal:motion-ad", brief: "make it", place: folder, model: null, allowAll: false, uploadIds: [], fromRun: null, ...over });

async function waitFor(fn: () => boolean, ms = 8000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("RunsService", () => {
  it("a happy run goes running then finished; events.jsonl equals what was published", async () => {
    const { runs, hub, p, collected } = await setup();
    const seen: unknown[] = [];
    const r = await runs.start(input());
    if (!r.ok) throw new Error(r.message);
    hub.subscribe([`run:${r.run.id}`], (_t, d) => seen.push(d));
    expect(r.run.id).toMatch(/^[a-z2-7]{12}$/);
    expect(r.run.cwd).toBe(p.work(r.run.id));
    await waitFor(() => runs.get(r.run.id)!.status === "finished");
    const stored = runs.events(r.run.id);
    expect(stored[0]).toMatchObject({ t: "status", status: "running" });
    expect(stored.at(-1)).toMatchObject({ t: "status", status: "finished" });
    expect(stored.some((e) => e.t === "result" && e.ok)).toBe(true);
    expect(stored.slice(-seen.length)).toEqual(seen);
    expect(collected).toEqual([r.run.id]);
    expect(existsSync(p.workflowJson(r.run.id))).toBe(true);
    expect(runs.get(r.run.id)!.endedAt).not.toBeNull();
  });

  it("n counts per skill", async () => {
    const { runs } = await setup();
    const a = await runs.start(input());
    const b = await runs.start(input());
    const c = await runs.start(input({ skillKey: "personal:seo" }));
    expect([a, b, c].map((x) => (x.ok ? x.run.n : 0))).toEqual([1, 2, 1]);
  });

  it("the run past maxRuns is queued and starts when a slot frees", async () => {
    const { runs, spawned } = await setup({ maxRuns: 1, holdMs: 400 });
    const a = await runs.start(input());
    const b = await runs.start(input());
    if (!a.ok || !b.ok) throw new Error("start failed");
    expect(runs.get(b.run.id)!.status).toBe("queued");
    expect(spawned).toEqual([a.run.id]);
    await waitFor(() => runs.get(b.run.id)!.status === "finished");
    expect(spawned).toEqual([a.run.id, b.run.id]);
  });

  it("stop gives stopped", async () => {
    const { runs } = await setup({ holdMs: 10_000 });
    const r = await runs.start(input());
    if (!r.ok) throw new Error(r.message);
    await waitFor(() => runs.get(r.run.id)!.status === "running");
    await runs.stop(r.run.id);
    await waitFor(() => runs.get(r.run.id)!.status === "stopped");
  });

  it("a process that dies with no result is failed, keeping the last events", async () => {
    const dir = mkdtempSync(join(tmpdir(), "runwell-dies-"));
    const fx = join(dir, "dies.jsonl");
    const lines = readFileSync(join(FIXTURES, "happy.jsonl"), "utf8").split("\n").filter((l) => l && !l.includes('"type": "result"') && !l.includes("__fake"));
    writeFileSync(fx, [...lines.slice(0, 6), JSON.stringify({ __fake: "exit", code: 1 })].join("\n"));
    const { runs } = await setup({ fixture: fx });
    const r = await runs.start(input());
    if (!r.ok) throw new Error(r.message);
    await waitFor(() => runs.get(r.run.id)!.status === "failed");
    expect(runs.get(r.run.id)!.error).toBe("Claude stopped without finishing");
    expect(runs.events(r.run.id).some((e) => e.t === "tool.start" || e.t === "text")).toBe(true);
  });

  it("refuses a missing project folder and an untrusted one without confirmation; spawns nothing", async () => {
    const trusted = mkdtempSync(join(tmpdir(), "runwell-proj-"));
    const { runs, spawned } = await setup({ projects: [{ path: trusted, trusted: false }] });
    expect(await runs.start(input({ place: { kind: "project", path: "/nonexistent/x", confirmedUntrusted: true } }))).toMatchObject({ ok: false, error: "folder_missing", message: "That folder no longer exists." });
    expect(await runs.start(input({ place: { kind: "project", path: trusted, confirmedUntrusted: false } }))).toMatchObject({ ok: false, error: "untrusted_folder" });
    expect(spawned).toEqual([]);
    const ok = await runs.start(input({ place: { kind: "project", path: trusted, confirmedUntrusted: true } }));
    expect(ok.ok && ok.run.cwd).toBe(trusted);
  });

  it("signed out refuses; unknown proceeds; other refusals", async () => {
    const out = await setup({ signedIn: "out" });
    expect(await out.runs.start(input())).toMatchObject({ ok: false, error: "signed_out", message: "Run `claude` in a terminal and sign in." });
    const unknown = await setup({ signedIn: "unknown" });
    expect((await unknown.runs.start(input())).ok).toBe(true);
    expect(await unknown.runs.start(input({ skillKey: "personal:nope" }))).toMatchObject({ ok: false, error: "skill_not_found" });
    expect(await unknown.runs.start(input({ brief: "x".repeat(20_001) }))).toMatchObject({ ok: false, error: "brief_too_long" });
  });

  it("an upload named ../../x.png lands as inputs/x.png; a clash gets -2", async () => {
    const { runs, p } = await setup();
    const up = (id: string, name: string) => {
      mkdirSync(join(p.runs, "_uploads", id), { recursive: true });
      writeFileSync(join(p.runs, "_uploads", id, name.replace(/^.*[\\/]/, "")), "img");
      writeFileSync(join(p.runs, "_uploads", id, ".name"), name);
    };
    up("u1", "../../x.png");
    up("u2", "x.png");
    const r = await runs.start(input({ uploadIds: ["u1", "u2"] }));
    if (!r.ok) throw new Error(r.message);
    expect(existsSync(join(p.inputs(r.run.id), "x.png"))).toBe(true);
    expect(existsSync(join(p.inputs(r.run.id), "x-2.png"))).toBe(true);
    expect(existsSync(join(p.runs, "_uploads", "u1"))).toBe(false);
  });

  it("waitingMs counts the time between ask and ask.done", async () => {
    let clock = 1000;
    const { runs, deps } = await setup({ holdMs: 10_000 });
    deps.now = () => clock;
    const r = await runs.start(input());
    if (!r.ok) throw new Error(r.message);
    await waitFor(() => runs.get(r.run.id)!.status === "running");
    runs.append(r.run.id, { t: "ask", at: clock, ask: { id: "a1", kind: "permission", toolCallId: null, agentId: null, tool: "Bash", input: {} } });
    expect(runs.get(r.run.id)!.status).toBe("waiting");
    clock += 2500;
    runs.append(r.run.id, { t: "ask.done", at: clock, id: "a1", answer: { kind: "permission", allow: true, message: null } });
    expect(runs.get(r.run.id)).toMatchObject({ status: "running", waitingMs: 2500 });
    await runs.stop(r.run.id);
  });

  it("recoverOrphans fails running rows, keeps their events, and only signals a claude process", async () => {
    const { runs, db, p, deps } = await setup();
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    for (const [id, pid] of [["orphan1", 111], ["orphan2", 222]] as const) {
      db.run("INSERT INTO runs (id, skill_key, skill_ref, n, kind, status, created_at, pid) VALUES (?, 'personal:seo', 'seo', 1, 'button', 'running', 1, ?)", id, pid);
      mkdirSync(p.runDir(id), { recursive: true });
      writeFileSync(p.events(id), JSON.stringify({ t: "text", at: 1, agentId: null, text: "hi" }) + "\n");
    }
    deps.pidCommand = (pid) => (pid === 111 ? "/usr/bin/claude -p --output-format stream-json" : "/usr/bin/vim");
    expect(runs.recoverOrphans()).toBe(2);
    expect(runs.get("orphan1")).toMatchObject({ status: "failed", error: "Runwell restarted during this run" });
    expect(runs.events("orphan1")[0]).toMatchObject({ t: "text" });
    expect(runs.events("orphan1").at(-1)).toMatchObject({ t: "status", status: "failed" });
    expect(kill).toHaveBeenCalledWith(111, "SIGTERM");
    expect(kill).not.toHaveBeenCalledWith(222, expect.anything());
    kill.mockRestore();
  });

  it("remove refuses a run in progress, and deletes a finished one", async () => {
    const { runs, p } = await setup({ holdMs: 10_000 });
    const r = await runs.start(input());
    if (!r.ok) throw new Error(r.message);
    expect(() => runs.remove(r.run.id)).toThrow();
    await runs.stop(r.run.id);
    await waitFor(() => runs.get(r.run.id)!.status === "stopped");
    runs.remove(r.run.id);
    expect(runs.get(r.run.id)).toBeNull();
    expect(existsSync(p.runDir(r.run.id))).toBe(false);
  });

  it("fromRun copies the old run's brief and inputs when the new input leaves them empty", async () => {
    const { runs, p } = await setup();
    mkdirSync(join(p.runs, "_uploads", "u1"), { recursive: true });
    writeFileSync(join(p.runs, "_uploads", "u1", "logo.png"), "img");
    const first = await runs.start(input({ brief: "first brief", uploadIds: ["u1"] }));
    if (!first.ok) throw new Error(first.message);
    await waitFor(() => runs.get(first.run.id)!.status === "finished");
    const again = await runs.start(input({ brief: "", fromRun: first.run.id }));
    if (!again.ok) throw new Error(again.message);
    expect(again.run.brief).toBe("first brief");
    expect(existsSync(join(p.inputs(again.run.id), "logo.png"))).toBe(true);
  });

  it("rate stores and clears a rating with a note", async () => {
    const { runs } = await setup();
    const r = await runs.start(input());
    if (!r.ok) throw new Error(r.message);
    runs.rate(r.run.id, 1, "nice");
    expect(runs.get(r.run.id)).toMatchObject({ rating: 1, note: "nice" });
    runs.rate(r.run.id, null, null);
    expect(runs.get(r.run.id)).toMatchObject({ rating: null, note: null });
  });
});
