import { test as base, type Page } from "@playwright/test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FAKE_CLAUDE, fakeEnv } from "../fake-claude";
import { startServer } from "../../src/server/main";
import { seed, type Seeded } from "./seed";

process.env.RUNWELL_WEB_ROOT = fileURLToPath(new URL("../../plugin/dist/web", import.meta.url));

export interface AppFixture {
  page: Page;
  base: string;
  token: string;
  seeded: Seeded;
  /** Opens a path with the session cookie already set. */
  open(path: string): Promise<void>;
  /** What "Continue in Claude" would have launched (nothing real is opened in tests). */
  launched: { cmd: string; args: string[] }[];
  api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

export const test = base.extend<{ fakeFixture: string; fakeAuth: "in" | "out"; app: AppFixture }>({
  fakeFixture: ["happy", { option: true }],
  fakeAuth: ["in", { option: true }],
  app: async ({ page, fakeFixture, fakeAuth }, use) => {
    const seeded = await seed();
    const log = join(seeded.home, "fake.log");
    const launched: { cmd: string; args: string[] }[] = [];
    const launch = {
      platform: process.platform,
      has: (c: string) => c === "xterm",
      detached: async (cmd: string, args: string[]) => (launched.push({ cmd, args }), true),
      run: async (cmd: string, args: string[]) => (launched.push({ cmd, args }), { code: 0, out: "" }),
    };
    const server = await startServer({ home: seeded.home, port: 0, services: { claudeBin: FAKE_CLAUDE, extraEnv: fakeEnv({ fixture: fakeFixture, auth: fakeAuth, log }), graceMs: 200, reveal: () => {}, launch } });
    const base = `http://127.0.0.1:${server.info.port}`;
    const api = async <T>(path: string, init: { method?: string; body?: unknown } = {}) => {
      const r = await fetch(base + path, { method: init.method ?? "GET", headers: { authorization: `Bearer ${server.info.token}`, "content-type": "application/json" }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
      return (await r.json()) as T;
    };
    const open = async (path: string) => {
      const { url } = await api<{ url: string }>("/api/auth/link", { method: "POST", body: { to: path } });
      await page.goto(url);
    };
    await use({ page, base, token: server.info.token, seeded, open, api, launched });
    await server.close();
  },
});
export { expect } from "@playwright/test";
