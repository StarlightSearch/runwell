import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { probe, readServerInfo } from "../../src/server/lifecycle";
import { paths } from "../../src/server/paths";

const PLUGIN = fileURLToPath(new URL("../../plugin", import.meta.url));
const SCRIPT = join(PLUGIN, "hooks/session-start.sh");
const BUILT = existsSync(join(PLUGIN, "dist/launcher.js"));
const pids: number[] = [];
afterAll(() => pids.forEach((p) => { try { process.kill(p); } catch { /* gone */ } }));

describe("plugin files", () => {
  it("the JSON files parse and plugin.json has the fields and package.json's version", () => {
    const pkg = JSON.parse(readFileSync(join(PLUGIN, "../package.json"), "utf8"));
    const plugin = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin/plugin.json"), "utf8"));
    expect(plugin).toMatchObject({ name: "workflows", version: pkg.version, license: "MIT" });
    expect(plugin.description).toBe("Run your skills from a button, watch them work as a live graph, and keep every run. Works with Claude Code.");
    const market = JSON.parse(readFileSync(join(PLUGIN, "../.claude-plugin/marketplace.json"), "utf8"));
    expect(market.name).toBe("workflows");
    expect(market.plugins).toEqual([expect.objectContaining({ name: "workflows", source: "./plugin" })]);
    const hooks = JSON.parse(readFileSync(join(PLUGIN, "hooks/hooks.json"), "utf8"));
    expect(hooks.modules).toEqual(["./register.js"]);
    expect(hooks.hooks.SessionStart[0].hooks[0].command).toContain("session-start.sh");
  });
});

describe.skipIf(!BUILT)("session-start.sh (needs npm run build)", () => {
  it("exits 0 at once with nothing on stdout, and starts a server that outlives it", async () => {
    const home = mkdtempSync(join(tmpdir(), "workflows-hook-"));
    const t = performance.now();
    const r = spawnSync("sh", [SCRIPT], { env: { ...process.env, WORKFLOWS_HOME: home, CLAUDE_PLUGIN_ROOT: PLUGIN }, encoding: "utf8" });
    expect(performance.now() - t).toBeLessThan(300);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    let ok = false;
    for (let i = 0; i < 50 && !ok; i++) {
      await new Promise((res) => setTimeout(res, 100));
      const info = readServerInfo(paths(home));
      if (info && (await probe(info))) (ok = true), pids.push(info.pid);
    }
    expect(ok).toBe(true);
  });

  it("with no node on PATH it exits 0 and prints the hint on stderr", () => {
    const r = spawnSync("/bin/sh", [SCRIPT], { env: { PATH: "/nonexistent", CLAUDE_PLUGIN_ROOT: PLUGIN }, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("Workflows needs Node 20 or newer");
  });
});
