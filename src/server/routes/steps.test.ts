import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../shared/events";
import { loadConfig } from "../config";
import { migrate, openDb } from "../db";
import { createApp } from "../http";
import { paths } from "../paths";
import type { RunRow } from "../runs";
import { createHub } from "../sse";
import { stepsRoutes } from "./steps";

async function app(status: RunRow["status"]) {
  const p = paths(mkdtempSync(join(tmpdir(), "workflows-steps-")));
  const db = await openDb(p.db);
  migrate(db);
  const session = "ab".repeat(16);
  db.run("INSERT INTO auth_sessions (id, created_at) VALUES (?, 1)", session);
  const appended: RunEvent[] = [];
  const runs = { get: (id: string) => (id === "r1" ? ({ id, status } as RunRow) : null), append: (_id: string, e: RunEvent) => void appended.push(e) };
  const a = createApp({ paths: p, config: () => loadConfig(p), db, info: { pid: 1, port: 4793, token: "t".repeat(64), version: "0.1.0" }, hub: createHub(), now: () => 5, activeRuns: () => 0 }, [stepsRoutes(runs)]);
  const post = (path: string, body: unknown, auth: "bearer" | "cookie" = "bearer") =>
    a.request(path, {
      method: "POST",
      headers: { host: "127.0.0.1:4793", "content-type": "application/json", ...(auth === "bearer" ? { authorization: `Bearer ${"t".repeat(64)}` } : { cookie: `rw=${session}`, origin: "http://127.0.0.1:4793" }) },
      body: JSON.stringify(body),
    });
  return { post, appended };
}

describe("steps route", () => {
  it("appends a step event", async () => {
    const { post, appended } = await app("running");
    expect((await post("/api/runs/r1/steps", { stepId: "s1", status: "started" })).status).toBe(200);
    expect(appended).toEqual([{ t: "step", at: 5, stepId: "s1", status: "started", note: null }]);
  });
  it("refuses a bad step id and a bad status with 400", async () => {
    const { post, appended } = await app("running");
    expect((await post("/api/runs/r1/steps", { stepId: "../x", status: "done" })).status).toBe(400);
    expect((await post("/api/runs/r1/steps", { stepId: "s1", status: "nope" })).status).toBe(400);
    expect(appended).toEqual([]);
  });
  it("cuts a long note to 300 characters", async () => {
    const { post, appended } = await app("waiting");
    await post("/api/runs/r1/steps", { stepId: "s1", status: "done", note: "n".repeat(500) });
    expect((appended[0] as { note: string }).note).toHaveLength(300);
  });
  it("is bearer only; 404 for an unknown run; 409 once a run has ended", async () => {
    expect((await (await app("running")).post("/api/runs/r1/steps", { stepId: "s1", status: "done" }, "cookie")).status).toBe(401);
    expect((await (await app("running")).post("/api/runs/zz/steps", { stepId: "s1", status: "done" })).status).toBe(404);
    expect((await (await app("finished")).post("/api/runs/r1/steps", { stepId: "s1", status: "done" })).status).toBe(409);
  });
});
