// Spike 1 stub: a stdio MCP server with one tool, `permission`, used as --permission-prompt-tool.
// Logs every call to $STUB_LOG, holds for $STUB_HOLD seconds, then answers.
// AskUserQuestion: allow with updatedInput.answers picking the second option of each question.
// The first Bash call is denied (to see what the agent reads); everything else is allowed.
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const LOG = process.env.STUB_LOG ?? "/dev/null";
const HOLD = Number(process.env.STUB_HOLD ?? "0") * 1000;
let deniedBash = false;
const log = (o) => appendFileSync(LOG, JSON.stringify({ at: Date.now(), ...o }) + "\n");
const send = (o) => process.stdout.write(JSON.stringify(o) + "\n");

createInterface({ input: process.stdin }).on("line", async (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === "initialize") {
    send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "spike", version: "0" } } });
  } else if (msg.method === "tools/list") {
    send({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "permission", description: "Permission prompt for spike 1", inputSchema: { type: "object", properties: { tool_name: { type: "string" }, input: { type: "object" }, tool_use_id: { type: "string" } }, additionalProperties: true } }] } });
  } else if (msg.method === "tools/call") {
    const args = msg.params.arguments ?? {};
    log({ kind: "call", args });
    if (HOLD) await new Promise((r) => setTimeout(r, HOLD));
    let answer;
    if (args.tool_name === "AskUserQuestion") {
      const answers = {};
      for (const q of args.input?.questions ?? []) answers[q.question] = q.options?.[1]?.label ?? q.options?.[0]?.label;
      answer = { behavior: "allow", updatedInput: { ...args.input, answers } };
    } else if (args.tool_name === "Bash" && !deniedBash) {
      deniedBash = true;
      answer = { behavior: "deny", message: "no" };
    } else {
      answer = { behavior: "allow", updatedInput: args.input };
    }
    log({ kind: "answer", answer });
    send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: JSON.stringify(answer) }] } });
  } else if (msg.id !== undefined) {
    send({ jsonrpc: "2.0", id: msg.id, result: {} });
  }
});
