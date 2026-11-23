import { continueRun, type Launch } from "../continue";
import type { App, Ctx } from "../http";
import type { RunsService } from "../runs";

/** `POST /api/runs/:id/continue` with `{ where: "terminal" | "desktop" }`. */
export function continueRoutes(runs: Pick<RunsService, "get">, claudeBin: () => string | null, launch: Launch) {
  return (app: App, _ctx: Ctx) => {
    app.post("/api/runs/:id/continue", async (c) => {
      const run = runs.get(c.req.param("id"));
      if (!run) return c.json({ error: "No run with that id." }, 404);
      let body: { where?: unknown } = {};
      try {
        body = await c.req.json();
      } catch {
        /* 400 below */
      }
      if (body.where !== "terminal" && body.where !== "desktop") return c.json({ error: "where must be terminal or desktop." }, 400);
      const bin = claudeBin();
      if (!bin) return c.json({ error: "Claude Code was not found." }, 409);
      const r = await continueRun(run, body.where, bin, launch);
      return r.ok ? c.json({ ok: true, message: r.message }) : c.json({ error: r.message }, r.status as 400);
    });
  };
}
