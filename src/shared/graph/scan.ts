// Ported from Pulsar (Starlight), released here under the MIT license.
/** One walk over a run's transcript, attributing every block to the step that was in progress; shared by the graph and the activity log. */
import type { ChatMessage, ContentBlock, ToolCallInfo } from "./source-types";
import { todoEntries, type TodoEntry } from "./passes";
import type { ToolCallSummary } from "./types";

export type ScanEvent =
  | { kind: "text"; text: string; stepId: string | null; index: number }
  | { kind: "call"; call: ToolCallInfo; stepId: string | null; index: number }
  | { kind: "todo"; call: ToolCallInfo; entries: TodoEntry[]; index: number };

export interface ScanShape {
  /** Ids of the nodes a block can belong to. */
  nodeIds: Set<string>;
  /** A loop region's id → its first child node (work under the loop itself belongs there). */
  regionFirst: Map<string, string>;
  /** Where work goes before any todo_write: the first checklist step. */
  firstStep: string | null;
}

export const resolveStep = (shape: ScanShape, id: string): string | null =>
  shape.nodeIds.has(id) ? id : (shape.regionFirst.get(id) ?? null);

/**
 * The agent's blocks in order, each text and tool call tagged with the step
 * that was in progress per the latest todo_write before it (the last item in
 * progress, so a loop child wins over its loop); before any todo_write, the
 * first step; when the latest has nothing in progress, the step last in
 * progress. `index` counts tool calls, as `flattenToolCalls` does (a text's is
 * the next call's).
 */
export function scanRun(messages: ChatMessage[], shape: ScanShape): ScanEvent[] {
  const events: ScanEvent[] = [];
  let current = shape.firstStep;
  let index = 0;
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const b of m.contentBlocks) {
      if (b.type === "text") {
        if (b.text.trim()) events.push({ kind: "text", text: b.text, stepId: current, index });
        continue;
      }
      if (b.type !== "tool_call") continue;
      const call = b.toolCall;
      const entries = todoEntries(call);
      if (entries) {
        events.push({ kind: "todo", call, entries, index });
        const active = entries.filter((e) => e.status === "in_progress").map((e) => resolveStep(shape, e.id)).filter((id) => id !== null);
        if (active.length) current = active[active.length - 1];
      } else if (call.toolName !== "todo_write") {
        events.push({ kind: "call", call, stepId: current, index });
      }
      index += 1;
    }
  }
  return events;
}

const oneLine = (s: string, max: number) => {
  const line = s.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};

/** A subagent call's name: its description, else the first line of its task (60 characters at most). */
export function agentName(call: ToolCallInfo): string {
  const description = call.args?.description;
  if (typeof description === "string" && description.trim()) return oneLine(description, 60);
  const task = call.args?.task;
  return typeof task === "string" && task.trim() ? oneLine(task, 60) : "Subagent";
}

export function firstLine(s: string | undefined | null): string | null {
  return s ? oneLine(s, 200) || null : null;
}

const TARGET_KEYS = ["path", "file_path", "filePath", "url", "query", "command", "pattern", "app", "description", "name"];

export function summarizeCall(call: ToolCallInfo): ToolCallSummary {
  const key = TARGET_KEYS.find((k) => typeof call.args?.[k] === "string" && (call.args[k] as string).trim());
  return {
    id: call.toolCallId,
    name: call.toolName,
    target: key ? oneLine(call.args![key] as string, 80) : "",
    status: call.status === "done" ? "done" : call.status === "error" ? "error" : "running",
    result: call.result ?? null,
    startedAt: call.startedAt ?? null,
    endedAt: call.endedAt ?? null,
  };
}

const textsOf = (blocks: ContentBlock[] | undefined) =>
  (blocks ?? []).flatMap((b) => (b.type === "text" && b.text.trim() ? [b.text] : []));

/** A subagent's result without the "[subagent usage] …" line the sandbox appends for the parent agent. */
export const withoutUsage = (result: string | undefined | null): string =>
  (result ?? "").replace(/\n*\[subagent usage\][^\n]*\s*$/, "").trim();

/** A subagent's final text: its result, else the last text block it wrote. */
export function finalText(call: ToolCallInfo): string | null {
  const result = withoutUsage(call.result);
  if (result) return result;
  return textsOf(call.subagentBlocks).at(-1) ?? null;
}

/** The text blocks a subagent wrote, or its result when it streamed none. */
export function agentOutput(call: ToolCallInfo): string[] {
  const texts = textsOf(call.subagentBlocks);
  const result = withoutUsage(call.result);
  return texts.length ? texts : result ? [result] : [];
}

export function agentToolCalls(call: ToolCallInfo): ToolCallSummary[] {
  return (call.subagentBlocks ?? []).flatMap((b) => (b.type === "tool_call" ? [summarizeCall(b.toolCall)] : []));
}

/** `Verdict: accept|reject` on the final text's last line (markdown emphasis allowed); read only for declared agents. */
export function parseVerdict(text: string | null): "accept" | "reject" | null {
  const last = text?.split("\n").map((l) => l.trim()).filter(Boolean).at(-1);
  const m = last?.replace(/^[*_\s]+|[*_\s.]+$/g, "").match(/^verdict:\s*(accept|reject)$/i);
  return m ? (m[1].toLowerCase() as "accept" | "reject") : null;
}

/** "reviewers" when every role ends in the same word ("… as a reviewer"), else "agents". */
export function agentNoun(roles: (string | undefined)[], count: number): string {
  const words = roles.map((r) => r?.trim().toLowerCase().match(/([a-z]+)\W*$/)?.[1]);
  const word = words.length && words.every((w) => w && w === words[0]) ? words[0]! : "agent";
  return count === 1 ? word : `${word}s`;
}
