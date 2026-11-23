/** The server entry: open the store, take the lock, bind 127.0.0.1, serve the API and the built UI. */
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import { VERSION } from "../shared/version";
import { mimeOf } from "../shared/outputs";
import { loadConfig } from "./config";
import { migrate, openDb } from "./db";
import { createApp, type App, type Ctx } from "./http";
import { acquire, idleWatch, type ServerInfo } from "./lifecycle";
import { paths } from "./paths";
import { buildServices, type ServiceOptions } from "./services";
import { createHub } from "./sse";

const IDLE_MS = 12 * 60 * 60 * 1000;
const UI_CSP =
  "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; frame-src 'self'; frame-ancestors 'none'";

/** The built web UI sits beside the server bundle (dist/web), or under web/dist in development. */
function webRoot(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  return process.env.RUNWELL_WEB_ROOT ?? join(here, "web");
}

function serveUi(app: App, root: string): void {
  app.get("*", async (c) => {
    const path = new URL(c.req.url).pathname;
    if (path.startsWith("/api/")) return c.notFound();
    const rel = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, "");
    const file = join(root, rel);
    const inside = file.startsWith(root + sep) && extname(file) !== "";
    try {
      const body = await readFile(inside ? file : join(root, "index.html"));
      const type = inside ? mimeOf(file) : "text/html; charset=utf-8";
      if (type.startsWith("text/html")) c.header("Content-Security-Policy", UI_CSP);
      return c.body(body, 200, { "Content-Type": type });
    } catch {
      c.header("Content-Security-Policy", UI_CSP);
      return c.html("<!doctype html><title>Runwell</title><p>The Runwell interface has not been built yet.</p>", inside ? 404 : 200);
    }
  });
}

export async function startServer(opts: { home?: string; port?: number; services?: ServiceOptions } = {}): Promise<{ info: ServerInfo; server: Server; close(): Promise<void>; services: ReturnType<typeof buildServices> }> {
  const p = paths(opts.home);
  const config = () => loadConfig(p);
  const db = await openDb(p.db);
  migrate(db);
  const lock = await acquire(p, opts.port ?? config().port, VERSION);
  if (!lock) {
    db.close();
    throw new Error("Another Runwell server is already running.");
  }
  const hub = createHub();
  let activeRuns = () => 0;
  const ctx: Ctx = { paths: p, config, db, info: lock.info, hub, now: Date.now, activeRuns: () => activeRuns() };
  const services = buildServices(ctx, opts.services);
  activeRuns = () => services.runs.activeCount();
  services.runs.recoverOrphans();
  const app = createApp(ctx, services.routes);
  serveUi(app, webRoot());

  let lastRequest = Date.now();
  const server = await new Promise<Server>((resolve) => {
    const s = serve({ fetch: (req) => ((lastRequest = Date.now()), app.fetch(req)), port: lock.info.port, hostname: "127.0.0.1" }, () => resolve(s as Server));
  });
  // A card's long poll may wait for hours; Node's default 5-minute request timeout would cut it.
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;

  services.skills.start();
  // History from past chats, after the server is listening and the skills are known.
  services.backfill.start();

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    watch.stop();
    services.skills.stop();
    services.backfill.stop();
    await new Promise<void>((r) => server.close(() => r()));
    lock.release();
    db.close();
  };
  const watch = idleWatch({
    idleMs: IDLE_MS,
    isBusy: () => ctx.activeRuns() > 0 || hub.clients() > 0 || Date.now() - lastRequest < IDLE_MS,
    onIdle: () => void close().then(() => process.exit(0)),
  });
  return { info: lock.info, server, close, services };
}

export type { Hono };
