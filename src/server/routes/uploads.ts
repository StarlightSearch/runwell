import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { App, Ctx } from "../http";

const MAX_UPLOAD = 200 * 1024 * 1024;
const STALE_MS = 60 * 60 * 1000;

/** `POST /api/uploads`: the raw body is the file, `x-filename` its name. A run picks it up by id. */
export function uploadsRoutes(app: App, ctx: Ctx): void {
  const root = join(ctx.paths.runs, "_uploads");
  const sweep = () => {
    try {
      for (const d of readdirSync(root)) {
        const dir = join(root, d);
        if (ctx.now() - statSync(dir).mtimeMs > STALE_MS) rmSync(dir, { recursive: true, force: true });
      }
    } catch {
      /* nothing to sweep */
    }
  };
  app.post("/api/uploads", async (c) => {
    sweep();
    const declared = Number(c.req.header("content-length") ?? "0");
    if (declared > MAX_UPLOAD) return c.json({ error: "Files up to 200 MB can be attached." }, 413);
    const raw = c.req.header("x-filename") ?? "file";
    const name = basename(decodeURIComponent(raw).replace(/\\/g, "/")).replace(/^\.+/, "").slice(0, 200) || "file";
    const body = Buffer.from(await c.req.arrayBuffer());
    if (body.length > MAX_UPLOAD) return c.json({ error: "Files up to 200 MB can be attached." }, 413);
    const id = randomBytes(9).toString("base64url");
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), body);
    writeFileSync(join(dir, ".name"), name);
    return c.json({ id, name, bytes: body.length });
  });
}
