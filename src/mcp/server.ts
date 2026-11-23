/**
 * Runwell's MCP server, started by `claude` for each run (runs/<id>/mcp.json).
 * - `runwell_step`: reports a step's progress. Always answers "ok": a Runwell problem never breaks a run.
 * - `runwell_permission`: the `--permission-prompt-tool` (spike 1). Questions and permission requests
 *   become cards in Runwell; the call waits until the person answers.
 * Requests go through node:http with no timeout of their own, so a card can wait as long as it needs.
 */
import { readFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const NOT_RUNNING = "Runwell is not running, so nobody could be asked.";
const ENDED = "The run ended before anyone answered.";

function serverInfo(home: string): { port: number; token: string } | null {
  try {
    const v = JSON.parse(readFileSync(join(home, "server.json"), "utf8"));
    return typeof v.port === "number" && typeof v.token === "string" ? { port: v.port, token: v.token } : null;
  } catch {
    return null;
  }
}

function post(home: string, path: string, body: unknown, timeoutMs: number | null): Promise<{ status: number; json: unknown } | null> {
  const s = serverInfo(home);
  if (!s) return Promise.resolve(null);
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = request(
      { host: "127.0.0.1", port: s.port, path, method: "POST", headers: { authorization: `Bearer ${s.token}`, host: `127.0.0.1:${s.port}`, "content-type": "application/json", "content-length": Buffer.byteLength(data) } },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, json: b ? JSON.parse(b) : null });
          } catch {
            resolve({ status: res.statusCode ?? 0, json: null });
          }
        });
        res.on("error", () => resolve(null));
      },
    );
    if (timeoutMs !== null) req.setTimeout(timeoutMs, () => req.destroy());
    req.on("error", () => resolve(null));
    req.end(data);
  });
}

type Question = { question: string; header: string | null; multiSelect: boolean; options: { label: string; description: string | null }[] };

function toQuestions(input: Record<string, unknown>): Question[] {
  const qs = Array.isArray(input.questions) ? input.questions : [];
  return qs.flatMap((q): Question[] => {
    if (!q || typeof q !== "object" || typeof (q as { question?: unknown }).question !== "string") return [];
    const x = q as { question: string; header?: unknown; multiSelect?: unknown; options?: unknown };
    const options = Array.isArray(x.options)
      ? x.options.flatMap((o) => (o && typeof o === "object" && typeof (o as { label?: unknown }).label === "string"
          ? [{ label: (o as { label: string }).label, description: typeof (o as { description?: unknown }).description === "string" ? (o as { description: string }).description : null }]
          : []))
      : [];
    return [{ question: x.question, header: typeof x.header === "string" ? x.header : null, multiSelect: x.multiSelect === true, options }];
  });
}

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

export function createRunwellMcp(opts: { home: string; runId: string | null }): McpServer {
  const mcp = new McpServer({ name: "runwell", version: "0.1.0" });

  mcp.registerTool(
    "runwell_step",
    {
      description: "Report the progress of a step of this run to Runwell.",
      inputSchema: { runId: z.string(), stepId: z.string(), status: z.enum(["started", "done", "failed", "skipped"]), note: z.string().optional() },
    },
    async ({ runId, stepId, status, note }) => {
      await post(opts.home, `/api/runs/${encodeURIComponent(runId)}/steps`, { stepId, status, note: note ?? null }, 1500);
      return text("ok");
    },
  );

  mcp.registerTool(
    "runwell_permission",
    {
      description: "Asks the person in Runwell whether a tool may run, or puts Claude's question to them.",
      inputSchema: { tool_name: z.string(), input: z.record(z.string(), z.unknown()), tool_use_id: z.string().optional() },
    },
    async ({ tool_name, input, tool_use_id }) => {
      const runId = opts.runId;
      const isQuestion = tool_name === "AskUserQuestion";
      const ask = isQuestion
        ? { kind: "question", toolCallId: tool_use_id ?? null, agentId: null, questions: toQuestions(input) }
        : { kind: "permission", toolCallId: tool_use_id ?? null, agentId: null, tool: tool_name, input };
      const r = runId ? await post(opts.home, `/api/runs/${encodeURIComponent(runId)}/asks`, ask, null) : null;
      if (!r || r.status !== 200) return text(JSON.stringify({ behavior: "deny", message: NOT_RUNNING }));
      const answer = (r.json as { answer?: unknown } | null)?.answer as
        | { kind: "question"; answers: Record<string, string> }
        | { kind: "permission"; allow: boolean; message: string | null }
        | null
        | undefined;
      if (!answer) return text(JSON.stringify({ behavior: "deny", message: ENDED }));
      if (answer.kind === "question") return text(JSON.stringify({ behavior: "allow", updatedInput: { ...input, answers: answer.answers } }));
      return text(JSON.stringify(answer.allow ? { behavior: "allow", updatedInput: input } : { behavior: "deny", message: answer.message ?? "The person declined this." }));
    },
  );

  return mcp;
}

/** Entry point when started by `claude` over stdio. */
export async function main(): Promise<void> {
  const home = process.env.RUNWELL_HOME ?? join(process.env.HOME ?? "", ".runwell");
  const mcp = createRunwellMcp({ home, runId: process.env.RUNWELL_RUN_ID ?? null });
  await mcp.connect(new StdioServerTransport());
}
