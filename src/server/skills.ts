/**
 * Every skill on the machine: personal (`~/.claude/skills`), plugin (from Claude Code's installed-plugins
 * record, else the plugin cache) and the known projects' own (`<project>/.claude/skills`). Claude's files
 * are undocumented, so every read is defensive: a bad file costs one entry, never the list.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { isIgnored } from "../shared/ignore";
import { parseSkillMd } from "../shared/skill-md";
import { readWorkflowMap } from "../shared/workflow-map";
import { saveConfig, type Config } from "./config";
import type { Db } from "./db";
import type { Paths } from "./paths";
import type { Hub } from "./sse";

export type SkillSource = "personal" | "plugin" | "project";

export interface ScannedSkill {
  key: string;
  source: SkillSource;
  name: string;
  ref: string;
  description: string;
  path: string;
  plugin: string | null;
  /** The marketplace a plugin skill was installed from (the part after @ in installed_plugins.json). */
  marketplace: string | null;
  projectPath: string | null;
  warning: string | null;
  hash: string;
  hasWorkflow: boolean;
  workflowNote: string | null;
}

export interface SkillRow extends ScannedSkill {
  version: number;
  ignored: boolean;
}

export interface SkillListItem extends SkillRow {
  runs14: number[];
  rated: number;
  up: number;
  lastRunAt: number | null;
  liveRunId: string | null;
  runCount: number;
}

function dirs(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory() || d.isSymbolicLink()).map((d) => d.name);
  } catch {
    return [];
  }
}

function readSkill(dir: string, base: Omit<ScannedSkill, "name" | "ref" | "description" | "path" | "warning" | "hash" | "hasWorkflow" | "workflowNote" | "key"> & { keyPrefix: string; refPrefix: string }): ScannedSkill | null {
  const file = join(dir, "SKILL.md");
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const header = parseSkillMd(text);
  const name = header.name?.trim() || basename(dir);
  const map = readWorkflowMap(text);
  return {
    key: `${base.keyPrefix}${name}`,
    source: base.source,
    name,
    ref: `${base.refPrefix}${name}`,
    description: header.description ?? "",
    path: dir,
    plugin: base.plugin,
    marketplace: base.marketplace,
    projectPath: base.projectPath,
    warning: header.warning,
    hash: createHash("sha256").update(text).digest("hex"),
    hasWorkflow: map.status === "valid",
    workflowNote: map.status === "invalid" ? `Workflow map ignored: ${map.errors[0] ?? "it could not be read"}` : null,
  };
}

/** Plugin install folders: name -> path and marketplace, from installed_plugins.json, else the newest version in the cache. */
function pluginRoots(claudeHome: string): Map<string, { path: string; marketplace: string | null }> {
  const out = new Map<string, { path: string; marketplace: string | null }>();
  try {
    const rec = JSON.parse(readFileSync(join(claudeHome, "plugins/installed_plugins.json"), "utf8")) as { plugins?: Record<string, unknown> };
    for (const [id, entries] of Object.entries(rec.plugins ?? {})) {
      const [name = id, marketplace = null] = id.split("@") as [string?, string?];
      const list = Array.isArray(entries) ? entries : [entries];
      for (const e of list) {
        const p = (e as { installPath?: unknown })?.installPath;
        if (typeof p === "string" && existsSync(p) && !out.has(name)) out.set(name, { path: p, marketplace });
      }
    }
    if (out.size) return out;
  } catch {
    /* missing or unreadable: walk the cache */
  }
  const cache = join(claudeHome, "plugins/cache");
  for (const market of dirs(cache)) {
    for (const plugin of dirs(join(cache, market))) {
      const versions = dirs(join(cache, market, plugin))
        .map((v) => ({ v, at: statSync(join(cache, market, plugin, v)).mtimeMs }))
        .sort((a, b) => cmpVersion(b.v, a.v) || b.at - a.at);
      if (versions[0] && !out.has(plugin)) out.set(plugin, { path: join(cache, market, plugin, versions[0].v), marketplace: market });
    }
  }
  return out;
}

function cmpVersion(a: string, b: string): number {
  const x = a.split(/[.-]/).map((n) => Number.parseInt(n, 10));
  const y = b.split(/[.-]/).map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (Number.isNaN(x[i]!) ? -1 : (x[i] ?? 0)) - (Number.isNaN(y[i]!) ? -1 : (y[i] ?? 0));
    if (d) return Math.sign(d);
  }
  return 0;
}

export function scanSkills(opts: { claudeHome: string; projects: string[] }): ScannedSkill[] {
  const out: ScannedSkill[] = [];
  const personal = join(opts.claudeHome, "skills");
  for (const d of dirs(personal)) {
    const s = readSkill(join(personal, d), { source: "personal", plugin: null, marketplace: null, projectPath: null, keyPrefix: "personal:", refPrefix: "" });
    if (s) out.push(s);
  }
  for (const [plugin, { path: root, marketplace }] of pluginRoots(opts.claudeHome)) {
    const skillsDir = join(root, "skills");
    for (const d of dirs(skillsDir)) {
      const s = readSkill(join(skillsDir, d), { source: "plugin", plugin, marketplace, projectPath: null, keyPrefix: `plugin:${plugin}:`, refPrefix: `${plugin}:` });
      if (s) out.push(s);
    }
  }
  for (const project of opts.projects) {
    const skillsDir = join(project, ".claude/skills");
    for (const d of dirs(skillsDir)) {
      const s = readSkill(join(skillsDir, d), { source: "project", plugin: null, marketplace: null, projectPath: project, keyPrefix: `project:${project}:`, refPrefix: "" });
      if (s) out.push(s);
    }
  }
  // Two folders declaring the same name in one place: keep the first.
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.key) ? false : (seen.add(s.key), true)));
}

export interface SkillsService {
  list(): SkillListItem[];
  get(key: string): SkillRow | null;
  rescan(): void;
  setIgnored(key: string, ignored: boolean): void;
  start(): void;
  stop(): void;
}

const DAY = 86_400_000;

export function createSkillsService(deps: { paths: Paths; db: Db; hub: Hub; config(): Config; projects(): string[]; now(): number }): SkillsService {
  let scanned: ScannedSkill[] = [];
  let signature = "";
  const watchers: FSWatcher[] = [];
  let timer: NodeJS.Timeout | null = null;
  let debounce: NodeJS.Timeout | null = null;

  const claudeHome = () => deps.config().claudeHome ?? join(homedir(), ".claude");

  /** Records a new SKILL.md hash as the next version; returns the version for the current hash. */
  const versionOf = (key: string, hash: string): number => {
    const known = deps.db.get<{ n: number }>("SELECT n FROM skill_versions WHERE skill_key = ? AND hash = ?", key, hash);
    if (known) return known.n;
    const next = (deps.db.get<{ m: number | null }>("SELECT MAX(n) AS m FROM skill_versions WHERE skill_key = ?", key)?.m ?? 0) + 1;
    deps.db.run("INSERT INTO skill_versions (skill_key, n, hash, first_seen_at) VALUES (?, ?, ?, ?)", key, next, hash, deps.now());
    return next;
  };

  const rows = (): SkillRow[] => {
    const ignored = deps.config().ignored;
    return scanned.map((s) => ({ ...s, version: versionOf(s.key, s.hash), ignored: isIgnored(s.ref, ignored, s.marketplace) }));
  };

  const rescan = () => {
    scanned = scanSkills({ claudeHome: claudeHome(), projects: deps.projects() });
    const now = deps.now();
    deps.db.tx(() => {
      for (const s of scanned) {
        deps.db.run(
          `INSERT INTO skills (key, source, name, ref, description, path, plugin, project_path, warning, hash, has_workflow, seen_at, removed_at, marketplace)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
           ON CONFLICT(key) DO UPDATE SET source=excluded.source, name=excluded.name, ref=excluded.ref, description=excluded.description,
             path=excluded.path, plugin=excluded.plugin, project_path=excluded.project_path, warning=excluded.warning, hash=excluded.hash,
             has_workflow=excluded.has_workflow, seen_at=excluded.seen_at, removed_at=NULL, marketplace=excluded.marketplace`,
          s.key, s.source, s.name, s.ref, s.description, s.path, s.plugin, s.projectPath, s.warning, s.hash, s.hasWorkflow ? 1 : 0, now, s.marketplace,
        );
        versionOf(s.key, s.hash);
      }
      const keys = new Set(scanned.map((s) => s.key));
      for (const r of deps.db.all<{ key: string }>("SELECT key FROM skills WHERE removed_at IS NULL")) {
        if (!keys.has(r.key)) deps.db.run("UPDATE skills SET removed_at = ? WHERE key = ?", now, r.key);
      }
    });
    const sig = scanned.map((s) => `${s.key}:${s.hash}`).sort().join("|");
    if (sig !== signature) {
      signature = sig;
      deps.hub.publish("skills", { at: now });
    }
  };

  const list = (): SkillListItem[] => {
    const now = deps.now();
    return rows().map((r) => {
      const runs = deps.db.all<{ id: string; created_at: number; rating: number | null; status: string }>(
        "SELECT id, created_at, rating, status FROM runs WHERE skill_key = ? ORDER BY created_at DESC", r.key,
      );
      const runs14 = new Array<number>(14).fill(0);
      for (const run of runs) {
        const ago = Math.floor((now - run.created_at) / DAY);
        if (ago >= 0 && ago < 14) runs14[13 - ago]! += 1;
      }
      const rated = runs.filter((x) => x.rating !== null);
      const live = runs.find((x) => x.status === "queued" || x.status === "running" || x.status === "waiting");
      return {
        ...r,
        runs14,
        rated: rated.length,
        up: rated.filter((x) => x.rating! > 0).length,
        lastRunAt: runs[0]?.created_at ?? null,
        liveRunId: live?.id ?? null,
        runCount: runs.length,
      };
    });
  };

  const schedule = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      try {
        rescan();
      } catch {
        /* a failed rescan keeps the last list; the 60 s rescan tries again */
      }
    }, 500);
  };

  return {
    list,
    get: (key) => rows().find((r) => r.key === key) ?? null,
    rescan,
    setIgnored(key, ignored) {
      const row = scanned.find((s) => s.key === key);
      if (!row) return;
      const current = deps.config().ignored.filter((p) => p !== row.ref);
      saveConfig(deps.paths, { ignored: ignored ? [...current, row.ref] : current });
      deps.hub.publish("skills", { at: deps.now() });
    },
    start() {
      rescan();
      const folders = [join(claudeHome(), "skills"), join(claudeHome(), "plugins"), ...deps.projects().map((p) => join(p, ".claude/skills"))];
      for (const f of folders) {
        try {
          watchers.push(watch(f, { recursive: true }, schedule));
        } catch {
          /* a folder that does not exist yet is caught by the periodic rescan */
        }
      }
      timer = setInterval(schedule, 60_000);
      timer.unref?.();
    },
    stop() {
      for (const w of watchers.splice(0)) w.close();
      if (timer) clearInterval(timer);
      if (debounce) clearTimeout(debounce);
    },
  };
}
