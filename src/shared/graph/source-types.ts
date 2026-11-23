// Ported from Pulsar (Starlight), released here under the MIT license.
/** The input shapes the workflow graph reads. */

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; toolCall: ToolCallInfo };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  contentBlocks: ContentBlock[];
  isStreaming: boolean;
}

export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown> | null;
  argsPartial: string;
  status: "streaming_args" | "executing" | "done" | "error";
  result?: string;
  subagentBlocks?: ContentBlock[];
  startedAt?: number;
  endedAt?: number;
}

export interface OverviewStep {
  id: string;
  title: string;
  detail: string;
  kind: "action" | "decision" | "loop";
  branches?: { when: string; then: string }[];
  children?: OverviewStep[];
  agents?: { name: string; role: string }[];
  maxPasses?: number;
}

/** `failed`: a step the agent reported as failed. */
export type StepStatus = "pending" | "running" | "done" | "skipped" | "failed";

export interface RunStepView {
  id: string;
  title: string;
  depth: number;
  status: StepStatus;
  note: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}
