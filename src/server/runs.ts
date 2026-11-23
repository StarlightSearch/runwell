/**
 * The run manager: starts button runs through the driver, queues past `maxRuns`, keeps each run's
 * events append-only in `runs/<id>/events.jsonl`, derives the run's status from its events, and fails
 * runs a previous server left in progress.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { WorkflowSource } from "../shared/api";
import type { RunEvent, RunKind, RunStatus } from "../shared/events";
import { graphOf } from "../shared/graph/from-events";
import { SIGNED_OUT, NOT_FOUND } from "./claude/auth";
import type { AgentDriver, RunHandle } from "./claude/driver";
import type { Config } from "./config";
import type { Db } from "./db";
import type { Paths } from "./paths";
import type { ProjectRow } from "./projects";
import { trustOf } from "./projects";
import type { SkillRow } from "./skills";
import type { Hub } from "./sse";

export type Place = { kind: "folder"; contextProject: string | null } | { kind: "project"; path: string; confirmedUntrusted: boolean };
export interface StartRunInput {
  skillKey: string;
  brief: string;
  place: Place;
  model: string | null;
  allowAll: boolean;
  uploadIds: string[];
  fromRun: string | null;
}
export type StartRunError = "skill_not_found" | "claude_not_found" | "signed_out" | "folder_missing" | "untrusted_folder" | "brief_too_long";

export interface RunRow {
  id: string;
  skillKey: string;
  skillRef: string;
  n: number;
  kind: RunKind;
  status: RunStatus;
  brief: string;
  cwd: string;
  place: "folder" | "project" | "chat";
  projectPath: string | null;
  model: string | null;
  allowAll: boolean;
  skillVersion: number;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  waitingMs: number;
  rating: 1 | -1 | null;
  note: string | null;
  error: string | null;
}

export interface RunsService {
  start(input: StartRunInput): Promise<{ ok: true; run: RunRow } | { ok: false; error: StartRunError; message: string }>;
  stop(id: string): Promise<void>;
  get(id: string): RunRow | null;
  list(q: { skillKey?: string; status?: RunStatus; limit?: number }): RunRow[];
  events(id: string, from?: number): RunEvent[];
  append(id: string, e: RunEvent): void;
  rate(id: string, rating: 1 | -1 | null, note: string | null): void;
  remove(id: string): void;
  removeAll(q: { skillKey?: string }): number;
  recoverOrphans(): number;
  activeCount(): number;
  /** Stops every run in progress and waits until each has finished writing (server shutdown). */
  shutdown(): Promise<void>;
  /** The workflow a run was started with (steps the graph is shaped by). */
  workflowOf(id: string): WorkflowSource;
}

export interface RunsDeps {
  paths: Paths;
  db: Db;
  hub: Hub;
  config(): Config;
  driver: AgentDriver;
  skill(key: string): SkillRow | null;
  projects(): ProjectRow[];
  claude(): Promise<{ found: boolean; signedIn: "in" | "out" | "unknown" }>;
  workflow(skill: SkillRow): Promise<WorkflowSource>;
  collectOutputs(run: RunRow, events: RunEvent[]): Promise<void>;
  /** Called when a run ends (the ask broker closes its cards here). */
  onRunEnd(runId: string): void;
  /** The command line of a pid, or null when it is not running (for orphan recovery). */
  pidCommand(pid: number): string | null;
  /** The MCP server entry for a run's mcp.json; absent in tests that do not need it. */
  mcpServer?(): { command: string; args: string[] };
  now(): number;
}

const MAX_BRIEF = 20_000;
const ACTIVE: RunStatus[] = ["queued", "running", "waiting"];
const B32 = "abcdefghijklmnopqrstuvwxyz234567";

export function newRunId(): string {
  const bytes = randomBytes(12);
  let s = "";
  for (const b of bytes) s += B32[b & 31];
  return s;
}

type DbRun = {
  id: string; skill_key: string; skill_ref: string; n: number; kind: RunKind; status: RunStatus; brief: string | null; cwd: string | null;
  place: string | null; project_path: string | null; model: string | null; allow_all: number; skill_version: number | null; pid: number | null;
  created_at: number; started_at: number | null; ended_at: number | null; waiting_ms: number | null; rating: number | null; note: string | null; error: string | null;
};

const toRow = (r: DbRun): RunRow => ({
  id: r.id, skillKey: r.skill_key, skillRef: r.skill_ref, n: r.n, kind: r.kind, status: r.status, brief: r.brief ?? "", cwd: r.cwd ?? "",
  place: (r.place as RunRow["place"]) ?? "folder", projectPath: r.project_path, model: r.model, allowAll: !!r.allow_all,
  skillVersion: r.skill_version ?? 1, createdAt: r.created_at, startedAt: r.started_at, endedAt: r.ended_at, waitingMs: r.waiting_ms ?? 0,
  rating: r.rating === 1 ? 1 : r.rating === -1 ? -1 : null, note: r.note, error: r.error,
});

/** A file name with no folders, made unique inside `dir` with -2, -3... */
function uniqueName(dir: string, raw: string): string {
  const base = basename(raw.replace(/\\/g, "/")) || "file";
  const ext = extname(base);
  const stem = base.slice(0, base.length - ext.length) || "file";
  let name = base;
  for (let i = 2; existsSync(join(dir, name)); i++) name = `${stem}-${i}${ext}`;
  return name;
}

export function createRunsService(deps: RunsDeps): RunsService {
  const handles = new Map<string, RunHandle>();
  const stopping = new Set<string>();
  const openAsks = new Map<string, Map<string, number>>();
  const workflows = new Map<string, WorkflowSource>();
  const launches = new Map<string, Promise<void>>();

  const row = (id: string): RunRow | null => {
    const r = deps.db.get<DbRun>("SELECT * FROM runs WHERE id = ?", id);
    return r ? toRow(r) : null;
  };
  const publishRuns = (id: string) => deps.hub.publish("runs", { id, status: row(id)?.status });

  const append = (id: string, e: RunEvent) => {
    mkdirSync(deps.paths.runDir(id), { recursive: true });
    appendFileSync(deps.paths.events(id), JSON.stringify(e) + "\n");
    deps.hub.publish(`run:${id}`, e);
    if (e.t === "ask") {
      const asks = openAsks.get(id) ?? new Map<string, number>();
      asks.set(e.ask.id, e.at);
      openAsks.set(id, asks);
      deps.db.run("UPDATE runs SET status = 'waiting' WHERE id = ? AND status IN ('running', 'waiting')", id);
      publishRuns(id);
    } else if (e.t === "ask.done") {
      const asks = openAsks.get(id);
      const since = asks?.get(e.id);
      asks?.delete(e.id);
      if (since !== undefined) deps.db.run("UPDATE runs SET waiting_ms = COALESCE(waiting_ms, 0) + ? WHERE id = ?", Math.max(0, e.at - since), id);
      if (!asks?.size) deps.db.run("UPDATE runs SET status = 'running' WHERE id = ? AND status = 'waiting'", id);
      publishRuns(id);
    } else if (e.t === "status") {
      deps.db.run("UPDATE runs SET status = ? WHERE id = ?", e.status, id);
      publishRuns(id);
    }
  };

  const events = (id: string, from = 0): RunEvent[] => {
    try {
      return readFileSync(deps.paths.events(id), "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .flatMap((l) => {
          try {
            return [JSON.parse(l) as RunEvent];
          } catch {
            return [];
          }
        })
        .slice(from);
    } catch {
      return [];
    }
  };

  const activeCount = () =>
    deps.db.get<{ c: number }>("SELECT COUNT(*) AS c FROM runs WHERE status IN ('running', 'waiting')")?.c ?? 0;

  async function finish(id: string, outcome: { sawOk: boolean; error: string | null; sawResult: boolean }) {
    const status: RunStatus = stopping.has(id) ? "stopped" : outcome.sawOk ? "finished" : "failed";
    const error = status === "failed" ? (outcome.error ?? "Claude stopped without finishing") : null;
    stopping.delete(id);
    handles.delete(id);
    deps.onRunEnd(id);
    openAsks.delete(id);
    deps.db.run("UPDATE runs SET ended_at = ?, error = ?, pid = NULL WHERE id = ?", deps.now(), error, id);
    append(id, { t: "status", at: deps.now(), status, reason: error });
    const r = row(id)!;
    const evs = events(id);
    try {
      await deps.collectOutputs(r, evs);
    } catch {
      /* outputs are best effort; the run's record stays */
    }
    try {
      writeFileSync(deps.paths.workflowJson(id), JSON.stringify(graphOf(evs, workflows.get(id)?.steps ?? null, false)));
    } catch {
      /* the graph can be rebuilt from events */
    }
    publishRuns(id);
    pump();
  }

  async function launch(id: string) {
    const r = row(id);
    if (!r) return;
    const skill = deps.skill(r.skillKey);
    const wf = skill ? await deps.workflow(skill).catch(() => ({ steps: null, from: "none" as const, note: null })) : { steps: null, from: "none" as const, note: null };
    workflows.set(id, wf);
    const mcpConfigPath = join(deps.paths.runDir(id), "mcp.json");
    if (deps.mcpServer) {
      const s = deps.mcpServer();
      writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers: { runwell: { command: s.command, args: s.args, env: { RUNWELL_HOME: deps.paths.root } } } }));
    } else writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers: {} }));
    const inputsDir = deps.paths.inputs(id);
    const inputs = existsSync(inputsDir) ? readdirSync(inputsDir).map((f) => join(inputsDir, f)) : [];
    const contextProject = r.place === "folder" ? (deps.db.get<{ project_path: string | null }>("SELECT project_path FROM runs WHERE id = ?", id)?.project_path ?? null) : null;

    deps.db.run("UPDATE runs SET status = 'running', started_at = ? WHERE id = ?", deps.now(), id);
    append(id, { t: "status", at: deps.now(), status: "running", reason: null });
    let handle: RunHandle;
    try {
      handle = deps.driver.start({
        runId: id, runDir: deps.paths.runDir(id), cwd: r.cwd, skillRef: r.skillRef, brief: r.brief, inputs,
        editFolder: r.place === "folder" ? r.cwd : null, addDir: contextProject, model: r.model, allowAll: r.allowAll,
        steps: wf.steps, mcpConfigPath,
      });
    } catch (err) {
      await finish(id, { sawOk: false, error: `Claude could not be started: ${(err as Error).message}`, sawResult: false });
      return;
    }
    handles.set(id, handle);
    deps.db.run("UPDATE runs SET pid = ? WHERE id = ?", handle.pid, id);
    // A stop asked for before the process existed takes effect now.
    if (stopping.has(id)) void handle.stop();
    let sawOk = false;
    let error: string | null = null;
    for await (const e of handle.events) {
      append(id, e);
      if (e.t === "result") {
        sawOk = e.ok;
        error = e.error;
      }
    }
    const done = await handle.done;
    await finish(id, { sawOk, error, sawResult: done.sawResult });
  }

  function pump() {
    const free = deps.config().maxRuns - activeCount();
    if (free <= 0) return;
    const queued = deps.db.all<{ id: string }>("SELECT id FROM runs WHERE status = 'queued' AND kind = 'button' ORDER BY created_at, rowid LIMIT ?", free);
    for (const q of queued) {
      deps.db.run("UPDATE runs SET status = 'running' WHERE id = ? AND status = 'queued'", q.id);
      const p = launch(q.id).finally(() => launches.delete(q.id));
      launches.set(q.id, p);
    }
  }

  function moveUploads(id: string, uploadIds: string[]) {
    const dest = deps.paths.inputs(id);
    mkdirSync(dest, { recursive: true });
    for (const up of uploadIds) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(up)) continue;
      const dir = join(deps.paths.runs, "_uploads", up);
      if (!existsSync(dir)) continue;
      let original: string | null = null;
      try {
        original = readFileSync(join(dir, ".name"), "utf8");
      } catch {
        /* no recorded name */
      }
      for (const f of readdirSync(dir)) {
        if (f === ".name") continue;
        const src = join(dir, f);
        if (!statSync(src).isFile()) continue;
        renameSync(src, join(dest, uniqueName(dest, original ?? f)));
      }
      rmSync(dir, { recursive: true, force: true });
    }
  }

  return {
    async start(input) {
      const skill = deps.skill(input.skillKey);
      if (!skill) return { ok: false, error: "skill_not_found", message: "That skill was not found." };
      const from = input.fromRun ? row(input.fromRun) : null;
      const brief = input.brief.trim() ? input.brief : (from?.brief ?? input.brief);
      if (brief.length > MAX_BRIEF) return { ok: false, error: "brief_too_long", message: "The brief is longer than 20,000 characters." };
      const claude = await deps.claude();
      if (!claude.found) return { ok: false, error: "claude_not_found", message: NOT_FOUND };
      if (claude.signedIn === "out") return { ok: false, error: "signed_out", message: SIGNED_OUT };

      let projectPath: string | null = null;
      if (input.place.kind === "project") {
        const path = input.place.path;
        let exists = false;
        try {
          exists = statSync(path).isDirectory();
        } catch {
          /* missing */
        }
        if (!exists) return { ok: false, error: "folder_missing", message: "That folder no longer exists." };
        if (trustOf(deps.projects(), path) !== "trusted" && !input.place.confirmedUntrusted) {
          return { ok: false, error: "untrusted_folder", message: "You have not trusted this folder in Claude Code. Confirm to run here anyway." };
        }
        projectPath = path;
      } else projectPath = input.place.contextProject;

      const id = newRunId();
      const n = (deps.db.get<{ m: number | null }>("SELECT MAX(n) AS m FROM runs WHERE skill_key = ?", skill.key)?.m ?? 0) + 1;
      const cwd = input.place.kind === "project" ? input.place.path : deps.paths.work(id);
      mkdirSync(deps.paths.work(id), { recursive: true });
      if (input.place.kind === "project") rmSync(deps.paths.work(id), { recursive: true, force: true });
      mkdirSync(deps.paths.inputs(id), { recursive: true });
      moveUploads(id, input.uploadIds);
      if (from && !input.uploadIds.length && existsSync(deps.paths.inputs(from.id))) {
        cpSync(deps.paths.inputs(from.id), deps.paths.inputs(id), { recursive: true });
      }
      deps.db.run(
        `INSERT INTO runs (id, skill_key, skill_ref, n, kind, status, brief, cwd, place, project_path, model, allow_all, skill_version, created_at)
         VALUES (?, ?, ?, ?, 'button', 'queued', ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, skill.key, skill.ref, n, brief, cwd, input.place.kind, projectPath, input.model, input.allowAll ? 1 : 0, skill.version, deps.now(),
      );
      publishRuns(id);
      pump();
      return { ok: true, run: row(id)! };
    },

    async stop(id) {
      const r = row(id);
      if (!r) return;
      if (r.status === "queued") {
        deps.db.run("UPDATE runs SET ended_at = ? WHERE id = ?", deps.now(), id);
        append(id, { t: "status", at: deps.now(), status: "stopped", reason: null });
        return;
      }
      if (!ACTIVE.includes(r.status)) return;
      stopping.add(id);
      const h = handles.get(id);
      if (h) await h.stop();
    },

    get: row,

    list(q) {
      const where: string[] = [];
      const params: (string | number)[] = [];
      if (q.skillKey) (where.push("skill_key = ?"), params.push(q.skillKey));
      if (q.status) (where.push("status = ?"), params.push(q.status));
      params.push(Math.min(Math.max(q.limit ?? 100, 1), 1000));
      return deps.db
        .all<DbRun>(`SELECT * FROM runs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC, rowid DESC LIMIT ?`, ...params)
        .map(toRow);
    },

    events,
    append,

    rate(id, rating, note) {
      deps.db.run("UPDATE runs SET rating = ?, note = ? WHERE id = ?", rating, note, id);
      publishRuns(id);
    },

    remove(id) {
      const r = row(id);
      if (!r) return;
      if (ACTIVE.includes(r.status)) throw new Error("A run in progress cannot be deleted. Stop it first.");
      deps.db.tx(() => {
        deps.db.run("DELETE FROM outputs WHERE run_id = ?", id);
        deps.db.run("DELETE FROM runs WHERE id = ?", id);
      });
      rmSync(deps.paths.runDir(id), { recursive: true, force: true });
      publishRuns(id);
    },

    removeAll(q) {
      const ids = deps.db
        .all<{ id: string }>(`SELECT id FROM runs WHERE status NOT IN ('queued', 'running', 'waiting') ${q.skillKey ? "AND skill_key = ?" : ""}`, ...(q.skillKey ? [q.skillKey] : []))
        .map((r) => r.id);
      for (const id of ids) this.remove(id);
      return ids.length;
    },

    recoverOrphans() {
      const orphans = deps.db.all<{ id: string; pid: number | null }>("SELECT id, pid FROM runs WHERE status IN ('queued', 'running', 'waiting')");
      for (const o of orphans) {
        const reason = "Runwell restarted during this run";
        deps.db.run("UPDATE runs SET status = 'failed', error = ?, ended_at = ?, pid = NULL WHERE id = ?", reason, deps.now(), o.id);
        append(o.id, { t: "status", at: deps.now(), status: "failed", reason });
        if (o.pid && /(^|[/\s])claude(\s|$)/.test(deps.pidCommand(o.pid) ?? "")) {
          try {
            process.kill(o.pid, "SIGTERM");
          } catch {
            /* already gone */
          }
        }
      }
      return orphans.length;
    },

    activeCount,
    async shutdown() {
      // Nothing new starts: queued runs stay queued and are failed by recoverOrphans at the next start.
      deps.config = ((orig) => () => ({ ...orig(), maxRuns: 0 }))(deps.config);
      for (const id of launches.keys()) stopping.add(id);
      await Promise.all([...handles.values()].map((h) => h.stop().catch(() => {})));
      await Promise.all([...launches.values()].map((p) => p.catch(() => {})));
    },
    workflowOf: (id) => workflows.get(id) ?? { steps: null, from: "none", note: null },
  };
}
