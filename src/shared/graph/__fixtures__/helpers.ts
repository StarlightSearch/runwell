// Ported from Pulsar (Starlight), released here under the MIT license.
/** Builders for hand-written run transcripts (made-up content), shaped like real `ChatMessage[]`. */
import type { ChatMessage, ContentBlock, ToolCallInfo } from "../source-types";
import type { RunStepView, StepStatus } from "../source-types";

let seq = 0;

export function call(
  toolName: string,
  args: Record<string, unknown>,
  status: ToolCallInfo["status"] = "done",
  extra: Partial<ToolCallInfo> = {},
): ContentBlock {
  seq += 1;
  return {
    type: "tool_call",
    toolCall: { toolCallId: `call_${seq}`, toolName, args, argsPartial: "", status, result: status === "done" ? "ok" : undefined, ...extra },
  };
}

type TodoStatus = "pending" | "in_progress" | "completed" | "skipped" | "failed";

/** A todo_write call over `ids`, every id pending unless `set` says otherwise. */
export function todo(ids: string[], set: Record<string, TodoStatus>, extra: Partial<ToolCallInfo> = {}, outputs: Record<string, string[]> = {}): ContentBlock {
  return call(
    "todo_write",
    { todos: ids.map((id) => ({ id, content: id, status: set[id] ?? "pending", ...(outputs[id] ? { outputs: outputs[id] } : {}) })) },
    "done",
    extra,
  );
}

export function subagent(
  description: string | undefined,
  task: string,
  status: ToolCallInfo["status"],
  opts: { result?: string; blocks?: ContentBlock[]; startedAt?: number; endedAt?: number } = {},
): ContentBlock {
  return call("subagent", description === undefined ? { task } : { description, task }, status, {
    result: opts.result,
    subagentBlocks: opts.blocks,
    startedAt: opts.startedAt,
    endedAt: opts.endedAt,
  });
}

export const text = (t: string): ContentBlock => ({ type: "text", text: t });

export const assistant = (id: string, contentBlocks: ContentBlock[], isStreaming = false): ChatMessage => ({
  id,
  role: "assistant",
  contentBlocks,
  isStreaming,
});

export const user = (id: string, t: string): ChatMessage => ({ id, role: "user", contentBlocks: [text(t)], isStreaming: false });

export const step = (id: string, title: string, depth: number, status: StepStatus, extra: Record<string, unknown> = {}): RunStepView => ({
  id,
  title,
  depth,
  status,
  note: null,
  ...extra,
});
