/**
 * The rules every request passes, in order:
 * 1. `Host` must be 127.0.0.1:<port> or localhost:<port> (a page on another name cannot reach us through DNS rebinding).
 * 2. `GET /health`, `GET /auth` and `GET /o/<grant>/...` (output files, checked by their own grant) need nothing more.
 * 3. Anything else needs `Authorization: Bearer <token>` or the `rw` cookie of a stored session.
 * 4. A cookie-authorised request that changes state must come from our own origin.
 */
import { timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { Db } from "./db";

export type AuthVia = "bearer" | "cookie";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const OPEN_PATHS = new Set(["/health", "/auth"]);

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function allowedHosts(port: number): Set<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}

export function security(opts: { port: () => number; token: () => string; db: Db }): MiddlewareHandler<{ Variables: { via: AuthVia } }> {
  return async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");

    const port = opts.port();
    if (!allowedHosts(port).has(c.req.header("host") ?? "")) return c.text("Forbidden", 403);
    const path = new URL(c.req.url).pathname;
    if ((OPEN_PATHS.has(path) || path.startsWith("/o/")) && SAFE.has(c.req.method)) return next();

    const auth = c.req.header("authorization") ?? "";
    if (auth.startsWith("Bearer ") && sameToken(auth.slice(7), opts.token())) {
      c.set("via", "bearer");
      return next();
    }
    const sid = getCookie(c, "rw");
    if (sid && /^[0-9a-f]{16,128}$/.test(sid) && opts.db.get("SELECT id FROM auth_sessions WHERE id = ?", sid)) {
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
