/**
 * Where a run's workflow comes from: the skill's own `pulsar-workflow` map; else a drawing cached in
 * `~/.pulsar-workflows/workflows/<SKILL.md hash>.json`; else nothing. A drawing is made only when a button run
 * starts or the person clicks "Draw workflow": the person's own `claude` reads the SKILL.md once.
 * Nothing is ever written into the skill's folder.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkflowSource } from "../shared/api";
import type { OverviewStep } from "../shared/graph/source-types";
import { parseOverviewSteps, readWorkflowMap } from "../shared/workflow-map";
import type { Paths } from "./paths";
import type { SkillRow } from "./skills";

export const DRAW_PROMPT =
  'Read the skill below and list its steps as JSON only, no prose: {"steps":[{"title":string (at most 40 characters),"detail":string (at most 160),"kind":"action"|"decision"|"loop","children"?:[steps, only for a loop],"maxPasses"?:number (only for a loop that states a limit),"agents"?:[{"name":string,"role":string}] (only subagents the skill names)}]}. At most 8 steps, loops nest once. Do not use any tools.';

const NONE: WorkflowSource = { steps: null, from: "none", note: null };

function readSkillMd(skill: SkillRow): string | null {
  try {
    return readFileSync(join(skill.path, "SKILL.md"), "utf8");
  } catch {
    return null;
  }
}

const cacheFile = (p: Paths, hash: string) => join(p.workflows, `${hash.replace(/[^0-9a-zA-Z]/g, "")}.json`);

/** Whether Claude has drawn this version of the skill (a cheap file check, for lists). */
export function hasDrawing(skill: { hash: string }, p: Paths): boolean {
  return existsSync(cacheFile(p, skill.hash));
}

/** The block, or a cached drawing, or none. Never spawns anything. */
export function cachedWorkflow(skill: SkillRow, p: Paths): WorkflowSource {
  const md = readSkillMd(skill);
  let note: string | null = null;
  if (md !== null) {
    const map = readWorkflowMap(md);
    if (map.status === "valid") return { steps: map.map.steps, from: "block", note: null };
    if (map.status === "invalid") note = `Workflow map ignored: ${map.errors[0] ?? "it could not be read"}`;
  }
  try {
    const cached = JSON.parse(readFileSync(cacheFile(p, skill.hash), "utf8")) as { steps?: unknown };
    const errors: string[] = [];
    const steps = parseOverviewSteps(cached.steps, "steps", "s", errors);
    if (!errors.length && steps.length) return { steps, from: "drawn", note };
  } catch {
    /* no drawing yet */
  }
  return { ...NONE, note };
}

/** The first JSON object in a model's answer, tolerating prose and a code fence around it. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1));
    } catch {
      /* try the next */
    }
  }
  return null;
}

export interface WorkflowService {
  cachedWorkflow(skill: SkillRow): WorkflowSource;
  resolveWorkflow(skill: SkillRow, opts: { draw: boolean }): Promise<WorkflowSource>;
  drawWorkflow(skill: SkillRow): Promise<OverviewStep[] | null>;
}

export function createWorkflowService(deps: { paths: Paths; claudeBin(): string | null; extraEnv?: Record<string, string>; timeoutMs?: number }): WorkflowService {
  const timeoutMs = deps.timeoutMs ?? 90_000;
  const drawing = new Map<string, Promise<OverviewStep[] | null>>();

  function runClaude(bin: string, skillMd: string): Promise<string | null> {
    const cwd = mkdtempSync(join(tmpdir(), "workflows-draw-"));
    return new Promise((resolve) => {
      let out = "";
      let settled = false;
      const done = (v: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        rmSync(cwd, { recursive: true, force: true });
        resolve(v);
      };
      const child = spawn(bin, ["-p", DRAW_PROMPT, "--output-format", "json"], { cwd, env: { ...process.env, ...deps.extraEnv }, stdio: ["pipe", "pipe", "ignore"] });
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        done(null);
      }, timeoutMs);
      child.stdout.on("data", (d) => (out += d));
      child.on("error", () => done(null));
      child.on("close", (code) => done(code === 0 ? out : null));
      child.stdin.on("error", () => {});
      child.stdin.end(skillMd.endsWith("\n") ? skillMd : skillMd + "\n");
    });
  }

  async function draw(skill: SkillRow): Promise<OverviewStep[] | null> {
    const bin = deps.claudeBin();
    const md = readSkillMd(skill);
    if (!bin || md === null) return null;
    const out = await runClaude(bin, md);
    if (!out) return null;
    // --output-format json prints one result object (possibly after other lines); find it.
    let answer: string | null = null;
    for (const line of out.split("\n").reverse()) {
      try {
        const v = JSON.parse(line) as { type?: unknown; result?: unknown; is_error?: unknown };
        if (typeof v.result === "string" && v.is_error !== true) {
          answer = v.result;
          break;
        }
      } catch {
        /* not this line */
      }
    }
    if (answer === null) return null;
    const raw = extractJson(answer) as { steps?: unknown } | null;
    if (!raw) return null;
    const errors: string[] = [];
    const steps = parseOverviewSteps(raw.steps, "steps", "s", errors);
    if (errors.length || !steps.length) return null;
    mkdirSync(deps.paths.workflows, { recursive: true });
    writeFileSync(cacheFile(deps.paths, skill.hash), JSON.stringify({ steps: raw.steps, drawnAt: Date.now() }));
    return steps;
  }

  return {
    cachedWorkflow: (skill) => cachedWorkflow(skill, deps.paths),
    async resolveWorkflow(skill, opts) {
      const cached = cachedWorkflow(skill, deps.paths);
      if (cached.from !== "none" || !opts.draw) return cached;
      const steps = await this.drawWorkflow(skill);
      return steps ? { steps, from: "drawn", note: cached.note } : cached;
    },
    drawWorkflow(skill) {
      // One drawing per SKILL.md version at a time.
      const inflight = drawing.get(skill.hash);
      if (inflight) return inflight;
      const p = draw(skill).catch(() => null).finally(() => drawing.delete(skill.hash));
      drawing.set(skill.hash, p);
      return p;
    },
  };
}
