import type { StepReport } from "../../shared/events";
import type { App, Ctx } from "../http";
import type { RunsService } from "../runs";

const STEP_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const STATUSES = new Set<StepReport>(["started", "done", "failed", "skipped"]);

/** `POST /api/runs/:id/steps`: the MCP tool's report. Bearer only: a page never reports steps. */
export function stepsRoutes(runs: Pick<RunsService, "get" | "append">) {
  return (app: App, ctx: Ctx) => {
    app.post("/api/runs/:id/steps", async (c) => {
      if (c.get("via") !== "bearer") return c.text("Unauthorized", 401);
      const run = runs.get(c.req.param("id"));
      if (!run) return c.json({ error: "No run with that id." }, 404);
      if (!["running", "waiting"].includes(run.status)) return c.json({ error: "This run has ended." }, 409);
      let body: { stepId?: unknown; status?: unknown; note?: unknown } = {};
      try {
        body = await c.req.json();
      } catch {
        /* falls through to the 400 */
      }
      if (typeof body.stepId !== "string" || !STEP_ID.test(body.stepId)) return c.json({ error: "stepId must be a short id of letters, digits, '.', '_' or '-'." }, 400);
      if (typeof body.status !== "string" || !STATUSES.has(body.status as StepReport)) return c.json({ error: "status must be started, done, failed or skipped." }, 400);
      const note = typeof body.note === "string" ? body.note.slice(0, 300) : null;
      runs.append(run.id, { t: "step", at: ctx.now(), stepId: body.stepId, status: body.status as StepReport, note });
      return c.json({ ok: true });
    });
  };
}
