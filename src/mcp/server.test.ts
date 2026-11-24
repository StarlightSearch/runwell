import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkflowsMcp } from "./server";

/** A stand-in Workflows server that records what the MCP tools post. */
async function fakeWorkflows(handler: (path: string, body: unknown) => { status: number; json?: unknown; delayMs?: number }) {
  const calls: { path: string; body: unknown; auth: string | undefined }[] = [];
  const server: Server = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      const body = b ? JSON.parse(b) : null;
      calls.push({ path: req.url ?? "", body, auth: req.headers.authorization });
      const r = handler(req.url ?? "", body);
      setTimeout(() => {
        res.writeHead(r.status, { "content-type": "application/json" });
        res.end(JSON.stringify(r.json ?? {}));
      }, r.delayMs ?? 0);
    });
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const home = mkdtempSync(join(tmpdir(), "workflows-mcp-"));
  writeFileSync(join(home, "server.json"), JSON.stringify({ pid: 1, port: (server.address() as AddressInfo).port, token: "t".repeat(64), version: "0.1.0" }));
  return { home, calls, close: () => new Promise((r) => server.close(r)) };
}

async function connect(home: string, runId = "run1") {
  const server = createWorkflowsMcp({ home, runId });
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
const textOf = (r: unknown) => ((r as { content: { text: string }[] }).content[0]!.text);

let cleanup: (() => Promise<unknown>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

describe("workflows_step", () => {
  it("posts the step with the bearer token and returns ok", async () => {
    const fr = await fakeWorkflows(() => ({ status: 200 }));
    cleanup = fr.close;
    const c = await connect(fr.home);
    const r = await c.callTool({ name: "workflows_step", arguments: { runId: "run1", stepId: "s1", status: "started" } });
    expect(textOf(r)).toBe("ok");
    expect(fr.calls[0]).toMatchObject({ path: "/api/runs/run1/steps", body: { stepId: "s1", status: "started", note: null }, auth: `Bearer ${"t".repeat(64)}` });
  });

  it("still returns ok when the server refuses", async () => {
    const fr = await fakeWorkflows(() => ({ status: 400 }));
    cleanup = fr.close;
    const c = await connect(fr.home);
    expect(textOf(await c.callTool({ name: "workflows_step", arguments: { runId: "run1", stepId: "../x", status: "done" } }))).toBe("ok");
  });

  it("returns ok within 2 s when no server is running", async () => {
    const home = mkdtempSync(join(tmpdir(), "workflows-mcp-none-"));
    writeFileSync(join(home, "server.json"), JSON.stringify({ pid: 1, port: 1, token: "x", version: "0" }));
    const c = await connect(home);
    const t = Date.now();
    expect(textOf(await c.callTool({ name: "workflows_step", arguments: { runId: "r", stepId: "s1", status: "done" } }))).toBe("ok");
    expect(Date.now() - t).toBeLessThan(2000);
  });
});

describe("workflows_permission", () => {
  it("a question becomes a question ask; the answer comes back as updatedInput.answers", async () => {
    const fr = await fakeWorkflows(() => ({ status: 200, json: { answer: { kind: "question", answers: { "Which name?": "b.txt" } } }, delayMs: 300 }));
    cleanup = fr.close;
    const c = await connect(fr.home);
    const input = { questions: [{ question: "Which name?", header: "Name", multiSelect: false, options: [{ label: "a.txt", description: "A" }, { label: "b.txt" }] }] };
    const r = await c.callTool({ name: "workflows_permission", arguments: { tool_name: "AskUserQuestion", input, tool_use_id: "tu1" } });
    expect(JSON.parse(textOf(r))).toEqual({ behavior: "allow", updatedInput: { ...input, answers: { "Which name?": "b.txt" } } });
    expect(fr.calls[0]).toMatchObject({
      path: "/api/runs/run1/asks",
      body: { kind: "question", toolCallId: "tu1", questions: [{ question: "Which name?", header: "Name", multiSelect: false, options: [{ label: "a.txt", description: "A" }, { label: "b.txt", description: null }] }] },
    });
  });

  it("a permission becomes a permission ask; allow and deny map back", async () => {
    let answer: unknown = { kind: "permission", allow: true, message: null };
    const fr = await fakeWorkflows(() => ({ status: 200, json: { answer } }));
    cleanup = fr.close;
    const c = await connect(fr.home);
    const args = { tool_name: "Bash", input: { command: "npm i" }, tool_use_id: "tu2" };
    expect(JSON.parse(textOf(await c.callTool({ name: "workflows_permission", arguments: args })))).toEqual({ behavior: "allow", updatedInput: { command: "npm i" } });
    expect(fr.calls[0]!.body).toMatchObject({ kind: "permission", tool: "Bash", input: { command: "npm i" }, toolCallId: "tu2" });
    answer = { kind: "permission", allow: false, message: "Not now" };
    expect(JSON.parse(textOf(await c.callTool({ name: "workflows_permission", arguments: args })))).toEqual({ behavior: "deny", message: "Not now" });
    answer = null;
    expect(JSON.parse(textOf(await c.callTool({ name: "workflows_permission", arguments: args })))).toMatchObject({ behavior: "deny" });
  });

  it("denies with a clear message when Workflows is not running", async () => {
    const home = mkdtempSync(join(tmpdir(), "workflows-mcp-none-"));
    const c = await connect(home);
    const r = await c.callTool({ name: "workflows_permission", arguments: { tool_name: "Bash", input: {}, tool_use_id: "x" } });
    expect(JSON.parse(textOf(r))).toEqual({ behavior: "deny", message: "Workflows is not running, so nobody could be asked." });
  });
});
