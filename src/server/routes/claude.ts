import { claudeState, type ClaudeState } from "../claude/auth";
import type { App, Ctx } from "../http";

/** `GET /api/claude`, cached 30 s; `?fresh=1` (the Run dialog opening) reads again. */
export function claudeRoutes(app: App, ctx: Ctx): void {
  let cached: { at: number; state: ClaudeState } | null = null;
  app.get("/api/claude", async (c) => {
    if (!cached || c.req.query("fresh") === "1" || ctx.now() - cached.at > 30_000) {
      cached = { at: ctx.now(), state: await claudeState({ configured: ctx.config().claudePath }) };
    }
    return c.json(cached.state);
  });
}
