/** The HTTP app: security first, then the routes. Later tasks add their services to `Ctx` and their routes here. */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Config } from "./config";
import type { Db } from "./db";
import type { ServerInfo } from "./lifecycle";
import type { Paths } from "./paths";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { security, type AuthVia } from "./security";
import type { Hub } from "./sse";

export interface Ctx {
  paths: Paths;
  config(): Config;
  db: Db;
  info: ServerInfo;
  hub: Hub;
  now(): number;
  /** Runs in progress (queued, running or waiting), for /health and the idle watch. */
  activeRuns(): number;
}

export type App = Hono<{ Variables: { via: AuthVia } }>;
const TOPICS = new Set(["runs", "skills", "backfill"]);

export function createApp(ctx: Ctx, extra: ((app: App, ctx: Ctx) => void)[] = []): App {
  const app: App = new Hono();
  app.use("*", security({ port: () => ctx.info.port, token: () => ctx.info.token, db: ctx.db }));
  healthRoutes(app as unknown as Hono, ctx);
  authRoutes(app, ctx);

  app.all("/api/ping", (c) => c.json({ ok: true }));

  app.get("/api/stream", (c) => {
    const asked = (c.req.query("topics") ?? "runs,skills,backfill").split(",").filter((t) => TOPICS.has(t) || /^run:[A-Za-z0-9_-]{1,64}$/.test(t));
    return streamSSE(c, async (stream) => {
      const unsub = ctx.hub.subscribe(asked, (topic, data) => void stream.writeSSE({ event: topic, data: JSON.stringify(data) }));
      const ping = setInterval(() => void stream.write(": ping\n\n"), 15_000);
      stream.onAbort(() => {
        clearInterval(ping);
        unsub();
      });
      await new Promise<void>((resolve) => stream.onAbort(resolve));
    });
  });

  for (const add of extra) add(app, ctx);
  return app;
}
