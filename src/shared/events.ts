/** What a run is made of, as Workflows records it. Shared by the server (which writes them) and the web UI (which draws them). */

export type RunStatus = "queued" | "running" | "waiting" | "finished" | "failed" | "stopped";
export type RunKind = "button" | "history";
export type StepReport = "started" | "done" | "failed" | "skipped";

export interface AskQuestion {
  question: string;
  header: string | null;
  multiSelect: boolean;
  options: { label: string; description: string | null }[];
}

export type Ask =
  | { id: string; kind: "question"; toolCallId: string | null; agentId: string | null; questions: AskQuestion[] }
  | { id: string; kind: "permission"; toolCallId: string | null; agentId: string | null; tool: string; input: Record<string, unknown> };

export type AskAnswer =
  /** question text -> the chosen label(s) or typed text */
  | { kind: "question"; answers: Record<string, string> }
  | { kind: "permission"; allow: boolean; message: string | null };

/**
 * One thing that happened in a run. `agentId` is the tool-call id of the subagent call (Agent/Task) that
 * produced the event, or null for the lead. `at` is epoch ms.
 */
export type RunEvent =
  | { t: "status"; at: number; status: RunStatus; reason: string | null }
  | { t: "text"; at: number; agentId: string | null; text: string }
  | { t: "tool.start"; at: number; id: string; agentId: string | null; name: string; input: Record<string, unknown> }
  | { t: "tool.end"; at: number; id: string; ok: boolean; result: string }
  | { t: "step"; at: number; stepId: string; status: StepReport; note: string | null }
  | { t: "ask"; at: number; ask: Ask }
  /** answer null: the ask was closed without an answer (the run ended, or it was stopped). */
  | { t: "ask.done"; at: number; id: string; answer: AskAnswer | null }
  | { t: "result"; at: number; ok: boolean; error: string | null };
