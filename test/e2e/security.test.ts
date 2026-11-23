import { statSync } from "node:fs";
import { request } from "node:http";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUILT, checkHygiene, harness, type Harness } from "./harness";

const raw = (port: number, path: string, headers: Record<string, string>, method = "GET") =>
  new Promise<number>((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port, path, method, headers }, (res) => (res.resume(), resolve(res.statusCode ?? 0)));
    r.on("error", reject);
    r.end(method === "POST" ? "{}" : undefined);
  });

describe.skipIf(!BUILT)("security", () => {
  let h: Harness;
  let port: number;
  let cookie: string;
  beforeAll(async () => {
    h = await harness();
    port = Number(new URL(h.url).port);
    const { url } = (await (await h.fetchApi("/api/auth/link", { method: "POST", body: { to: "/" } })).json()) as { url: string };
    const r = await fetch(url, { redirect: "manual" });
    cookie = (r.headers.get("set-cookie") ?? "").split(";")[0]!;
  });
  afterAll(async () => {
    checkHygiene(h);
    await h.stopServer();
  });

  it("POST /api/runs with no credentials is 401", async () => {
    expect(await raw(port, "/api/runs", { "content-type": "application/json" }, "POST")).toBe(401);
  });
  it("with the cookie and a foreign Origin it is 403", async () => {
    expect(cookie).toMatch(/^rw=[0-9a-f]+$/);
    expect(await raw(port, "/api/runs", { cookie, origin: "https://evil.test", "content-type": "application/json" }, "POST")).toBe(403);
  });
  it("a foreign Host is 403", async () => {
    expect(await raw(port, "/api/skills", { host: "evil.test", authorization: `Bearer ${h.token}` })).toBe(403);
  });
  it("a bad output grant is 404", async () => {
    expect(await raw(port, `/o/badgrant/${h.seeded.runIds.video}/ad-9x16.mp4`, {})).toBe(404);
  });
  it("server.json is readable by its owner only", () => {
    expect(statSync(join(h.home, "server.json")).mode & 0o777).toBe(0o600);
  });
  const outside = Object.values(networkInterfaces()).flat().find((a) => a && !a.internal && a.family === "IPv4")?.address;
  it.skipIf(!outside)("it listens on 127.0.0.1 only", async () => {
    const refused = await new Promise<boolean>((resolve) => {
      const s = connect({ host: outside!, port }, () => (s.destroy(), resolve(false)));
      s.on("error", () => resolve(true));
    });
    expect(refused).toBe(true);
  });
});
