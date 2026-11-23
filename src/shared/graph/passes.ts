// Ported from Pulsar (Starlight), released here under the MIT license.
/** Loop passes, read from the run's todo_write history. */
import type { ChatMessage, ToolCallInfo } from "./source-types";

export interface TodoEntry {
  id: string;
  status: string;
  note: string | null;
  outputs: string[];
}

/** Every tool call of the agent's messages, in order (nested subagent calls excluded). */
export function flattenToolCalls(messages: ChatMessage[]): ToolCallInfo[] {
  return messages.flatMap((m) =>
    m.role === "assistant" ? m.contentBlocks.flatMap((b) => (b.type === "tool_call" ? [b.toolCall] : [])) : [],
  );
}

/** A todo_write call's items with an id, or null for any other call (or one whose arguments are not in yet). */
export function todoEntries(call: ToolCallInfo): TodoEntry[] | null {
  if (call.toolName !== "todo_write") return null;
  const todos = call.args?.todos;
  if (!Array.isArray(todos)) return null;
  const out: TodoEntry[] = [];
  for (const t of todos as unknown[]) {
    if (!t || typeof t !== "object") continue;
    const item = t as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.status !== "string") continue;
    out.push({
      id: item.id,
      status: item.status,
      note: typeof item.note === "string" ? item.note : null,
      outputs: Array.isArray(item.outputs) ? item.outputs.filter((o): o is string => typeof o === "string") : [],
    });
  }
  return out;
}

/**
 * The passes of a loop. Pass 1 starts when
 * any of the loop's children first goes in_progress. A new pass starts when:
 * - a child completed in the current pass goes in_progress again (a reset to
 *   pending in between changes nothing; completions in the todo_write that
 *   starts a pass belong to the pass it ends), or
 * - a subagent call under the loop (`agentKey` gives its name key, null when the
 *   call is not the loop's) repeats a key already run in the current pass AND
 *   the lead did its own work (any other tool call, a checklist update
 *   included) since the previous loop agent: the lead re-ran its reviewers
 *   without saying so in the checklist. That pass starts at the lead's first
 *   own work after the last agent (the revision that led to the repeat).
 * Not a pass: agents back to back (one fan-out, even with a repeated name), a
 * repeat of a call that errored (a retry), and agent calls made while the loop
 * is closed (the latest todo_write naming the loop or its children has none of
 * them in progress). `startIndex` indexes `flattenToolCalls`.
 */
export function inferPasses(
  messages: ChatMessage[],
  loop: { id: string; childIds: string[] },
  agentKey?: (call: ToolCallInfo, index: number) => string | null,
): { pass: number; startIndex: number }[] {
  if (!loop.childIds.length) return [];
  const children = new Set(loop.childIds);
  const passes: { pass: number; startIndex: number }[] = [];
  const prev = new Map<string, string>();
  let doneInPass = new Set<string>();
  /** Each key run in the current pass, with how its last run ended. */
  let agentsInPass = new Map<string, ToolCallInfo["status"]>();
  /** Whether the lead did anything but spawn agents since the last loop agent call. */
  let leadActed = false;
  /** The first call after the last loop agent that is the lead's own work (not a todo_write, not a subagent). */
  let workAfterAgents: number | null = null;
  /** Whether the loop is open: null until a todo_write names it. */
  let open: boolean | null = null;
  const start = (index: number) => {
    passes.push({ pass: passes.length + 1, startIndex: index });
    doneInPass = new Set();
    agentsInPass = new Map();
  };
  flattenToolCalls(messages).forEach((call, index) => {
    const entries = todoEntries(call);
    if (entries) {
      const named = entries.filter((e) => e.id === loop.id || children.has(e.id));
      if (named.length) open = named.some((e) => e.status === "in_progress");
      const mine = entries.filter((e) => children.has(e.id));
      const entering = mine.filter((e) => e.status === "in_progress" && prev.get(e.id) !== "in_progress");
      if (entering.length && (passes.length === 0 || entering.some((e) => doneInPass.has(e.id)))) start(index);
      else for (const e of mine) if (e.status === "completed" && prev.get(e.id) !== "completed") doneInPass.add(e.id);
      for (const e of mine) prev.set(e.id, e.status);
    }
    if (call.toolName === "todo_write") {
      leadActed = true;
      return;
    }
    const key = call.toolName === "subagent" && open !== false ? (agentKey?.(call, index) ?? null) : null;
    if (key === null) {
      if (call.toolName !== "subagent") {
        leadActed = true;
        workAfterAgents ??= index;
      }
      return;
    }
    const before = agentsInPass.get(key);
    if (passes.length === 0) start(index);
    else if (before !== undefined && before !== "error" && leadActed) start(workAfterAgents ?? index);
    agentsInPass.set(key, call.status);
    leadActed = false;
    workAfterAgents = null;
  });
  return passes;
}

/** The pass current at a tool-call index: the last one started at or before it (null before the first). */
export function passAt(passes: { pass: number; startIndex: number }[], index: number): number | null {
  return passes.findLast((p) => p.startIndex <= index)?.pass ?? null;
}
