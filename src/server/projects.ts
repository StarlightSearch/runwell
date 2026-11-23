/**
 * The folders the person already uses Claude Code in, from Claude's own records:
 * - `~/.claude.json` -> `projects`: keyed by real path, with `hasTrustDialogAccepted`. Only those two
 *   things are read; the rest of that file (it holds account details) is never kept.
 * - `~/.claude/projects/<encoded>/*.jsonl`: the folder name is a lossy encoding of the path, so the real
 *   path is the `cwd` field inside the newest log.
 * Both are undocumented: a bad file costs that source, never a crash.
 */
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { isRunwellFolder } from "./paths";

export interface ProjectRow {
  path: string;
  name: string;
  trusted: boolean;
  lastUsedAt: number | null;
  skillCount: number;
}

const HEAD_BYTES = 2 * 1024 * 1024;
const HEAD_LINES = 200;

/** The first `cwd` among the first lines of a log, reading at most the first 2 MB. */
function cwdOf(file: string): string | null {
  let fd: number | null = null;
  try {
    fd = openSync(file, "r");
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = readSync(fd, buf, 0, HEAD_BYTES, 0);
    const lines = buf.subarray(0, n).toString("utf8").split("\n").slice(0, HEAD_LINES);
    for (const line of lines) {
      if (!line.includes('"cwd"')) continue;
      try {
        const v = JSON.parse(line) as { cwd?: unknown };
        if (typeof v.cwd === "string" && v.cwd.startsWith("/")) return v.cwd;
      } catch {
        /* a cut-off or odd line: try the next */
      }
    }
  } catch {
    /* unreadable log */
  } finally {
    if (fd !== null) closeSync(fd);
  }
  return null;
}

function readTrust(claudeJson: string): Map<string, boolean> | null {
  try {
    const raw = JSON.parse(readFileSync(claudeJson, "utf8")) as { projects?: unknown };
    const out = new Map<string, boolean>();
    if (raw.projects && typeof raw.projects === "object") {
      for (const [path, v] of Object.entries(raw.projects as Record<string, unknown>)) {
        out.set(path, !!v && typeof v === "object" && (v as { hasTrustDialogAccepted?: unknown }).hasTrustDialogAccepted === true);
      }
    }
    return out;
  } catch {
    return null;
  }
}

function readLogs(claudeHome: string): Map<string, number> | null {
  const root = join(claudeHome, "projects");
  let folders: string[];
  try {
    folders = readdirSync(root);
  } catch {
    return null;
  }
  const out = new Map<string, number>();
  for (const f of folders) {
    const dir = join(root, f);
    let logs: { file: string; at: number }[] = [];
    try {
      logs = readdirSync(dir)
        .filter((x) => x.endsWith(".jsonl"))
        .map((x) => ({ file: join(dir, x), at: statSync(join(dir, x)).mtimeMs }))
        .sort((a, b) => b.at - a.at);
    } catch {
      continue;
    }
    const newest = logs[0];
    if (!newest) continue;
    const cwd = cwdOf(newest.file);
    if (cwd && (out.get(cwd) ?? 0) < newest.at) out.set(cwd, Math.round(newest.at));
  }
  return out;
}

function skillCount(path: string): number {
  try {
    return readdirSync(join(path, ".claude/skills"), { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(path, ".claude/skills", d.name, "SKILL.md"))).length;
  } catch {
    return 0;
  }
}

export function scanProjects(claudeHome: string, claudeJson: string, runwellRoot?: string): { projects: ProjectRow[]; readable: boolean } {
  const trust = readTrust(claudeJson);
  const logs = readLogs(claudeHome);
  if (!trust && !logs) return { projects: [], readable: false };
  const paths = new Set([...(trust?.keys() ?? []), ...(logs?.keys() ?? [])]);
  const projects: ProjectRow[] = [];
  for (const path of paths) {
    if (path.includes("/.claude/worktrees/")) continue;
    if (runwellRoot && isRunwellFolder(path, runwellRoot)) continue;
    try {
      if (!statSync(path).isDirectory()) continue;
    } catch {
      continue;
    }
    projects.push({ path, name: basename(path), trusted: trust?.get(path) ?? false, lastUsedAt: logs?.get(path) ?? null, skillCount: skillCount(path) });
  }
  projects.sort((a, b) => (b.lastUsedAt ?? -1) - (a.lastUsedAt ?? -1) || a.name.localeCompare(b.name));
  return { projects, readable: true };
}

export function trustOf(projects: ProjectRow[], path: string): "trusted" | "untrusted" {
  return projects.find((p) => p.path === path)?.trusted ? "trusted" : "untrusted";
}

function hasHooks(file: string): boolean {
  try {
    const v = JSON.parse(readFileSync(file, "utf8")) as { hooks?: unknown };
    return !!v && typeof v === "object" && "hooks" in v;
  } catch {
    return false;
  }
}

/** What the Run dialog says before running in a folder: does it exist, is it trusted, what may run there. */
export function checkProject(path: string, projects: ProjectRow[]): { exists: boolean; trusted: boolean; hooks: boolean; mcp: boolean } {
  let exists = false;
  try {
    exists = statSync(path).isDirectory();
  } catch {
    /* missing */
  }
  if (!exists) return { exists: false, trusted: false, hooks: false, mcp: false };
  return {
    exists,
    trusted: trustOf(projects, path) === "trusted",
    hooks: hasHooks(join(path, ".claude/settings.json")) || hasHooks(join(path, ".claude/settings.local.json")),
    mcp: existsSync(join(path, ".mcp.json")),
  };
}
