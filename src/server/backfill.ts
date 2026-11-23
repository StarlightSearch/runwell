/**
 * History from past chats: on start, reads Claude's session logs from the last `backfillDays` days and
 * turns each skill use into a `history` run (its events, and the files it wrote that still exist).
 * Incremental: a log already read with the same size and mtime is skipped, and every run is unique by
 * its source (`<file>:<start>-<end>`), so reading twice never duplicates.
 */
import { copyFileSync, lstatSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import type { RunEvent } from "../shared/events";
import { isIgnored } from "../shared/ignore";
import { outputKind } from "../shared/outputs";
import type { Config } from "./config";
import type { Db } from "./db";
import type { Paths } from "./paths";
import { newRunId } from "./runs";
import { findSkillUses, readSessionLog } from "./sessions";
import type { Hub } from "./sse";

export interface BackfillState {
  status: "idle" | "running" | "done";
  filesDone: number;
  filesTotal: number;
  runsFound: number;
  skippedLines: number;
}

export interface Backfill {
  start(): void;
  /** Stops after the file being read; resolves once nothing more will be written. */
  stop(): Promise<void>;
  state(): BackfillState;
}

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const DAY = 86_400_000;

function listLogs(claudeHome: string, sinceMs: number): { file: string; size: number; mtime: number }[] {
  const root = join(claudeHome, "projects");
  const out: { file: string; size: number; mtime: number }[] = [];
  let folders: string[] = [];
  try {
    folders = readdirSync(root);
  } catch {
    return out;
  }
  for (const f of folders) {
    let names: string[] = [];
    try {
      names = readdirSync(join(root, f));
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      const file = join(root, f, name);
      try {
        const st = statSync(file);
        if (st.isFile() && st.mtimeMs >= sinceMs) out.push({ file, size: st.size, mtime: Math.round(st.mtimeMs) });
      } catch {
        /* gone */
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

export function createBackfill(deps: { paths: Paths; db: Db; hub: Hub; config(): Config; skillKeyOf(ref: string): string | null; now(): number }): Backfill {
  let st: BackfillState = { status: "idle", filesDone: 0, filesTotal: 0, runsFound: 0, skippedLines: 0 };
  let cancelled = false;
  let running: Promise<void> | null = null;
  let lastPublish = 0;
  const publish = (force = false) => {
    if (!force && deps.now() - lastPublish < 1000) return;
    lastPublish = deps.now();
    deps.hub.publish("backfill", st);
  };

  function recordOutputs(runId: string, events: RunEvent[], cwd: string | null) {
    const cfg = deps.config();
    let copied = 0;
    const seen = new Set<string>();
    for (const e of events) {
      if (e.t !== "tool.start" || !WRITE_TOOLS.has(e.name)) continue;
      const abs = e.input.file_path ?? e.input.notebook_path;
      if (typeof abs !== "string" || !isAbsolute(abs) || seen.has(abs)) continue;
      seen.add(abs);
      let s;
      try {
        s = lstatSync(abs);
      } catch {
        continue;
      }
      if (!s.isFile() || s.size > cfg.copyFileCapBytes || copied + s.size > cfg.copyRunCapBytes) continue;
      const rel = cwd && !relative(cwd, abs).startsWith("..") ? relative(cwd, abs) : abs.replace(/^\/+/, "");
      try {
        const dest = join(deps.paths.outputs(runId), rel);
        mkdirSync(join(dest, ".."), { recursive: true });
        copyFileSync(abs, dest);
        copied += s.size;
        deps.db.run(
          "INSERT OR REPLACE INTO outputs (run_id, path, label, kind, bytes, mtime, copied, hash) VALUES (?, ?, 'history', ?, ?, ?, 1, NULL)",
          runId, rel, outputKind(rel), s.size, Math.round(s.mtimeMs),
        );
      } catch {
        /* skip a file that cannot be copied */
      }
    }
  }

  function importFile(file: string): number {
    const log = readSessionLog(file);
    st.skippedLines += log.skipped;
    const ignored = deps.config().ignored;
    let found = 0;
    for (const use of findSkillUses(log)) {
      if (isIgnored(use.skillRef, ignored)) continue;
      const sourceRef = `${file}:${use.startLine}-${use.endLine}`;
      // A grown file re-read: the same use keeps its start line, and its end may have moved.
      const existing = deps.db.get<{ id: string }>("SELECT id FROM runs WHERE kind = 'history' AND (source_ref = ? OR source_ref LIKE ?)", sourceRef, `${file}:${use.startLine}-%`);
      if (existing) continue;
      const id = newRunId();
      const skillKey = deps.skillKeyOf(use.skillRef) ?? `unknown:${use.skillRef}`;
      const n = (deps.db.get<{ m: number | null }>("SELECT MAX(n) AS m FROM runs WHERE skill_key = ?", skillKey)?.m ?? 0) + 1;
      const events: RunEvent[] = log.events.filter((e) => e.line >= use.startLine && e.line <= use.endLine).map(({ line: _line, ...e }) => e as RunEvent);
      events.push({ t: "status", at: use.endedAt, status: "finished", reason: null });
      mkdirSync(deps.paths.runDir(id), { recursive: true });
      writeFileSync(deps.paths.events(id), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
      deps.db.run(
        `INSERT INTO runs (id, skill_key, skill_ref, n, kind, status, brief, cwd, place, project_path, created_at, started_at, ended_at, source_ref)
         VALUES (?, ?, ?, ?, 'history', 'finished', ?, ?, 'chat', ?, ?, ?, ?, ?)`,
        id, skillKey, use.skillRef, n, use.brief, log.cwd, log.cwd, use.startedAt, use.startedAt, use.endedAt, sourceRef,
      );
      recordOutputs(id, events, log.cwd);
      found++;
    }
    return found;
  }

  async function run() {
    const cfg = deps.config();
    const claudeHome = cfg.claudeHome ?? join(homedir(), ".claude");
    const files = listLogs(claudeHome, deps.now() - cfg.backfillDays * DAY);
    st = { status: "running", filesDone: 0, filesTotal: files.length, runsFound: 0, skippedLines: 0 };
    publish(true);
    for (const f of files) {
      if (cancelled) break;
      const known = deps.db.get<{ size: number; mtime: number }>("SELECT size, mtime FROM backfill_files WHERE path = ?", f.file);
      if (!known || known.size !== f.size || known.mtime !== f.mtime) {
        try {
          st.runsFound += importFile(f.file);
          deps.db.run(
            "INSERT OR REPLACE INTO backfill_files (path, size, mtime, done_at, skipped_lines) VALUES (?, ?, ?, ?, ?)",
            f.file, f.size, f.mtime, deps.now(), st.skippedLines,
          );
        } catch {
          /* one bad log never stops the rest */
        }
      }
      st.filesDone++;
      publish();
      await new Promise((r) => setImmediate(r));
    }
    st.status = "done";
    publish(true);
    deps.hub.publish("runs", { backfill: true });
  }

  return {
    start() {
      if (running) return;
      cancelled = false;
      running = run().finally(() => (running = null));
    },
    async stop() {
      cancelled = true;
      await running;
    },
    state: () => ({ ...st }),
  };
}
