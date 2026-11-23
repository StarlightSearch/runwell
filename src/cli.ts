/**
 * `runwell` / `npx runwell`: open the dashboard, open the last run, start a run, or just make sure the
 * server is up (`ensure`, used by the Claude Code hook and mod).
 */
import { ensureServer, NODE_HINT, nodeOk, openUrl as defaultOpen, type EnsureOptions } from "./launcher";
import { VERSION } from "./shared/version";
import type { ServerInfo } from "./server/lifecycle";

export interface CliDeps {
  out(s: string): void;
  err(s: string): void;
  openUrl(url: string): void;
  cwd: string;
  ensure?: EnsureOptions;
  nodeVersion?: string;
}

type Skill = { key: string; ref: string; name: string };
type Run = { id: string; n: number; skillRef: string };

async function call<T>(info: ServerInfo, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: T }> {
  const r = await fetch(`http://127.0.0.1:${info.port}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as T };
}

function flag(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1] ?? null;
  args.splice(i, 2);
  return v;
}

/** Resolves a skill by exact ref, then by a unique name. */
export function resolveSkill(skills: Skill[], q: string): { skill: Skill | null; candidates: Skill[] } {
  const exact = skills.filter((s) => s.ref === q || s.ref === q.replace(/^\//, ""));
  if (exact.length === 1) return { skill: exact[0]!, candidates: [] };
  const byName = skills.filter((s) => s.name === q || s.ref.endsWith(`:${q}`));
  if (byName.length === 1) return { skill: byName[0]!, candidates: [] };
  return { skill: null, candidates: byName.length ? byName : exact };
}

export async function main(argv: string[], deps: CliDeps): Promise<number> {
  const args = [...argv];
  if (args[0] === "--version" || args[0] === "-v") {
    deps.out(VERSION);
    return 0;
  }
  if (!nodeOk(deps.nodeVersion)) {
    deps.err(NODE_HINT);
    return 1;
  }
  const cmd = args.shift() ?? "open";
  if (cmd === "ensure") {
    try {
      await ensureServer({ ...deps.ensure, wait: false });
    } catch {
      /* ensure never fails its caller */
    }
    return 0;
  }
  const cwd = flag(args, "--cwd") ?? deps.cwd;
  const info = await ensureServer({ ...deps.ensure, wait: true });
  if (!info) {
    deps.err("Runwell could not start. Run npx runwell again, or see ~/.runwell for details.");
    return 1;
  }
  const open = async (to: string) => {
    const { body } = await call<{ url: string }>(info, "/api/auth/link", { method: "POST", body: { to } });
    deps.openUrl(body.url);
  };

  if (cmd === "open") {
    await open(args[0] ?? "/");
    deps.out(`Runwell is open at http://127.0.0.1:${info.port}`);
    return 0;
  }
  if (cmd === "last") {
    const { body } = await call<{ run: Run | null }>(info, `/api/runs/latest?cwd=${encodeURIComponent(cwd)}`);
    if (!body.run) {
      await open("/runs");
      deps.out("No runs yet.");
      return 0;
    }
    await open(`/runs/${body.run.id}`);
    deps.out(`Opened ${body.run.skillRef} #${body.run.n}`);
    return 0;
  }
  if (cmd === "run") {
    const q = args.shift();
    if (!q) {
      deps.err("Usage: runwell run <skill> [brief]");
      return 1;
    }
    const { body } = await call<{ skills: Skill[] }>(info, "/api/skills");
    const { skill, candidates } = resolveSkill(body.skills ?? [], q);
    if (!skill) {
      deps.err(candidates.length ? `More than one skill matches "${q}": ${candidates.map((s) => s.ref).join(", ")}` : `No skill named "${q}".`);
      return 1;
    }
    const projects = (await call<{ projects: { path: string; trusted: boolean }[] }>(info, "/api/projects")).body.projects ?? [];
    const contextProject = projects.some((p) => p.path === cwd && p.trusted) ? cwd : null;
    const r = await call<{ run?: Run; message?: string; error?: string }>(info, "/api/runs", { method: "POST", body: { skillKey: skill.key, brief: args.join(" "), place: { kind: "folder", contextProject } } });
    if (!r.body.run) {
      deps.err(r.body.message ?? r.body.error ?? "The run could not start.");
      return 1;
    }
    await open(`/runs/${r.body.run.id}`);
    deps.out(`Started ${skill.ref} #${r.body.run.n}`);
    return 0;
  }
  deps.err(`Unknown command "${cmd}". Commands: open, last, run <skill> [brief], ensure, --version`);
  return 1;
}
