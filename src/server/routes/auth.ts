/**
 * The one-time link that signs a browser in: `/workflows` and `npx workflows` ask for a link with the
 * bearer token, the browser opens it, and gets an HttpOnly, SameSite=Strict cookie.
 */
import { randomBytes } from "node:crypto";
import type { Hono } from "hono";
import { setCookie } from "hono/cookie";
import type { AuthLinkResponse } from "../../shared/api";
import type { Ctx } from "../http";

const LINK_TTL_MS = 60_000;
const EXPIRED = "This link has expired. Run /workflows again.";

/** A path inside the app: starts with "/", not "//", no backslash or scheme tricks. */
export function safeTo(to: unknown): string {
  return typeof to === "string" && to.startsWith("/") && !to.startsWith("//") && !to.includes("\\") ? to : "/";
}

export function authRoutes(app: Hono<{ Variables: { via: "bearer" | "cookie" } }>, ctx: Ctx): void {
  const nonces = new Map<string, { to: string; at: number }>();

  app.post("/api/auth/link", async (c) => {
    if (c.get("via") !== "bearer") return c.text("Unauthorized", 401);
    let body: { to?: unknown } = {};
    try {
      body = await c.req.json();
    } catch {
      /* no body: the dashboard root */
    }
    const now = ctx.now();
    for (const [n, v] of nonces) if (now - v.at > LINK_TTL_MS) nonces.delete(n);
    const nonce = randomBytes(24).toString("hex");
    const to = safeTo(body.to);
    nonces.set(nonce, { to, at: now });
    const url = new URL(`http://127.0.0.1:${ctx.info.port}/auth`);
    url.searchParams.set("n", nonce);
    url.searchParams.set("to", to);
    return c.json({ url: url.toString() } satisfies AuthLinkResponse);
  });

  app.get("/auth", (c) => {
    const n = c.req.query("n") ?? "";
    const entry = nonces.get(n);
    nonces.delete(n);
    if (!entry || ctx.now() - entry.at > LINK_TTL_MS) return c.text(EXPIRED, 403);
    const id = randomBytes(32).toString("hex");
    ctx.db.run("INSERT INTO auth_sessions (id, created_at) VALUES (?, ?)", id, ctx.now());
    setCookie(c, "rw", id, { httpOnly: true, sameSite: "Strict", path: "/" });
    return c.redirect(entry.to, 302);
  });
}
