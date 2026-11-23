import type { Ask } from "../../shared/events";
import { parseAnswer, type AskBroker } from "../asks";
import type { App, Ctx } from "../http";
import type { RunsService } from "../runs";

const LIVE = ["running", "waiting"];

/** Checks the shape of an ask the transport sends, without its id. */
function parseAsk(v: unknown): Parameters<AskBroker["open"]>[1] | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  const toolCallId = typeof a.toolCallId === "string" ? a.toolCallId : null;
  const agentId = typeof a.agentId === "string" ? a.agentId : null;
  if (a.kind === "permission" && typeof a.tool === "string") {
    return { kind: "permission", toolCallId, agentId, tool: a.tool, input: a.input && typeof a.input === "object" ? (a.input as Record<string, unknown>) : {} };
  }
  if (a.kind === "question" && Array.isArray(a.questions)) return { kind: "question", toolCallId, agentId, questions: a.questions as Extract<Ask, { kind: "question" }>["questions"] };
  return null;
}

export function asksRoutes(broker: AskBroker, runs: Pick<RunsService, "get">) {
  return (app: App, _ctx: Ctx) => {
    // The transport's long poll: answers when the person does, or with null when the run ends.
    app.post("/api/runs/:id/asks", async (c) => {
      if (c.get("via") !== "bearer") return c.text("Unauthorized", 401);
      const run = runs.get(c.req.param("id"));
      if (!run) return c.json({ error: "No run with that id." }, 404);
      if (!LIVE.includes(run.status)) return c.json({ error: "This run has ended." }, 409);
      let body: unknown = null;
      try {
        body = await c.req.json();
      } catch {
        /* falls through */
      }
      const ask = parseAsk(body);
      if (!ask) return c.json({ error: "Not an ask." }, 400);
      const { answer } = broker.open(run.id, ask);
      return c.json({ answer: await answer });
    });

    app.get("/api/runs/:id/asks", (c) => c.json({ asks: broker.pending(c.req.param("id")) }));

    app.post("/api/runs/:id/asks/:askId/answer", async (c) => {
      let body: unknown = null;
      try {
        body = await c.req.json();
      } catch {
        /* falls through */
      }
      const a = parseAnswer(body);
      if (!a) return c.json({ error: "Not an answer." }, 400);
      const r = broker.answer(c.req.param("id"), c.req.param("askId"), a);
      if (r === "gone") return c.json({ error: "This card was already answered, or its run has ended." }, 409);
      if (r === "mismatch") return c.json({ error: "That answer is for a different kind of card." }, 400);
      return c.json({ ok: true });
    });
  };
}
