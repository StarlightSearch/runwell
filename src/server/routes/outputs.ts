import { createReadStream, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { Readable } from "node:stream";
import { mimeOf } from "../../shared/outputs";
import type { App, Ctx } from "../http";
import type { OutputsService } from "../outputs";
import type { RunEvent } from "../../shared/events";
import type { RunRow } from "../runs";

/** Where a run worked, if that folder still exists. */
export function runFolder(run: RunRow): string | null {
  const dir = run.place === "folder" ? run.cwd : (run.projectPath ?? run.cwd);
  try {
    return dir && statSync(dir).isDirectory() ? dir : null;
  } catch {
    return null;
  }
}

export function outputsRoutes(outputs: OutputsService, runOf: (id: string) => RunRow | null, eventsOf: (id: string) => RunEvent[] = () => []) {
  return (app: App, _ctx: Ctx) => {
    // A sandboxed page (opaque origin) sends no cookie, so files are reached with a path-scoped grant.
    app.get("/o/:grant/:runId/*", (c) => {
      const runId = c.req.param("runId");
      const run = runOf(runId);
      if (!run || !outputs.checkGrant(runId, c.req.param("grant"))) return c.text("Not found", 404);
      const prefix = `/o/${c.req.param("grant")}/${runId}/`;
      const rel = decodeURIComponent(new URL(c.req.url).pathname.slice(prefix.length));
      const file = outputs.file(run, rel);
      if (!file) return c.text("Not found", 404);
      const size = statSync(file).size;
      const headers: Record<string, string> = {
        "Content-Type": mimeOf(file),
        "Content-Security-Policy": "sandbox allow-scripts",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      };
      const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header("range") ?? "");
      if (range && size > 0) {
        const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        if (start > end || start >= size) return c.body(null, 416, { "Content-Range": `bytes */${size}` });
        const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
        return c.body(body, 206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) });
      }
      return c.body(Readable.toWeb(createReadStream(file)) as ReadableStream, 200, { ...headers, "Content-Length": String(size) });
    });

    // `absolute` is where the file lives (or lived) on disk, for "Copy path".
    app.get("/api/runs/:id/outputs", (c) => {
      const id = c.req.param("id");
      const run = runOf(id);
      if (!run) return c.json({ error: "No run with that id." }, 404);
      const where = (rel: string) =>
        rel.startsWith("~/") ? join(homedir(), rel.slice(2)) : isAbsolute(rel) ? rel : join(run.place === "folder" ? run.cwd : (run.projectPath ?? run.cwd), rel);
      return c.json({ outputs: outputs.list(id).map((o) => ({ ...o, absolute: where(o.path) })), grant: outputs.grant(id) });
    });

    app.get("/api/outputs", (c) => {
      const before = Number(c.req.query("before"));
      const limit = Number(c.req.query("limit"));
      const items = outputs.recent({ skill: c.req.query("skill") || undefined, kind: c.req.query("kind") || undefined, before: Number.isFinite(before) && before > 0 ? before : undefined, limit: Number.isFinite(limit) && limit > 0 ? limit : undefined });
      return c.json({ items: items.map((i) => ({ ...i, grant: outputs.grant(i.runId) })) });
    });

    // "Look again": collect a finished run's files again (for runs collected before a rule improved).
    app.post("/api/runs/:id/outputs/rescan", async (c) => {
      const run = runOf(c.req.param("id"));
      if (!run) return c.json({ error: "No run with that id." }, 404);
      if (["queued", "running", "waiting"].includes(run.status)) return c.json({ error: "This run is still going." }, 409);
      await outputs.collect(run, eventsOf(run.id));
      return c.json({ outputs: outputs.list(run.id).length });
    });

    // The run's own folder: the run folder for a button run, the project for a project or chat run.
    app.post("/api/runs/:id/reveal", (c) => {
      const run = runOf(c.req.param("id"));
      if (!run) return c.json({ error: "No run with that id." }, 404);
      const dir = runFolder(run);
      if (!dir) return c.json({ error: "This run's folder no longer exists." }, 404);
      outputs.reveal(dir);
      return c.json({ ok: true, path: dir });
    });

    app.post("/api/outputs/reveal", async (c) => {
      let body: { runId?: unknown; path?: unknown } = {};
      try {
        body = await c.req.json();
      } catch {
        /* 400 below */
      }
      const run = typeof body.runId === "string" ? runOf(body.runId) : null;
      const file = run && typeof body.path === "string" ? outputs.file(run, body.path) : null;
      if (!file) return c.json({ error: "No such output." }, 404);
      outputs.reveal(file);
      return c.body(null, 204);
    });
  };
}
