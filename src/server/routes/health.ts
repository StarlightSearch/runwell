import type { Hono } from "hono";
import type { HealthResponse } from "../../shared/api";
import type { Ctx } from "../http";

export function healthRoutes(app: Hono, ctx: Ctx): void {
  app.get("/health", (c) => c.json({ ok: true, version: ctx.info.version, activeRuns: ctx.activeRuns() } satisfies HealthResponse));
}
