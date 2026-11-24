import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config";
import { migrate, openDb, type Db } from "./db";
import { createApp, type Ctx } from "./http";
import { startServer } from "./main";
import { paths } from "./paths";
import { createHub } from "./sse";

const TOKEN = "a".repeat(64);

/** A Workflows home whose config points at an empty Claude folder, so tests never read the real ~/.claude. */
function isolatedHome(): string {
  const home = mkdtempSync(join(tmpdir(), "workflows-main-"));
  writeFileSync(join(home, "config.json"), JSON.stringify({ claudeHome: mkdtempSync(join(tmpdir(), "workflows-emptyclaude-")) }));
  return home;
}
const PORT = 47999;
const H = `127.0.0.1:${PORT}`;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SESSION = "5e".repeat(16);
let app: ReturnType<typeof createApp>;
let db: Db;
let clock = 1_000_000;

beforeAll(async () => {
  const p = paths(mkdtempSync(join(tmpdir(), "workflows-sec-")));
  db = await openDb(p.db);
  migrate(db);
  db.run("INSERT INTO auth_sessions (id, created_at) VALUES (?, ?)", SESSION, 1);
  const ctx: Ctx = { paths: p, config: () => loadConfig(p), db, info: { pid: process.pid, port: PORT, token: TOKEN, version: "0.1.0" }, hub: createHub(), now: () => clock, activeRuns: () => 0 };
  app = createApp(ctx);
});

const bearer = { host: H, authorization: `Bearer ${TOKEN}` };

describe("security", () => {
  it.each([
    ["no credentials", { headers: { host: H } }, 401],
    ["bearer", { headers: bearer }, 200],
    ["wrong token", { headers: { host: H, authorization: `Bearer ${"b".repeat(64)}` } }, 401],
    ["wrong host (DNS rebinding)", { headers: { host: "evil.test", authorization: `Bearer ${TOKEN}` } }, 403],
    ["localhost host", { headers: { host: `localhost:${PORT}`, authorization: `Bearer ${TOKEN}` } }, 200],
    ["cookie GET", { headers: { host: H, cookie: `rw=${SESSION}` } }, 200],
    ["unknown cookie", { headers: { host: H, cookie: "rw=nope" } }, 401],
  ])("%s", async (_n, init, status) => expect((await app.request("/api/ping", init)).status).toBe(status));

  it.each(["/%61pi/ping", "/%61%70%69/ping", "//api/ping", "/API/ping", "/api%2Fping", "/%2561pi/ping"])("an encoded or doubled path to the API still needs credentials: %s", async (path) => {
    const r = await app.request(path, { headers: { host: H } });
    expect([400, 401, 404]).toContain(r.status);
    expect(r.status).not.toBe(200);
  });
  it("a browser session older than 7 days is refused", async () => {
    const saved = clock;
    clock = 1 + 7 * 24 * 60 * 60 * 1000 + 1;
    expect((await app.request("/api/ping", { headers: { host: H, cookie: `rw=${SESSION}` } })).status).toBe(401);
    clock = saved;
  });
  it("a server start forgets every browser session", async () => {
    const home = isolatedHome();
    const p = paths(home);
    const d = await openDb(p.db);
    migrate(d);
    d.run("INSERT INTO auth_sessions (id, created_at) VALUES (?, ?)", SESSION, Date.now());
    d.close();
    const s = await startServer({ home, port: 0 });
    const r = await fetch(`http://127.0.0.1:${s.info.port}/api/ping`, { headers: { cookie: `rw=${SESSION}` } });
    expect(r.status).toBe(401);
    await s.close();
  });
  it("a path that cannot be decoded is refused", async () => {
    expect((await app.request("/%E0%A4%A", { headers: { host: H } })).status).toBe(400);
  });

  it("a cookie POST from another origin is refused", async () => {
    const r = await app.request("/api/ping", { method: "POST", headers: { host: H, cookie: `rw=${SESSION}`, origin: "https://evil.test" } });
    expect(r.status).toBe(403);
  });
  it("a cookie POST with no Origin is refused", async () => {
    const r = await app.request("/api/ping", { method: "POST", headers: { host: H, cookie: `rw=${SESSION}` } });
    expect(r.status).toBe(403);
  });
  it("an Origin of null (a sandboxed frame) is refused", async () => {
    const r = await app.request("/api/ping", { method: "POST", headers: { host: H, cookie: `rw=${SESSION}`, origin: "null" } });
    expect(r.status).toBe(403);
  });
  it("a cookie POST from the page's own origin is allowed", async () => {
    const r = await app.request("/api/ping", { method: "POST", headers: { host: H, cookie: `rw=${SESSION}`, origin: ORIGIN } });
    expect(r.status).toBe(200);
  });
  it("security headers are on every response", async () => {
    const r = await app.request("/api/ping", { headers: bearer });
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
  });
});

describe("one-time link", () => {
  const link = async (to: string) => {
    const r = await app.request("/api/auth/link", { method: "POST", headers: { ...bearer, "content-type": "application/json" }, body: JSON.stringify({ to }) });
    return new URL(((await r.json()) as { url: string }).url);
  };

  it("works once and sets an HttpOnly SameSite=Strict cookie", async () => {
    const u = await link("/runs/abc");
    expect(u.origin).toBe(ORIGIN);
    const first = await app.request(u.pathname + u.search, { headers: { host: H } });
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toBe("/runs/abc");
    const cookie = first.headers.get("set-cookie")!;
    expect(cookie).toMatch(/rw=[0-9a-f]+/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    const id = /rw=([0-9a-f]+)/.exec(cookie)![1];
    expect((await app.request("/api/ping", { headers: { host: H, cookie: `rw=${id}` } })).status).toBe(200);
    const second = await app.request(u.pathname + u.search, { headers: { host: H } });
    expect(second.status).toBe(403);
    expect(await second.text()).toBe("This link has expired. Run /workflows again.");
  });

  it("a link older than 60 seconds is refused", async () => {
    const u = await link("/");
    clock += 61_000;
    expect((await app.request(u.pathname + u.search, { headers: { host: H } })).status).toBe(403);
  });

  it("to=//evil.test is replaced by /", async () => {
    const u = await link("//evil.test");
    expect(u.searchParams.get("to")).toBe("/");
  });

  it("the link route needs the bearer token, not a cookie", async () => {
    const r = await app.request("/api/auth/link", { method: "POST", headers: { host: H, cookie: `rw=${SESSION}`, origin: ORIGIN, "content-type": "application/json" }, body: "{}" });
    expect(r.status).toBe(401);
  });
});

describe("health", () => {
  it("answers without credentials and carries no token", async () => {
    const r = await app.request("/health", { headers: { host: H } });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({ ok: true, version: "0.1.0", activeRuns: 0, pid: process.pid });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });
});

describe("startServer", () => {
  it("binds 127.0.0.1 only", async () => {
    vi.stubEnv("WORKFLOWS_HOME", isolatedHome());
    const s = await startServer({ port: 0 });
    expect((s.server.address() as AddressInfo).address).toBe("127.0.0.1");
    const r = await fetch(`http://127.0.0.1:${s.info.port}/health`);
    expect(r.status).toBe(200);
    await s.close();
    vi.unstubAllEnvs();
  });
});

describe("long-held requests", () => {
  it("the server does not cut requests at Node's default 5 minutes", async () => {
    vi.stubEnv("WORKFLOWS_HOME", isolatedHome());
    const s = await startServer({ port: 0 });
    expect(s.server.requestTimeout).toBe(0);
    await s.close();
    vi.unstubAllEnvs();
  });
});
