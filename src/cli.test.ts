import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { FAKE_CLAUDE, fakeEnv } from "../test/fake-claude";
import { seed } from "../test/ui/seed";
import { main, resolveSkill } from "./cli";
import { readServerInfo } from "./server/lifecycle";
import { paths } from "./server/paths";

const ENTRY = fileURLToPath(new URL("../plugin/dist/server.js", import.meta.url));
const pids: number[] = [];
afterEach(() => {
  for (const pid of pids.splice(0)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* gone */
    }
  }
});

async function setup(opts: { empty?: boolean } = {}) {
  const s = await seed();
  const p = paths(s.home);
  const cfg = JSON.parse(readFileSync(p.configJson, "utf8"));
  writeFileSync(p.configJson, JSON.stringify({ ...cfg, claudePath: FAKE_CLAUDE }));
  if (opts.empty) {
    const { rmSync } = await import("node:fs");
    rmSync(p.db, { force: true });
  }
  const out: string[] = [];
  const err: string[] = [];
  const urls: string[] = [];
  const deps = { out: (x: string) => out.push(x), err: (x: string) => err.push(x), openUrl: (u: string) => urls.push(u), cwd: s.trusted, ensure: { home: s.home, serverEntry: ENTRY } };
  const run = async (...argv: string[]) => {
    const code = await main(argv, deps);
    const info = readServerInfo(p);
    if (info && !pids.includes(info.pid)) pids.push(info.pid);
    return code;
  };
  return { s, out, err, urls, run };
}

describe("resolveSkill", () => {
  const skills = [
    { key: "personal:motion-ad", ref: "motion-ad", name: "motion-ad" },
    { key: "plugin:toolkit:lint", ref: "toolkit:lint", name: "lint" },
    { key: "plugin:other:lint", ref: "other:lint", name: "lint" },
  ];
  it("matches an exact ref, then a unique name, and lists several", () => {
    expect(resolveSkill(skills, "motion-ad").skill?.key).toBe("personal:motion-ad");
    expect(resolveSkill(skills, "toolkit:lint").skill?.key).toBe("plugin:toolkit:lint");
    expect(resolveSkill(skills, "lint").candidates).toHaveLength(2);
    expect(resolveSkill(skills, "nope")).toEqual({ skill: null, candidates: [] });
  });
});

it("refuses Node older than 20 with the hint", async () => {
  const err: string[] = [];
  const code = await main(["open"], { out: () => {}, err: (x) => err.push(x), openUrl: () => {}, cwd: "/", nodeVersion: "18.19.0" });
  expect(code).toBe(1);
  expect(err[0]).toBe("Runwell needs Node 20 or newer. Install it from https://nodejs.org and try again.");
});

describe.skipIf(!existsSync(ENTRY))("the CLI against a started server (needs npm run build)", () => {
  it("open prints the address and opens a one-time link", async () => {
    const t = await setup();
    expect(await t.run("open")).toBe(0);
    expect(t.urls[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\?n=/);
    expect(t.out[0]).toMatch(/^Runwell is open at http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("run nope exits 1 with no candidates; run motion-ad hello there starts a run with that brief", async () => {
    process.env.FAKE_CLAUDE_FIXTURE = fakeEnv({ fixture: "happy" }).FAKE_CLAUDE_FIXTURE;
    const t = await setup();
    expect(await t.run("run", "nope")).toBe(1);
    expect(t.err[0]).toBe('No skill named "nope".');
    expect(await t.run("run", "motion-ad", "hello", "there")).toBe(0);
    expect(t.out.at(-1)).toMatch(/^Started motion-ad #\d+$/);
    expect(t.urls.at(-1)).toMatch(/\/auth\?n=.*to=%2Fruns%2F/);
    const info = readServerInfo(paths(t.s.home))!;
    const r = await fetch(`http://127.0.0.1:${info.port}/api/runs?limit=1`, { headers: { authorization: `Bearer ${info.token}` } });
    const { runs } = (await r.json()) as { runs: { brief: string }[] };
    expect(runs[0]!.brief).toBe("hello there");
  });

  it("last opens the newest run for the folder, and says No runs yet. when there are none", async () => {
    const t = await setup();
    expect(await t.run("last", "--cwd", t.s.trusted)).toBe(0);
    expect(t.out[0]).toBe("Opened old-skill #1");
    const e = await setup({ empty: true });
    expect(await e.run("last")).toBe(0);
    expect(e.out[0]).toBe("No runs yet.");
    expect(e.urls[0]).toMatch(/to=%2Fruns$/);
  });

  it("ensure exits 0 at once", async () => {
    const t = await setup();
    const at = performance.now();
    expect(await t.run("ensure")).toBe(0);
    expect(performance.now() - at).toBeLessThan(300);
    // Let the detached server come up so afterEach can stop it.
    for (let i = 0; i < 50 && !readServerInfo(paths(t.s.home)); i++) await new Promise((r) => setTimeout(r, 100));
    pids.push(readServerInfo(paths(t.s.home))!.pid);
  });
});
