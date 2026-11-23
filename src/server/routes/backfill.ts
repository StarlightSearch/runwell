import type { Backfill } from "../backfill";
import type { App, Ctx } from "../http";

export function backfillRoutes(backfill: Backfill) {
  return (app: App, _ctx: Ctx) => {
    app.get("/api/backfill", (c) => c.json(backfill.state()));
    // Re-lists the logs: only new or grown files are read again.
    app.post("/api/backfill/rescan", (c) => {
      backfill.start();
      return c.json(backfill.state());
    });
  };
}
