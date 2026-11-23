/**
 * The rules every request passes, in order:
 * 1. `Host` must be 127.0.0.1:<port> or localhost:<port> (a page on another name cannot reach us through DNS rebinding).
 * 2. `GET /health`, `GET /auth`, `GET /o/<grant>/...` (output files, checked by their own grant) and the UI's static files
 *    (any GET outside /api/: the page holds no data, it asks the API) need nothing more.
 * 3. Anything else needs `Authorization: Bearer <token>` or the `rw` cookie of a stored session.
 * 4. A cookie-authorised request that changes state must come from our own origin.
 */
import { timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { Db } from "./db";

export type AuthVia = "bearer" | "cookie";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The path as the router will see it: percent-decoded, with repeated slashes collapsed. Deciding on the raw
 * path let `/%61pi/runs` through as a "static" page while the router served `/api/runs` (review, 23/11/2026).
 * Null when it cannot be decoded.
 */
export function routedPath(raw: string): string | null {
  try {
    return decodeURIComponent(raw).replace(/\/{2,}/g, "/");
  } catch {
    return null;
  }
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function allowedHosts(port: number): Set<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}

/** A browser session lasts at most this long, and never past the server that made it (main.ts clears them at start). */
export const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;

export function security(opts: { port: () => number; token: () => string; db: Db; now?: () => number }): MiddlewareHandler<{ Variables: { via: AuthVia } }> {
  return async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");

    const port = opts.port();
    if (!allowedHosts(port).has(c.req.header("host") ?? "")) return c.text("Forbidden", 403);
    const path = routedPath(new URL(c.req.url).pathname);
    const routed = routedPath(c.req.path);
    if (path === null || routed === null) return c.text("Bad request", 400);
    // /health, /auth, /o/<grant>/... and the UI's files are open to safe methods; anything under /api is not.
    const isApi = (q: string) => /^\/api(\/|$)/i.test(q);
    if (!isApi(path) && !isApi(routed) && SAFE.has(c.req.method)) return next();

    const auth = c.req.header("authorization") ?? "";
    if (auth.startsWith("Bearer ") && sameToken(auth.slice(7), opts.token())) {
      c.set("via", "bearer");
      return next();
    }
    const sid = getCookie(c, "rw");
    if (sid && /^[0-9a-f]{16,128}$/.test(sid) && opts.db.get("SELECT id FROM auth_sessions WHERE id = ? AND created_at > ?", sid, (opts.now ?? Date.now)() - SESSION_MAX_MS)) {
      if (!SAFE.has(c.req.method)) {
        const origin = c.req.header("origin");
        if (origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return c.text("Forbidden", 403);
      }
      c.set("via", "cookie");
      return next();
    }
    return c.text("Unauthorized", 401);
  };
}

export const viaBearer = (c: Context<{ Variables: { via: AuthVia } }>): boolean => c.get("via") === "bearer";
