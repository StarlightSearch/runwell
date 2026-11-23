import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUILT, checkHygiene, harness, readEvents, ROOT, type Harness } from "./harness";

describe.skipIf(!BUILT)("button run", () => {
  let h: Harness;
  beforeAll(async () => (h = await harness()));
  afterAll(async () => {
    checkHygiene(h);
    await h.stopServer();
  });

  it("a happy run finishes with its events, workflow, work files and outputs", async () => {
    const run = await h.startRun("happy");
    await h.waitForStatus(run.id, "finished");
    const dir = join(h.home, "runs", run.id);
    expect(existsSync(join(dir, "events.jsonl"))).toBe(true);
    expect(existsSync(join(dir, "workflow.json"))).toBe(true);
    expect(existsSync(join(dir, "work", "words.txt"))).toBe(true);
    const { outputs } = (await (await h.fetchApi(`/api/runs/${run.id}/outputs`)).json()) as { outputs: { path: string; label: string }[] };
    expect(outputs.map((o) => o.path).sort()).toEqual(["notes.md", "words.txt"]);
    expect(outputs.every((o) => o.label === "written")).toBe(true);
  });

  it("claude gets --mcp-config naming the real built mcp.js, and that server reports a step into the run", async () => {
    const run = await h.startRun("slow");
    await h.waitForStatus(run.id, "running");
    const argv = readFileSync(h.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.argv).at(-1).argv as string[];
    const cfgPath = argv[argv.indexOf("--mcp-config") + 1]!;
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8")).mcpServers.runwell as { command: string; args: string[]; env: Record<string, string> };
    expect(cfg.args[0]).toBe(join(ROOT, "plugin/dist/mcp.js"));
    const client = new Client({ name: "e2e", version: "0" });
    await client.connect(new StdioClientTransport({ command: cfg.command, args: cfg.args, env: { ...cfg.env, RUNWELL_RUN_ID: run.id } as Record<string, string> }));
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(["runwell_permission", "runwell_step"]);
    await client.callTool({ name: "runwell_step", arguments: { runId: run.id, stepId: "e2e-step", status: "started", note: "from the real MCP server" } });
    await client.close();
    await h.fetchApi(`/api/runs/${run.id}/stop`, { method: "POST" });
    await h.waitForStatus(run.id, "stopped");
    const events = await readEvents(h, run.id);
    expect(events.some((e) => e.t === "step" && e.stepId === "e2e-step" && e.note === "from the real MCP server")).toBe(true);
  });
});
