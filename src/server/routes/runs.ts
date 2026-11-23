import { streamSSE } from "hono/streaming";
import type { RunEvent, RunStatus } from "../../shared/events";
import type { AskBroker } from "../asks";
import type { App, Ctx } from "../http";
import type { OutputsService } from "../outputs";
import type { Place, RunsService, StartRunError, StartRunInput } from "../runs";
import type { SkillsService } from "../skills";
import type { WorkflowService } from "../workflow";

const STATUSES = new Set<RunStatus>(["queued", "running", "waiting", "finished", "failed", "stopped"]);
const ENDED = new Set<RunStatus>(["finished", "failed", "stopped"]);
const CONFLICT: StartRunError[] = ["signed_out", "claude_not_found", "untrusted_folder"];

function parsePlace(v: unknown): Place | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (p.kind === "folder") return { kind: "folder", contextProject: typeof p.contextProject === "string" ? p.contextProject : null };
  if (p.kind === "project" && typeof p.path === "string") return { kind: "project", path: p.path, confirmedUntrusted: p.confirmedUntrusted === true };
  return null;
}

function parseStart(v: unknown): StartRunInput | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  const place = parsePlace(b.place ?? { kind: "folder" });
  if (typeof b.skillKey !== "string" || !place) return null;
  return {
    skillKey: b.skillKey,
    brief: typeof b.brief === "string" ? b.brief : "",
    place,
    model: typeof b.model === "string" && b.model ? b.model : null,
    allowAll: b.allowAll === true,
    uploadIds: Array.isArray(b.uploadIds) ? b.uploadIds.filter((x): x is string => typeof x === "string") : [],
    fromRun: typeof b.fromRun === "string" ? b.fromRun : null,
  };
}

export function runsRoutes(s: { runs: RunsService; skills: Pick<SkillsService, "get">; workflow: WorkflowService; broker: AskBroker; outputs: OutputsService }) {
  return (app: App, ctx: Ctx) => {
    app.post("/api/runs", async (c) => {
      let body: unknown = null;
      try {
        body = await c.req.json();
      } catch {
        /* 400 below */
      }
      const input = parseStart(body);
      if (!input) return c.json({ error: "bad_request", message: "Send a skillKey, a brief and a place." }, 400);
      const r = await s.runs.start(input);
      if (!r.ok) return c.json({ error: r.error, message: r.message }, CONFLICT.includes(r.error) ? 409 : 400);
      return c.json({ run: r.run }, 201);
    });

    app.get("/api/runs", (c) => {
      const status = c.req.query("status") as RunStatus | undefined;
      const limit = Number(c.req.query("limit"));
      return c.json({ runs: s.runs.list({ skillKey: c.req.query("skill") || undefined, status: status && STATUSES.has(status) ? status : undefined, limit: Number.isFinite(limit) && limit > 0 ? limit : undefined }) });
    });

    // The newest run in a folder (as its working folder or its project), else the newest of all.
    app.get("/api/runs/latest", (c) => {
      const cwd = c.req.query("cwd");
      const all = s.runs.list({ limit: 500 });
      const run = (cwd ? all.find((r) => r.cwd === cwd || r.projectPath === cwd) : undefined) ?? all[0] ?? null;
      return c.json({ run });
    });

    app.get("/api/runs/:id", (c) => {
      const run = s.runs.get(c.req.param("id"));
      if (!run) return c.json({ error: "No run with that id." }, 404);
      const skill = s.skills.get(run.skillKey);
      const started = s.runs.workflowOf(run.id);
      const workflow = started.from !== "none" ? started : skill ? s.workflow.cachedWorkflow(skill) : started;
      return c.json({ run, skill, workflow, asks: s.broker.pending(run.id), grant: s.outputs.grant(run.id) });
    });

    // Stored events from `from` (or Last-Event-ID + 1), then live ones; an `end` event once the run is over.
    app.get("/api/runs/:id/events", (c) => {
      const id = c.req.param("id");
      const run = s.runs.get(id);
      if (!run) return c.json({ error: "No run with that id." }, 404);
      const last = Number(c.req.header("last-event-id"));
      const fromQ = Number(c.req.query("from"));
      const from = Number.isInteger(last) && last >= 0 ? last + 1 : Number.isInteger(fromQ) && fromQ >= 0 ? fromQ : 0;
      return streamSSE(c, async (stream) => {
        let index = from;
        const queue: RunEvent[] = [];
        let wake: (() => void) | null = null;
        const unsub = ctx.hub.subscribe([`run:${id}`], (_t, data) => {
          queue.push(data as RunEvent);
          wake?.();
        });
        let aborted = false;
        stream.onAbort(() => {
          aborted = true;
          wake?.();
        });
        try {
          const stored = s.runs.events(id);
          // Events published while reading the file are already in `stored`; skip their live copies.
          let skipLive = queue.length;
          for (const e of stored.slice(from)) await stream.writeSSE({ id: String(index++), event: "event", data: JSON.stringify(e) });
          const isOver = () => ENDED.has(s.runs.get(id)?.status ?? "finished");
          const ping = setInterval(() => void stream.write(": ping\n\n"), 15_000);
          try {
            for (;;) {
              while (queue.length) {
                const e = queue.shift()!;
                if (skipLive > 0) {
                  skipLive--;
                  continue;
                }
                await stream.writeSSE({ id: String(index++), event: "event", data: JSON.stringify(e) });
              }
              if (aborted) return;
              if (isOver()) {
                await stream.writeSSE({ event: "end", data: JSON.stringify({ status: s.runs.get(id)?.status ?? null }) });
                return;
              }
              await new Promise<void>((r) => {
                wake = r;
                setTimeout(r, 1000);
              });
              wake = null;
            }
          } finally {
            clearInterval(ping);
          }
        } finally {
          unsub();
        }
      });
    });

    app.post("/api/runs/:id/stop", async (c) => {
      const run = s.runs.get(c.req.param("id"));
      if (!run) return c.json({ error: "No run with that id." }, 404);
      await s.runs.stop(run.id);
      return c.json({ ok: true });
    });

    app.post("/api/runs/:id/rating", async (c) => {
      const run = s.runs.get(c.req.param("id"));
      if (!run) return c.json({ error: "No run with that id." }, 404);
      let body: { rating?: unknown; note?: unknown } = {};
      try {
        body = await c.req.json();
      } catch {
        /* 400 below */
      }
      if (!(body.rating === 1 || body.rating === -1 || body.rating === null)) return c.json({ error: "rating must be 1, -1 or null." }, 400);
      if (!(body.note === null || body.note === undefined || typeof body.note === "string")) return c.json({ error: "note must be text." }, 400);
      if (typeof body.note === "string" && body.note.length > 2000) return c.json({ error: "Notes can be up to 2,000 characters." }, 400);
      s.runs.rate(run.id, body.rating, typeof body.note === "string" && body.note.trim() ? body.note : null);
      return c.json({ run: s.runs.get(run.id) });
    });

    app.delete("/api/runs/:id", (c) => {
      const run = s.runs.get(c.req.param("id"));
      if (!run) return c.json({ error: "No run with that id." }, 404);
      try {
        s.runs.remove(run.id);
      } catch (err) {
        return c.json({ error: (err as Error).message }, 409);
      }
      return c.json({ ok: true });
    });

    app.delete("/api/runs", (c) => c.json({ removed: s.runs.removeAll({ skillKey: c.req.query("skill") || undefined }) }));
  };
}
