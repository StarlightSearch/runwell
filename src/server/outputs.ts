/**
 * What a run produced. Fresh-folder runs: everything in `work/` (already in Workflows' folder, so nothing
 * is copied). Runs in a project: files the run's Write/Edit calls named ("written") plus files changed in
 * the project during the run ("probably"), copied into `runs/<id>/outputs/` within the size caps.
 * Either kind also keeps files outside its folder that the run pointed to by path (`~/...`, see pointedFiles).
 * Symlinks are never followed and nothing outside the folder is ever served.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { outputKind } from "../shared/outputs";
import type { RunEvent } from "../shared/events";
import type { Config } from "./config";
import type { Db } from "./db";
import type { Paths } from "./paths";
import type { RunRow } from "./runs";

export interface OutputRow {
  runId: string;
  path: string;
  label: "written" | "probably" | "history";
  kind: ReturnType<typeof outputKind>;
  bytes: number;
  mtime: number;
  copied: boolean;
  hash: string | null;
}

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "out", "target", ".venv", "__pycache__", ".cache"]);
const SCAN_LIMIT = 20_000;
const MTIME_SLACK_MS = 2_000;

/** A small .gitignore reader: plain names, `dir/`, `*.ext` and a leading `/`. No git command is run. */
function gitignore(root: string): (rel: string, isDir: boolean) => boolean {
  let lines: string[] = [];
  try {
    lines = readFileSync(join(root, ".gitignore"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("!"));
  } catch {
    return () => false;
  }
  return (rel, isDir) => {
    const parts = rel.split("/");
    const name = parts.at(-1)!;
    return lines.some((raw) => {
      const dirOnly = raw.endsWith("/");
      const anchored = raw.startsWith("/");
      const pat = raw.replace(/^\//, "").replace(/\/$/, "");
      if (dirOnly && !isDir) return parts.slice(0, -1).some((p) => p === pat);
      if (pat.startsWith("*.")) return name.endsWith(pat.slice(1));
      if (anchored) return rel === pat || rel.startsWith(pat + "/");
      return parts.includes(pat);
    });
  };
}

function walk(root: string, visit: (rel: string, abs: string) => void, opts: { skipDirs: boolean; ignored?: (rel: string, isDir: boolean) => boolean }): void {
  let seen = 0;
  const stack = [""];
  while (stack.length && seen < SCAN_LIMIT) {
    const relDir = stack.pop()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(join(root, relDir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (++seen > SCAN_LIMIT) break;
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (opts.skipDirs && (SKIP_DIRS.has(e.name) || e.name.startsWith("."))) continue;
        if (opts.ignored?.(rel, true)) continue;
        stack.push(rel);
      } else if (e.isFile()) {
        // In a project, hidden files (.env and the like) are never kept.
        if (opts.skipDirs && e.name.startsWith(".")) continue;
        if (opts.ignored?.(rel, false)) continue;
        visit(rel, join(root, rel));
      }
    }
  }
}

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** The paths a run's file-writing tools named, absolute. */
function writtenPaths(events: RunEvent[]): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (e.t !== "tool.start" || !WRITE_TOOLS.has(e.name)) continue;
    const p = e.input.file_path ?? e.input.notebook_path;
    if (typeof p === "string" && isAbsolute(p)) out.push(p);
  }
  return out;
}

const inside = (root: string, abs: string) => {
  const rel = relative(root, abs);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

/** Files a run names by path, in what it said or did: `~/Downloads/ad.mp4`, `/home/me/out/report.pdf`. */
const NAMED_FILE = /(?:~|\/)[^\s"'`<>()|;&*?\\]+?\.(?:mp4|mov|webm|gif|png|jpe?g|webp|svg|pdf|html?|md|csv|tsv|xlsx|docx|pptx|mp3|wav|m4a|zip|txt|json)(?![\w.])/gi;

/**
 * Files outside the run's own folder that the run pointed to by path (a skill that saves its result to
 * ~/Downloads, say) and that were written during the run. Only under the home folder, never in a temp
 * folder (intermediate files), Workflows' own data, or anything hidden (a dot file or dot folder). Stored as
 * `~/<path>`.
 */
export function pointedFiles(events: RunEvent[], window: { from: number; to: number }, skip: string[], home: string): { rel: string; abs: string }[] {
  const texts: string[] = [];
  for (const e of events) {
    if (e.t === "text") texts.push(e.text);
    else if (e.t === "tool.start") texts.push(JSON.stringify(e.input));
    else if (e.t === "tool.end") texts.push(e.result);
  }
  const seen = new Map<string, string>();
  // Temp folders hold intermediate files; ignored unless the home folder itself is in one (tests).
  const temp = [tmpdir(), "/tmp", "/var/folders", "/private/var"].filter((d) => !(home + sep).startsWith(d + sep));
  for (const t of texts) {
    for (const m of t.replace(/\\n/g, " ").matchAll(NAMED_FILE)) {
      const raw = m[0];
      const abs = resolve(raw.startsWith("~/") ? join(home, raw.slice(2)) : raw);
      if (seen.has(abs) || !abs.startsWith(home + sep)) continue;
      // Never anything hidden: ~/.claude.json, ~/.claude/, ~/.ssh/, ~/.config/ hold settings and credentials.
      if (relative(home, abs).split(sep).some((part) => part.startsWith("."))) continue;
      if ([...skip, ...temp].some((d) => abs === d || abs.startsWith(d + sep))) continue;
      try {
        const st = lstatSync(abs);
        if (!st.isFile() || st.mtimeMs < window.from || st.mtimeMs > window.to) continue;
      } catch {
        continue;
      }
      seen.set(abs, `~/${relative(home, abs).split(sep).join("/")}`);
      if (seen.size >= 20) break;
    }
  }
  return [...seen].map(([abs, rel]) => ({ abs, rel }));
}

export function collectOutputs(run: RunRow, events: RunEvent[], cfg: Config, p: Paths, home = homedir()): OutputRow[] {
  const from = (run.startedAt ?? run.createdAt) - MTIME_SLACK_MS;
  const to = (run.endedAt ?? Date.now()) + MTIME_SLACK_MS;
  const own = run.place === "folder" ? p.work(run.id) : (run.projectPath ?? run.cwd);
  const pointed = pointedFiles(events, { from, to }, [own, p.root], home);

  const rows: OutputRow[] = [];
  /** rel -> where it is and how sure we are; copied into outputs/ within the caps. */
  const found = new Map<string, { abs: string; label: "written" | "probably" }>();
  if (run.place === "folder") {
    walk(own, (rel, abs) => {
      const st = statSync(abs);
      rows.push({ runId: run.id, path: rel, label: "written", kind: outputKind(rel), bytes: st.size, mtime: Math.round(st.mtimeMs), copied: false, hash: null });
    }, { skipDirs: false });
  } else {
    for (const abs of writtenPaths(events)) {
      if (!inside(own, abs)) continue;
      try {
        if (!lstatSync(abs).isFile()) continue;
      } catch {
        continue;
      }
      found.set(relative(own, abs).split(sep).join("/"), { abs, label: "written" });
    }
    walk(own, (rel, abs) => {
      if (found.has(rel)) return;
      const m = statSync(abs).mtimeMs;
      if (m >= from && m <= to) found.set(rel, { abs, label: "probably" });
    }, { skipDirs: true, ignored: gitignore(own) });
  }
  const written = new Set(writtenPaths(events).map((a) => resolve(a)));
  for (const f of pointed) found.set(f.rel, { abs: f.abs, label: written.has(f.abs) ? "written" : "probably" });

  let copiedBytes = 0;
  for (const [rel, { abs, label }] of found) {
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    let copied = false;
    let hash: string | null = null;
    if (st.size <= cfg.copyFileCapBytes && copiedBytes + st.size <= cfg.copyRunCapBytes) {
      try {
        const dest = join(p.outputs(run.id), rel);
        mkdirSync(join(dest, ".."), { recursive: true });
        copyFileSync(abs, dest);
        copied = true;
        copiedBytes += st.size;
      } catch {
        continue;
      }
    } else {
      try {
        hash = sha256(abs);
      } catch {
        continue;
      }
    }
    rows.push({ runId: run.id, path: rel, label, kind: outputKind(rel), bytes: st.size, mtime: Math.round(st.mtimeMs), copied, hash });
  }
  return rows;
}

/** The absolute file to serve for `rel`, or null when it would leave the run's folder. */
export function outputFile(run: RunRow, rel: string, p: Paths): string | null {
  if (!rel || isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) return null;
  // Files from outside the run's folder (`~/...`) are kept in outputs/, also for a fresh-folder run.
  const base = run.place === "folder" && !rel.startsWith("~/") ? p.work(run.id) : p.outputs(run.id);
  const abs = join(base, rel);
  try {
    const real = realpathSync(abs);
    const realBase = realpathSync(base);
    if (!real.startsWith(realBase + sep)) return null;
    return statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

const grantKey = (token: string) => createHmac("sha256", token).update("workflows-output-grant-v1").digest();

/** A path-scoped grant for one run's files, good for an hour: `<exp>.<mac>`. */
export function grantFor(token: string, runId: string, now: number): string {
  const exp = now + 3_600_000;
  const mac = createHmac("sha256", grantKey(token)).update(`${runId}:${exp}`).digest("base64url");
  return `${exp}.${mac}`;
}

export function checkGrant(token: string, runId: string, grant: string, now: number): boolean {
  const [expStr, mac] = grant.split(".");
  const exp = Number(expStr);
  if (!mac || !Number.isFinite(exp) || exp < now) return false;
  const want = Buffer.from(createHmac("sha256", grantKey(token)).update(`${runId}:${exp}`).digest("base64url"));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got);
}

export interface OutputsService {
  collect(run: RunRow, events: RunEvent[]): Promise<void>;
  list(runId: string): OutputRow[];
  recent(q: { skill?: string; kind?: string; before?: number; limit?: number }): (OutputRow & { skillRef: string; runN: number; runCreatedAt: number })[];
  grant(runId: string): string;
  checkGrant(runId: string, grant: string): boolean;
  file(run: RunRow, rel: string): string | null;
  reveal(file: string): void;
}

type DbOut = { run_id: string; path: string; label: OutputRow["label"]; kind: OutputRow["kind"]; bytes: number; mtime: number; copied: number; hash: string | null };
const toOut = (r: DbOut): OutputRow => ({ runId: r.run_id, path: r.path, label: r.label, kind: r.kind, bytes: r.bytes, mtime: r.mtime, copied: !!r.copied, hash: r.hash });

export function createOutputsService(deps: { paths: Paths; db: Db; config(): Config; token(): string; now(): number; reveal(file: string): void }): OutputsService {
  return {
    async collect(run, events) {
      const rows = collectOutputs(run, events, deps.config(), deps.paths);
      deps.db.tx(() => {
        deps.db.run("DELETE FROM outputs WHERE run_id = ?", run.id);
        for (const r of rows) {
          deps.db.run("INSERT INTO outputs (run_id, path, label, kind, bytes, mtime, copied, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", r.runId, r.path, r.label, r.kind, r.bytes, r.mtime, r.copied ? 1 : 0, r.hash);
        }
      });
    },
    list: (runId) => deps.db.all<DbOut>("SELECT * FROM outputs WHERE run_id = ? ORDER BY path", runId).map(toOut),
    recent(q) {
      const where = ["1 = 1"];
      const params: (string | number)[] = [];
      if (q.skill) (where.push("r.skill_key = ?"), params.push(q.skill));
      if (q.kind) (where.push("o.kind = ?"), params.push(q.kind));
      if (q.before) (where.push("r.created_at < ?"), params.push(q.before));
      params.push(Math.min(Math.max(q.limit ?? 60, 1), 500));
      return deps.db
        .all<DbOut & { skill_ref: string; n: number; created_at: number }>(
          `SELECT o.*, r.skill_ref, r.n, r.created_at FROM outputs o JOIN runs r ON r.id = o.run_id WHERE ${where.join(" AND ")} ORDER BY r.created_at DESC, o.path LIMIT ?`,
          ...params,
        )
        .map((r) => ({ ...toOut(r), skillRef: r.skill_ref, runN: r.n, runCreatedAt: r.created_at }));
    },
    grant: (runId) => grantFor(deps.token(), runId, deps.now()),
    checkGrant: (runId, grant) => checkGrant(deps.token(), runId, grant, deps.now()),
    file: (run, rel) => outputFile(run, rel, deps.paths),
    reveal: (file) => deps.reveal(file),
  };
}
