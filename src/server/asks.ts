/**
 * Questions and permission requests as cards. The MCP permission tool opens an ask and waits on it;
 * the page answers it. Asks live in memory only: a run that ends closes its asks with no answer.
 */
import { randomBytes } from "node:crypto";
import type { Ask, AskAnswer, RunEvent, RunStatus } from "../shared/events";

type NewAsk = Omit<Extract<Ask, { kind: "question" }>, "id"> | Omit<Extract<Ask, { kind: "permission" }>, "id">;

export interface AskBroker {
  open(runId: string, ask: NewAsk): { id: string; answer: Promise<AskAnswer | null> };
  answer(runId: string, askId: string, a: AskAnswer): "ok" | "gone" | "mismatch";
  closeRun(runId: string): void;
  pending(runId: string): Ask[];
}

export function createAskBroker(deps: {
  append(runId: string, e: RunEvent): void;
  status(runId: string): RunStatus | null;
  /** The subagent a tool call came from, read from the run's events (the transport does not know it). */
  agentOfCall(runId: string, toolCallId: string): string | null;
  now(): number;
}): AskBroker {
  const open = new Map<string, Map<string, { ask: Ask; resolve: (a: AskAnswer | null) => void }>>();

  return {
    open(runId, input) {
      const id = randomBytes(8).toString("hex");
      const agentId = input.agentId ?? (input.toolCallId ? deps.agentOfCall(runId, input.toolCallId) : null);
      const ask = { ...input, id, agentId } as Ask;
      let resolve!: (a: AskAnswer | null) => void;
      const answer = new Promise<AskAnswer | null>((r) => (resolve = r));
      const asks = open.get(runId) ?? new Map();
      asks.set(id, { ask, resolve });
      open.set(runId, asks);
      deps.append(runId, { t: "ask", at: deps.now(), ask });
      return { id, answer };
    },

    answer(runId, askId, a) {
      const entry = open.get(runId)?.get(askId);
      if (!entry) return "gone";
      if (entry.ask.kind !== a.kind) return "mismatch";
      open.get(runId)!.delete(askId);
      deps.append(runId, { t: "ask.done", at: deps.now(), id: askId, answer: a });
      entry.resolve(a);
      return "ok";
    },

    closeRun(runId) {
      const asks = open.get(runId);
      if (!asks) return;
      open.delete(runId);
      for (const [id, entry] of asks) {
        deps.append(runId, { t: "ask.done", at: deps.now(), id, answer: null });
        entry.resolve(null);
      }
    },

    pending: (runId) => [...(open.get(runId)?.values() ?? [])].map((e) => e.ask),
  };
}

/** Is this a well-formed answer of either kind? */
export function parseAnswer(v: unknown): AskAnswer | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  if (a.kind === "permission" && typeof a.allow === "boolean") {
    return { kind: "permission", allow: a.allow, message: typeof a.message === "string" ? a.message.slice(0, 2000) : null };
  }
  if (a.kind === "question" && a.answers && typeof a.answers === "object" && !Array.isArray(a.answers)) {
    const answers: Record<string, string> = {};
    for (const [k, val] of Object.entries(a.answers as Record<string, unknown>)) if (typeof val === "string") answers[k.slice(0, 2000)] = val.slice(0, 4000);
    return { kind: "question", answers };
  }
  return null;
}
