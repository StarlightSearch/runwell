import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../shared/events";
import { FAKE_CLAUDE, FIXTURES, fakeEnv } from "../../../test/fake-claude";
import { DECISIONS } from "./decisions";
import { buildArgv, createClaudeDriver, firstMessage, systemPrompt, type RunSpec } from "./driver";

function setup(fixture: string, extra: Record<string, string | boolean | number> = {}) {
  const root = mkdtempSync(join(tmpdir(), "workflows-drv-"));
  const runDir = join(root, "runs", "r1");
  const work = join(runDir, "work");
  mkdirSync(join(runDir, "inputs"), { recursive: true });
  mkdirSync(work, { recursive: true });
  writeFileSync(join(runDir, "inputs", "logo.png"), "png");
  const log = join(root, "fake.log");
  const spec: RunSpec = {
    runId: "r1", runDir, cwd: work, skillRef: "motion-ad", brief: "A 15 second ad", inputs: [join(runDir, "inputs", "logo.png")],
    editFolder: work, addDir: null, model: null, allowAll: false, mode: "ask",
    steps: [{ id: "s1", title: "Brief and landing page", detail: "", kind: "action" }], mcpConfigPath: join(runDir, "mcp.json"),
  };
  const env = fakeEnv({ fixture, log, ignoreSigint: extra.ignoreSigint === true, holdMs: typeof extra.holdMs === "number" ? extra.holdMs : undefined });
  const driver = createClaudeDriver({ bin: FAKE_CLAUDE, home: root, extraEnv: env, graceMs: 100 });
  const logged = () => readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { spec, driver, logged, root };
}
async function drain(events: AsyncIterable<RunEvent>) {
  const out: RunEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

describe("argv and prompt", () => {
  it("spawns claude -p in stream-json mode with the prompt, MCP config and permission tool, never --bare", async () => {
    const { spec, driver, logged } = setup("happy");
    const h = driver.start(spec);
    await drain(h.events);
    await h.done;
    const argv: string[] = logged()[0].argv;
    expect(argv).toEqual(expect.arrayContaining(["-p", "--output-format", "stream-json", "--input-format", "stream-json", "--verbose"]));
    expect(argv).not.toContain("--bare");
    expect(argv[argv.indexOf("--append-system-prompt") + 1]).toContain("Run id: r1");
    expect(argv[argv.indexOf("--mcp-config") + 1]).toBe(spec.mcpConfigPath);
    expect(argv[argv.indexOf("--permission-prompt-tool") + 1]).toBe("mcp__workflows__workflows_permission");
    expect(argv[argv.indexOf("--allowedTools") + 1]).toBe("mcp__workflows__workflows_step");
  });

  it("sends the skill invocation and the attached paths as the first message", async () => {
    const { spec, driver, logged } = setup("happy");
    const h = driver.start(spec);
    await drain(h.events);
    await h.done;
    const msg = JSON.parse(logged()[1].stdin);
    const text: string = msg.message.content[0].text;
    expect(text.startsWith("/motion-ad A 15 second ad")).toBe(true);
    expect(text).toContain(`Attached files:\n${spec.inputs[0]}`);
  });

  it("a fresh-folder run pre-allows edits inside the run folder only", () => {
    const { spec } = setup("happy");
    const argv = buildArgv(spec, DECISIONS);
    const settings = JSON.parse(readFileSync(argv[argv.indexOf("--settings") + 1]!, "utf8"));
    expect(settings).toEqual(DECISIONS.folderRule(spec.editFolder!));
    expect(settings.permissions.allow[0]).toBe(`Edit(/${spec.editFolder}/**)`);
    expect(argv).not.toContain("bypassPermissions");
  });

  it("allowAll adds the bypass flag and no permission tool", () => {
    const { spec } = setup("happy");
    const argv = buildArgv({ ...spec, allowAll: true }, DECISIONS);
    expect(argv).toEqual(expect.arrayContaining(DECISIONS.bypassFlag));
    expect(argv).not.toContain("--permission-prompt-tool");
  });

  it("Auto mode adds --permission-mode auto and keeps the permission tool; ask adds no mode; allowAll wins over auto", () => {
    const { spec } = setup("happy");
    const auto = buildArgv({ ...spec, mode: "auto" }, DECISIONS);
    expect(auto[auto.indexOf("--permission-mode") + 1]).toBe("auto");
    expect(auto).toContain("--permission-prompt-tool");
    const ask = buildArgv({ ...spec, mode: "ask" }, DECISIONS);
    expect(ask).not.toContain("--permission-mode");
    expect(ask).toContain("--permission-prompt-tool");
    const all = buildArgv({ ...spec, mode: "auto", allowAll: true }, DECISIONS);
    expect(all.filter((a) => a === "--permission-mode")).toHaveLength(1);
    expect(all[all.indexOf("--permission-mode") + 1]).toBe("bypassPermissions");
  });

  it("a project run adds no folder rule; addDir and model pass through", () => {
    const { spec } = setup("happy");
    const argv = buildArgv({ ...spec, editFolder: null, addDir: "/p/ctx", model: "sonnet" }, DECISIONS);
    expect(argv).not.toContain("--settings");
    expect(argv[argv.indexOf("--add-dir") + 1]).toBe("/p/ctx");
    expect(argv[argv.indexOf("--model") + 1]).toBe("sonnet");
  });

  it("the system prompt lists steps, or asks the agent to name its own", () => {
    const { spec } = setup("happy");
    expect(systemPrompt(spec)).toBe([
      "Run id: r1",
      'This run is shown live in Workflows. Report progress with the workflows_step tool, passing runId "r1".',
      "Steps:",
      "- s1: Brief and landing page",
      'Call workflows_step with status "started" when you begin a step and "done", "failed" or "skipped" when it ends. Start a loop step again each time you repeat it. If you do work that is not in the list, report it under a short id of your own.',
    ].join("\n"));
    expect(systemPrompt({ ...spec, steps: null })).toContain('Name your own steps: call workflows_step with a short id you choose (for example "gather-sources")');
    expect(firstMessage({ ...spec, inputs: [] }, DECISIONS)).toBe("/motion-ad A 15 second ad");
  });
});

describe("running", () => {
  it("yields the fixture's events in order and resolves done with sawResult true", async () => {
    const { spec, driver } = setup("happy");
    const h = driver.start(spec);
    const events = await drain(h.events);
    const d = await h.done;
    expect(events.at(-1)).toMatchObject({ t: "result", ok: true });
    expect(d).toMatchObject({ exitCode: 0, sawResult: true, skippedLines: 0 });
    expect(h.pid).toBeGreaterThan(0);
  });

  it("a process that exits without a result resolves sawResult false", async () => {
    const root = mkdtempSync(join(tmpdir(), "workflows-drvfix-"));
    const fx = join(root, "dies.jsonl");
    const lines = readFileSync(join(FIXTURES, "failure.jsonl"), "utf8").split("\n").filter((l) => l && !l.includes('"type": "result"'));
    writeFileSync(fx, [...lines, JSON.stringify({ __fake: "exit", code: 1 })].join("\n"));
    const { spec } = setup("happy");
    const driver = createClaudeDriver({ bin: FAKE_CLAUDE, home: root, extraEnv: fakeEnv({ fixture: fx }), graceMs: 100 });
    const h = driver.start(spec);
    const events = await drain(h.events);
    expect((await h.done)).toMatchObject({ exitCode: 1, sawResult: false });
    expect(events.some((e) => e.t === "result")).toBe(false);
  });

  it("stop interrupts, then kills a process that ignores the interrupt", async () => {
    const { spec, driver } = setup("happy", { ignoreSigint: true, holdMs: 10_000 });
    const h = driver.start(spec);
    const t = Date.now();
    setTimeout(() => void h.stop(), 200);
    await drain(h.events);
    await h.done;
    expect(Date.now() - t).toBeLessThan(4000);
  });

  it("a stop of a cooperative process gives the stop result", async () => {
    const { spec, driver, logged } = setup("happy", { holdMs: 10_000 });
    const h = driver.start(spec);
    // Stop once the fake is up (it logs after installing its SIGINT handler), not after a fixed delay.
    for (let i = 0; i < 100; i++) {
      try {
        if (logged().some((l) => l.stdin)) break;
      } catch {
        /* not written yet */
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    void h.stop();
    const events = await drain(h.events);
    expect(events.at(-1)).toMatchObject({ t: "result", ok: false });
  });

  it.skipIf(process.platform === "win32")("a forced stop also ends what the process started", async () => {
    const { spec, root } = setup("happy");
    const pidFile = join(root, "child.pid");
    const bin = join(root, "stubborn.sh");
    writeFileSync(bin, `#!/bin/sh\nsleep 300 &\necho $! > "${pidFile}"\ntrap '' INT\nwhile true; do sleep 1; done\n`, { mode: 0o755 });
    const h = createClaudeDriver({ bin, home: root, graceMs: 100 }).start(spec);
    // The file exists a moment before the pid is in it; an empty read would be pid 0 (our own group).
    const pidIn = () => (existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8").trim()) : 0);
    for (let i = 0; i < 100 && !pidIn(); i++) await new Promise((r) => setTimeout(r, 50));
    const child = pidIn();
    expect(child).toBeGreaterThan(1);
    await h.stop();
    const alive = () => {
      try {
        process.kill(child, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (let i = 0; i < 40 && alive(); i++) await new Promise((r) => setTimeout(r, 50));
    expect(alive()).toBe(false);
  });

  it("adds no credential to the child environment (the fake would exit 2)", async () => {
    const { spec, driver } = setup("happy");
    const h = driver.start(spec);
    await drain(h.events);
    expect((await h.done).exitCode).toBe(0);
  });
});
