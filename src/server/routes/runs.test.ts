import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAKE_CLAUDE, fakeEnv } from "../../../test/fake-claude";
import { loadConfig, saveConfig } from "../config";
import { migrate, openDb } from "../db";
import { createApp } from "../http";
import { paths } from "../paths";
import { buildServices } from "../services";
import { createHub } from "../sse";

const PORT = 4796;
const TOKEN = "t".repeat(64);
const headers = { host: `127.0.0.1:${PORT}`, authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

async function setup(opts: { auth?: "in" | "out"; claudeHome?: string } = {}) {
  const p = paths(mkdtempSync(join(tmpdir(), "runwell-routes-")));
  const claudeHome = opts.claudeHome ?? mkdtempSync(join(tmpdir(), "runwell-claudehome-"));
  mkdirSync(join(claudeHome, "skills/motion-ad"), { recursive: true });
  writeFileSync(join(claudeHome, "skills/motion-ad/SKILL.md"), "---\nname: motion-ad\ndescription: ads\n---\nMake an ad.\n");
  saveConfig(p, { claudeHome });
  const db = await openDb(p.db);
  migrate(db);
  const hub = createHub();
  const ctxBase = { paths: p, config: () => loadConfig(p), db, info: { pid: 1, port: PORT, token: TOKEN, version: "0.1.0" }, hub, now: Date.now, activeRuns: () => 0 };
  const services = buildServices(ctxBase, { claudeBin: FAKE_CLAUDE, extraEnv: fakeEnv({ fixture: "happy", auth: opts.auth }), graceMs: 100, reveal: () => {} });
  services.skills.rescan();
  const app = createApp({ ...ctxBase, activeRuns: () => services.runs.activeCount() }, services.routes);
  return { app, p, services };
}
const start = (app: Awaited<ReturnType<typeof setup>>["app"], body: object = {}) =>
  app.request("/api/runs", { method: "POST", headers, body: JSON.stringify({ skillKey: "personal:motion-ad", brief: "go", place: { kind: "folder" }, ...body }) });

async function readSse(res: Response): Promise<{ events: unknown[]; ended: boolean }> {
  const text = await res.text();
  const events: unknown[] = [];
  let ended = false;
  for (const block of text.split("\n\n")) {
    const ev = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (ev === "event" && data) events.push(JSON.parse(data));
    if (ev === "end") ended = true;
  }
  return { events, ended };
}

describe("runs routes", () => {
  it("starts a run and streams its events to the end; the list equals events.jsonl; from skips", async () => {
    const { app, services } = await setup();
    const r = await start(app);
    expect(r.status).toBe(201);
    const { run } = (await r.json()) as { run: { id: string } };
    const { events, ended } = await readSse(await app.request(`/api/runs/${run.id}/events`, { headers }));
    expect(ended).toBe(true);
    expect(events).toEqual(services.runs.events(run.id));
    const skipped = await readSse(await app.request(`/api/runs/${run.id}/events?from=3`, { headers }));
    expect(skipped.events).toEqual(services.runs.events(run.id).slice(3));
    const resumed = await readSse(await app.request(`/api/runs/${run.id}/events`, { headers: { ...headers, "last-event-id": "2" } }));
    expect(resumed.events).toEqual(services.runs.events(run.id).slice(3));
    const detail = (await (await app.request(`/api/runs/${run.id}`, { headers })).json()) as { run: { status: string }; skill: { key: string }; grant: string; asks: unknown[] };
    expect(detail).toMatchObject({ run: { status: "finished" }, skill: { key: "personal:motion-ad" }, asks: [] });
    expect(detail.grant).toMatch(/^\d+\./);
    const list = (await (await app.request(`/api/runs?skill=${encodeURIComponent("personal:motion-ad")}`, { headers })).json()) as { runs: { id: string }[] };
    expect(list.runs.map((x) => x.id)).toEqual([run.id]);
    const outs = (await (await app.request(`/api/runs/${run.id}/outputs`, { headers })).json()) as { outputs: { path: string }[] };
    expect(outs.outputs.map((o) => o.path).sort()).toEqual(["notes.md", "words.txt"]);
  });

  it("rating round trips, null clears, a 2,001-character note is 400", async () => {
    const { app, services } = await setup();
    const { run } = (await (await start(app)).json()) as { run: { id: string } };
    const rate = (body: object) => app.request(`/api/runs/${run.id}/rating`, { method: "POST", headers, body: JSON.stringify(body) });
    expect((await rate({ rating: 1, note: "good" })).status).toBe(200);
    expect(services.runs.get(run.id)).toMatchObject({ rating: 1, note: "good" });
    await rate({ rating: null, note: null });
    expect(services.runs.get(run.id)).toMatchObject({ rating: null, note: null });
    expect((await rate({ rating: 1, note: "x".repeat(2001) })).status).toBe(400);
    expect((await rate({ rating: 5 })).status).toBe(400);
  });

  it("deleting a finished run removes its folder; deleting a running one is 409", async () => {
    const { app, p, services } = await setup();
    const { run } = (await (await start(app)).json()) as { run: { id: string } };
    expect((await app.request(`/api/runs/${run.id}`, { method: "DELETE", headers })).status).toBe(409);
    await readSse(await app.request(`/api/runs/${run.id}/events`, { headers }));
    while (!["finished", "failed"].includes(services.runs.get(run.id)!.status)) await new Promise((r) => setTimeout(r, 20));
    expect((await app.request(`/api/runs/${run.id}`, { method: "DELETE", headers })).status).toBe(200);
    expect(existsSync(p.runDir(run.id))).toBe(false);
  });

  it("signed out is 409 with the sign-in message", async () => {
    const { app } = await setup({ auth: "out" });
    const r = await start(app);
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "signed_out", message: "Run `claude` in a terminal and sign in." });
  });

  it("an upload is attached to the run's inputs", async () => {
    const { app, p } = await setup();
    const up = (await (await app.request("/api/uploads", { method: "POST", headers: { ...headers, "x-filename": "../logo.png", "content-type": "application/octet-stream" }, body: "png-bytes" })).json()) as { id: string; name: string; bytes: number };
    expect(up).toMatchObject({ name: "logo.png", bytes: 9 });
    const { run } = (await (await start(app, { uploadIds: [up.id] })).json()) as { run: { id: string } };
    expect(existsSync(join(p.inputs(run.id), "logo.png"))).toBe(true);
  });
});

describe("settings routes", () => {
  it("rejects port 80, reports a missing Claude folder, and says a changed port needs a restart", async () => {
    const { app } = await setup();
    expect((await app.request("/api/settings", { method: "PATCH", headers, body: JSON.stringify({ port: 80 }) })).status).toBe(400);
    const ok = (await (await app.request("/api/settings", { method: "PATCH", headers, body: JSON.stringify({ port: 5123, ignored: [" a:* ", ""] }) })).json()) as { config: { port: number; ignored: string[] }; restartNeeded: boolean };
    expect(ok).toMatchObject({ config: { port: 5123, ignored: ["a:*"] }, restartNeeded: true });
    expect((await app.request("/api/settings", { method: "PATCH", headers, body: JSON.stringify({ claudeHome: "/nonexistent/x" }) })).status).toBe(400);
    const missing = await setup();
    const { rmSync } = await import("node:fs");
    const home = (await (await missing.app.request("/api/settings", { headers })).json()) as { folders: { claudeHome: { path: string } } };
    rmSync(home.folders.claudeHome.path, { recursive: true, force: true });
    const s = (await (await missing.app.request("/api/settings", { headers })).json()) as { folders: { claudeHome: { found: boolean }; data: { bytes: number } }; version: string };
    expect(s.folders.claudeHome.found).toBe(false);
    expect(s.folders.data.bytes).toBeGreaterThan(0);
  });
});
