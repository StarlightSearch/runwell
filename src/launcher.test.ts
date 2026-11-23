import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { FAKE_CLAUDE, fakeEnv } from "../test/fake-claude";
import { seed } from "../test/ui/seed";
import { ensureServer } from "./launcher";
import { probe, readServerInfo } from "./server/lifecycle";
import { startServer } from "./server/main";
import { paths } from "./server/paths";

const ENTRY = fileURLToPath(new URL("../plugin/dist/server.js", import.meta.url));
const started: number[] = [];
const kill = (pid: number) => {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* gone */
  }
};
afterEach(() => started.splice(0).forEach(kill));

async function home() {
  const s = await seed();
  const cfg = JSON.parse(readFileSync(paths(s.home).configJson, "utf8"));
  writeFileSync(paths(s.home).configJson, JSON.stringify({ ...cfg, claudePath: FAKE_CLAUDE }));
  return s.home;
}
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe.skipIf(!existsSync(ENTRY))("ensureServer (needs npm run build)", () => {
  it("starts a detached server, and a second call reuses the same pid", async () => {
    const h = await home();
    const a = await ensureServer({ home: h, wait: true, serverEntry: ENTRY });
    expect(a).not.toBeNull();
    started.push(a!.pid);
    const b = await ensureServer({ home: h, wait: true, serverEntry: ENTRY });
    expect(b!.pid).toBe(a!.pid);
    expect(alive(a!.pid)).toBe(true);
  });

  it("returns at once with wait: false, and the server answers within 5 seconds", async () => {
    const h = await home();
    const t = performance.now();
    expect(await ensureServer({ home: h, wait: false, serverEntry: ENTRY })).toBeNull();
    expect(performance.now() - t).toBeLessThan(300);
    let info = null;
    for (let i = 0; i < 50 && !(info && (await probe(info))); i++) {
      await new Promise((r) => setTimeout(r, 100));
      info = readServerInfo(paths(h));
    }
    expect(info && (await probe(info))).toBeTruthy();
    started.push(info!.pid);
  });

  it("a server.json naming a dead pid starts a new server", async () => {
    const h = await home();
    writeFileSync(paths(h).serverJson, JSON.stringify({ pid: 999999, port: 1, token: "x", version: "0.1.0" }));
    const a = await ensureServer({ home: h, wait: true, serverEntry: ENTRY });
    expect(a!.pid).not.toBe(999999);
    started.push(a!.pid);
  });

  it("launcher.js hands a replace to a detached copy and exits at once", async () => {
    const h = await home();
    let shut = false;
    const old = await startServer({ home: h, port: 0, onShutdown: () => (shut = true) });
    const LAUNCHER = fileURLToPath(new URL("../plugin/dist/launcher.js", import.meta.url));
    const t = performance.now();
    // Async: the "old" server lives in this test process and must keep answering.
    const code = await new Promise<number | null>((res) => spawn(process.execPath, [LAUNCHER], { env: { ...process.env, RUNWELL_HOME: h }, stdio: "ignore" }).on("exit", res));
    expect(code).toBe(0);
    expect(performance.now() - t).toBeLessThan(1500);
    let info = null;
    for (let i = 0; i < 80; i++) {
      await new Promise((res) => setTimeout(res, 100));
      info = readServerInfo(paths(h));
      if (shut && info && info.pid !== old.info.pid && (await probe(info))) break;
    }
    expect(shut).toBe(true);
    expect(info!.pid).not.toBe(old.info.pid);
    started.push(info!.pid);
  }, 15_000);

  it("replaces an older idle server, and reuses an older one that is in a run", async () => {
    const h = await home();
    let shut = false;
    const old = await startServer({ home: h, port: 0, onShutdown: () => (shut = true) });
    const a = await ensureServer({ home: h, wait: true, serverEntry: ENTRY, version: "9.9.9" });
    expect(shut).toBe(true);
    expect(a!.pid).not.toBe(old.info.pid);
    started.push(a!.pid);

    const h2 = await home();
    const busy = await startServer({ home: h2, port: 0, services: { claudeBin: FAKE_CLAUDE, extraEnv: fakeEnv({ fixture: "slow" }), graceMs: 200 } });
    const r = await busy.services.runs.start({ skillKey: "personal:motion-ad", brief: "x", place: { kind: "folder", contextProject: null }, model: null, allowAll: false, uploadIds: [], fromRun: null });
    expect(r.ok).toBe(true);
    const b = await ensureServer({ home: h2, wait: true, serverEntry: ENTRY, version: "9.9.9" });
    expect(b!.pid).toBe(busy.info.pid);
    await busy.close();
  });
});
