import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { describe, expect, it } from "vitest";
import type { AskAnswer, RunEvent } from "../shared/events";
import { FAKE_CLAUDE, fakeEnv } from "../../test/fake-claude";
import { createAskBroker } from "./asks";
import { createClaudeDriver } from "./claude/driver";
import { loadConfig } from "./config";
import { migrate, openDb } from "./db";
import { createApp } from "./http";
import { acquire } from "./lifecycle";
import { paths } from "./paths";
import { asksRoutes } from "./routes/asks";
import { stepsRoutes } from "./routes/steps";
import { createRunsService, type RunRow } from "./runs";
import type { SkillRow } from "./skills";
import { createHub } from "./sse";

const RUN = "run1";
const perm = { kind: "permission" as const, toolCallId: "t1", agentId: null, tool: "Bash", input: { command: "npm i" } };
const allow: AskAnswer = { kind: "permission", allow: true, message: null };

function unitBroker() {
  const appended: RunEvent[] = [];
  let status: RunRow["status"] = "running";
  const broker = createAskBroker({ append: (_id, e) => void appended.push(e), status: () => status, agentOfCall: () => null, now: () => 1 });
  return { broker, appended, end: () => (status = "finished") };
}

describe("AskBroker", () => {
  it("an opened ask is answered once", async () => {
    const { broker, appended } = unitBroker();
    const { id, answer } = broker.open(RUN, perm);
    expect(appended[0]).toMatchObject({ t: "ask", ask: { id, kind: "permission", tool: "Bash" } });
    expect(broker.answer(RUN, id, allow)).toBe("ok");
    expect(await answer).toEqual(allow);
    expect(broker.answer(RUN, id, { kind: "permission", allow: false, message: null })).toBe("gone");
    expect(appended.filter((e) => e.t === "ask.done")).toHaveLength(1);
  });

  it("a question answer for a permission ask is a mismatch, and stays pending", () => {
    const { broker } = unitBroker();
    const { id } = broker.open(RUN, perm);
    expect(broker.answer(RUN, id, { kind: "question", answers: {} })).toBe("mismatch");
    expect(broker.pending(RUN).map((a) => a.id)).toEqual([id]);
  });

  it("closing the run resolves its asks with null", async () => {
    const { broker, appended } = unitBroker();
    const { answer } = broker.open(RUN, perm);
    broker.closeRun(RUN);
    expect(await answer).toBeNull();
    expect(appended.at(-1)).toMatchObject({ t: "ask.done", answer: null });
    expect(broker.pending(RUN)).toEqual([]);
  });

  it("an answer for an unknown run or ask is gone, never a throw", () => {
    const { broker } = unitBroker();
    expect(broker.answer("nope", "x", allow)).toBe("gone");
    broker.open(RUN, perm);
    expect(broker.answer(RUN, "x", allow)).toBe("gone");
  });

  it("fills in the agent from the tool call when the transport does not know it", () => {
    const appended: RunEvent[] = [];
    const broker = createAskBroker({ append: (_id, e) => void appended.push(e), status: () => "running", agentOfCall: (_r, call) => (call === "t1" ? "A1" : null), now: () => 1 });
    broker.open(RUN, perm);
    expect((appended[0] as { ask: { agentId: string } }).ask.agentId).toBe("A1");
  });
});

const skill: SkillRow = { key: "personal:x", source: "personal", name: "x", ref: "x", description: "", path: "/x", plugin: null, projectPath: null, warning: null, hash: "h", hasWorkflow: false, workflowNote: null, version: 1, ignored: false };

/** A real server on a port with server.json written, so the fake's ask lines reach the routes. */
async function stack(fixture: string) {
  const p = paths(mkdtempSync(join(tmpdir(), "runwell-asks-")));
  const db = await openDb(p.db);
  migrate(db);
  const lock = (await acquire(p, 0, "0.1.0"))!;
  const hub = createHub();
  const log = join(p.root, "fake.log");
  let broker: ReturnType<typeof createAskBroker>;
  const runs = createRunsService({
    paths: p, db, hub, config: () => loadConfig(p),
    driver: createClaudeDriver({ bin: FAKE_CLAUDE, home: p.root, extraEnv: fakeEnv({ fixture, log }), graceMs: 100 }),
    skill: () => skill, projects: () => [], claude: async () => ({ found: true, signedIn: "in" }),
    workflow: async () => ({ steps: null, from: "none", note: null }), collectOutputs: async () => {},
    onRunEnd: (id) => broker.closeRun(id), pidCommand: () => null, now: Date.now,
  });
  broker = createAskBroker({ append: runs.append, status: (id) => runs.get(id)?.status ?? null, agentOfCall: () => null, now: Date.now });
  const app = createApp({ paths: p, config: () => loadConfig(p), db, info: lock.info, hub, now: Date.now, activeRuns: () => runs.activeCount() }, [stepsRoutes(runs), asksRoutes(broker, runs)]);
  const server = serve({ fetch: app.fetch, port: lock.info.port, hostname: "127.0.0.1" });
  const base = `http://127.0.0.1:${lock.info.port}`;
  const headers = { authorization: `Bearer ${lock.info.token}`, "content-type": "application/json" };
  const close = () => new Promise<void>((r) => server.close(() => (lock.release(), r())));
  return { runs, broker, base, headers, close, log };
}
async function waitFor<T>(fn: () => T | null | undefined | false, ms = 8000): Promise<T> {
  const t = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("asks routes and end to end", () => {
  it("the question fixture pauses, the page's answer resumes it, and the run finishes", async () => {
    const s = await stack("question");
    try {
      const r = await s.runs.start({ skillKey: skill.key, brief: "go", place: { kind: "folder", contextProject: null }, model: null, allowAll: false, uploadIds: [], fromRun: null });
      if (!r.ok) throw new Error(r.message);
      const id = r.run.id;
      await waitFor(() => s.runs.get(id)!.status === "waiting");
      const listed = (await (await fetch(`${s.base}/api/runs/${id}/asks`, { headers: s.headers })).json()) as { asks: { id: string; kind: string; questions: { question: string }[] }[] };
      expect(listed.asks).toHaveLength(1);
      const ask = listed.asks[0]!;
      expect(ask.kind).toBe("question");
      await new Promise((res) => setTimeout(res, 50));
      const answers = { [ask.questions[0]!.question]: "b.txt" };
      const wrong = await fetch(`${s.base}/api/runs/${id}/asks/${ask.id}/answer`, { method: "POST", headers: s.headers, body: JSON.stringify({ kind: "permission", allow: true, message: null }) });
      expect(wrong.status).toBe(400);
      const ok = await fetch(`${s.base}/api/runs/${id}/asks/${ask.id}/answer`, { method: "POST", headers: s.headers, body: JSON.stringify({ kind: "question", answers }) });
      expect(ok.status).toBe(200);
      const again = await fetch(`${s.base}/api/runs/${id}/asks/${ask.id}/answer`, { method: "POST", headers: s.headers, body: JSON.stringify({ kind: "question", answers }) });
      expect(again.status).toBe(409);
      await waitFor(() => s.runs.get(id)!.status === "finished");
      expect(s.runs.get(id)!.waitingMs).toBeGreaterThan(0);
      const answered = readFileSync(s.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((l) => "answered" in l);
      expect(answered.answered).toEqual({ kind: "question", answers });
    } finally {
      await s.close();
    }
  });

  it("a denied permission reaches the fake as deny and the run carries on", async () => {
    const s = await stack("permission");
    try {
      const r = await s.runs.start({ skillKey: skill.key, brief: "go", place: { kind: "folder", contextProject: null }, model: null, allowAll: false, uploadIds: [], fromRun: null });
      if (!r.ok) throw new Error(r.message);
      const id = r.run.id;
      const ask = await waitFor(() => s.broker.pending(id)[0]);
      const res = await fetch(`${s.base}/api/runs/${id}/asks/${ask.id}/answer`, { method: "POST", headers: s.headers, body: JSON.stringify({ kind: "permission", allow: false, message: "no" }) });
      expect(res.status).toBe(200);
      await waitFor(() => s.runs.get(id)!.status === "finished");
      const answered = readFileSync(s.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((l) => "answered" in l);
      expect(answered.answered).toEqual({ kind: "permission", allow: false, message: "no" });
    } finally {
      await s.close();
    }
  });

  it("stopping the run closes its asks and the long poll returns null", async () => {
    const s = await stack("question");
    try {
      const r = await s.runs.start({ skillKey: skill.key, brief: "go", place: { kind: "folder", contextProject: null }, model: null, allowAll: false, uploadIds: [], fromRun: null });
      if (!r.ok) throw new Error(r.message);
      const id = r.run.id;
      await waitFor(() => s.broker.pending(id)[0]);
      await s.runs.stop(id);
      await waitFor(() => s.runs.get(id)!.status === "stopped");
      expect(s.broker.pending(id)).toEqual([]);
      const answered = await waitFor(() => readFileSync(s.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((l) => "answered" in l), 3000).catch(() => ({ answered: "killed-before-reply" }));
      expect([null, "killed-before-reply"]).toContain(answered.answered);
    } finally {
      await s.close();
    }
  });

  it("the long poll is bearer only, and refuses an ended run", async () => {
    const s = await stack("happy");
    try {
      const r = await s.runs.start({ skillKey: skill.key, brief: "go", place: { kind: "folder", contextProject: null }, model: null, allowAll: false, uploadIds: [], fromRun: null });
      if (!r.ok) throw new Error(r.message);
      await waitFor(() => s.runs.get(r.run.id)!.status === "finished");
      const res = await fetch(`${s.base}/api/runs/${r.run.id}/asks`, { method: "POST", headers: s.headers, body: JSON.stringify(perm) });
      expect(res.status).toBe(409);
      const unknown = await fetch(`${s.base}/api/runs/zzzz/asks/x/answer`, { method: "POST", headers: s.headers, body: JSON.stringify(allow) });
      expect(unknown.status).toBe(409);
    } finally {
      await s.close();
    }
  });
});
