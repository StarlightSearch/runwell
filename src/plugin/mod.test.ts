import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

const BUILT = fileURLToPath(new URL("../../plugin/hooks/register.js", import.meta.url));
type Hook = (...a: unknown[]) => Promise<unknown>;

async function load(opts: { run?: (argv: readonly string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }> } = {}) {
  const mod = await import(`${pathToFileURL(BUILT).href}?t=${Math.random()}`);
  const hooks = new Map<string, Hook>();
  mod.register((event: string, a: unknown, b?: unknown) => hooks.set(event, (b ?? a) as Hook));
  const store = new Map<string, unknown>();
  const $ = {
    process: { run: vi.fn(opts.run ?? (async () => ({ exitCode: 0, stdout: "", stderr: "" }))) },
    command: { register: vi.fn(async (_c: unknown) => ({})) },
    session: { cwd: vi.fn(async () => "/home/me/project") },
    store: { get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => void store.set(k, v) },
    env: { get: async () => "/home/me" },
    fs: { read: async () => { throw new Error("no file"); } },
    ui: { toast: vi.fn((_t: string) => {}) },
  };
  return { hooks, $ };
}

describe("the built mod", () => {
  it("at session start runs the launcher once, registers /runwell only, and returns fast", async () => {
    const { hooks, $ } = await load();
    const next = vi.fn(async () => "done");
    const t = performance.now();
    expect(await hooks.get("session.start")!($, {}, next)).toBe("done");
    expect(performance.now() - t).toBeLessThan(20);
    expect($.process.run).toHaveBeenCalledTimes(1);
    expect(($.process.run.mock.calls[0]![0] as string[])[1]).toMatch(/\/dist\/launcher\.js$/);
    expect($.command.register).toHaveBeenCalledTimes(1);
    expect($.command.register.mock.calls[0]![0]).toMatchObject({ name: "runwell", immediate: true });
    expect([...hooks.keys()].sort()).toEqual(["command.run", "session.start"]);
  });

  it("a launcher that cannot start never throws out of the hook, and the Node hint shows once", async () => {
    const { hooks, $ } = await load({ run: async () => { throw new Error("ENOENT"); } });
    const next = vi.fn(async () => "done");
    await expect(hooks.get("session.start")!($, {}, next)).resolves.toBe("done");
    await hooks.get("session.start")!($, {}, next);
    expect($.ui.toast).toHaveBeenCalledTimes(1);
    expect($.ui.toast.mock.calls[0]![0]).toContain("Node 20 or newer");
  });

  it("/runwell runs the CLI: open, last with the session folder, and run with the brief", async () => {
    const { hooks, $ } = await load({ run: async () => ({ exitCode: 0, stdout: "Started motion-ad #3\n", stderr: "" }) });
    // (a multi-line answer, like the list of skills, is shown whole: see the next test)
    const cmd = hooks.get("command.run")!;
    await cmd($, { args: "" });
    expect(($.process.run.mock.calls[0]![0] as string[]).slice(2)).toEqual(["open"]);
    await cmd($, { args: "last" });
    expect(($.process.run.mock.calls[1]![0] as string[]).slice(2)).toEqual(["last", "--cwd", "/home/me/project"]);
    const r = await cmd($, { args: "run motion-ad make a 15s ad" });
    expect(($.process.run.mock.calls[2]![0] as string[]).slice(2)).toEqual(["run", "motion-ad", "make a 15s ad", "--cwd", "/home/me/project"]);
    expect(r).toEqual({ text: "Started motion-ad #3", isTextDisplayOnly: true });
    expect(await cmd($, { args: "improve" })).toMatchObject({ text: expect.stringContaining("Usage") });
    await cmd($, { args: "run" });
    expect(($.process.run.mock.calls.at(-1)![0] as string[]).slice(2)).toEqual(["run"]);
  });

  it("finds its own files from a plugin folder whose path has a space and an accent", async () => {
    const { cpSync, mkdirSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = join(mkdtempSync(join(tmpdir(), "runwell-mod-")), "José plugins", "runwell");
    mkdirSync(join(root, "hooks"), { recursive: true });
    cpSync(BUILT, join(root, "hooks", "register.js"));
    const mod = await import(pathToFileURL(join(root, "hooks", "register.js")).href);
    const hooks = new Map<string, Hook>();
    mod.register((event: string, a: unknown, b?: unknown) => hooks.set(event, (b ?? a) as Hook));
    const run = vi.fn(async () => ({ exitCode: 0, stdout: "", stderr: "" }));
    const $ = { process: { run }, command: { register: async () => ({}) }, store: { get: async () => true, set: async () => {} }, ui: { toast: () => {} } };
    await hooks.get("session.start")!($, {}, async () => "done");
    expect((run.mock.calls[0] as unknown as [string[]])[0][1]).toBe(join(root, "dist", "launcher.js"));
  });

  it("shows a multi-line answer whole", async () => {
    const list = "Skills you can run (2). Use /runwell run <skill> [brief]\npersonal: motion-ad\nplugin toolkit: toolkit:lint";
    const { hooks, $ } = await load({ run: async () => ({ exitCode: 0, stdout: `${list}\n`, stderr: "" }) });
    expect(await hooks.get("command.run")!($, { args: "run" })).toEqual({ text: list, isTextDisplayOnly: true });
  });

  it("stays small, has no imports, logs nothing and fetches nothing", () => {
    const src = readFileSync(BUILT, "utf8");
    expect(src.split("\n").filter((l) => l.trim()).length).toBeLessThan(300);
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toContain("console.");
    expect(src).not.toContain("fetch(");
  });
});
