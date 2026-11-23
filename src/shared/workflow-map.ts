// Ported from Pulsar (Starlight), released here under the MIT license.
/**
 * The `pulsar-workflow` map a workflow SKILL.md may end with (under "## Workflow map").
 * A valid map fixes the steps, loops, loop limits and declared agents the graph draws.
 * Steps get ids from their position ("s1", "s3.1"). A map that fails a check is `invalid`
 * and ignored, with a reason the page shows. Never throws.
 */
import type { OverviewStep } from "./graph/source-types";

export interface WorkflowMap {
  steps: OverviewStep[];
}

export type WorkflowMapResult = { status: "none" } | { status: "valid"; map: WorkflowMap } | { status: "invalid"; errors: string[] };

export const WORKFLOW_MAP_MAX_BYTES = 8192;
const MAX_STEP_DEPTH = 2;
const MAX_STEPS = 8;
const MAX_AGENTS = 6;
const MAX_AGENT_NAME = 40;
const STEP_KINDS = new Set(["action", "decision", "loop"]);

const OPEN = /^\s*```pulsar-workflow\s*$/;
const CLOSE = /^\s*```\s*$/;
const FENCE_LINE = /^\s*(`{3,}|~{3,})(.*)$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function looseKey(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const isWs = (c: string) => /\s/.test(c);
/** What `.` in a regex refuses: a line terminator. */
const isTerminator = (c: string) => c === "\n" || c === "\r" || c === " " || c === " ";

/**
 * An ATX heading line exactly as `/^(#{min,max})\s+(.+?)\s*#*\s*$/` reads it,
 * in linear time. That regex backtracks cubically on "## a", thousands of
 * spaces, then a letter (4,000 spaces took 24 s), and a SKILL.md is
 * user-written, so the line is read by hand. Same result for every input.
 */
export function parseHeading(line: string, min: number, max: number): { level: number; title: string } | null {
  let n = 0;
  while (n < line.length && line[n] === "#") n++;
  if (n < min || n > max) return null;
  const s = line.slice(n);
  if (!s || !isWs(s[0])) return null;
  let lead = 0;
  while (lead < s.length && isWs(s[lead])) lead++;
  const t = s.slice(lead);
  if (!t) {
    // Only whitespace: the greedy \s+ gives its last usable character back to the title.
    for (let k = s.length - 1; k >= 1; k--) if (!isTerminator(s[k])) return { level: n, title: s[k] };
    return null;
  }
  // Drop the longest suffix of the form \s*#*\s*, keeping at least one title character.
  let j = t.length;
  while (j > 0 && isWs(t[j - 1])) j--;
  while (j > 0 && t[j - 1] === "#") j--;
  while (j > 0 && isWs(t[j - 1])) j--;
  const title = t.slice(0, Math.max(1, j));
  for (const c of title) if (isTerminator(c)) return null;
  return { level: n, title };
}

/** `s.replace(/\s*\([^)]*\)\s*$/, "")` in linear time (the regex is quadratic on long runs of spaces or "("). */
export function stripTrailingParens(s: string): string {
  let e = s.length;
  while (e > 0 && isWs(s[e - 1])) e--;
  if (e === 0 || s[e - 1] !== ")") return s;
  const close = e - 1;
  const open = s.indexOf("(", s.lastIndexOf(")", close - 1) + 1);
  if (open < 0 || open >= close) return s;
  let start = open;
  while (start > 0 && isWs(s[start - 1])) start--;
  return s.slice(0, start);
}

/** Word-boundary clip with an ellipsis. */
export function clipText(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const atWord = cut.replace(/\s+\S*$/, "");
  return `${atWord.length > n * 0.6 ? atWord : cut}…`;
}

/** The document's headings (outside code fences), keyed loosely. */
export function skillHeadings(md: string): Map<string, string> {
  const out = new Map<string, string>();
  let inFence = false;
  for (const line of md.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = parseHeading(line, 1, 6);
    if (!m) continue;
    const title = m.title;
    for (const key of [looseKey(title), looseKey(stripTrailingParens(title))]) {
      if (key && !out.has(key)) out.set(key, title);
    }
  }
  return out;
}

/** Steps with ids from their position: "s" -> s1, s2; a child of s3 -> s3.1. Errors are pushed, never thrown. */
export function parseOverviewSteps(v: unknown, where: string, idPrefix: string, errors: string[], depth = 0): OverviewStep[] {
  if (!Array.isArray(v)) {
    errors.push(`${where}: expected an array`);
    return [];
  }
  return v.slice(0, MAX_STEPS).map((s, i): OverviewStep => {
    const w = `${where}[${i}]`;
    const id = `${idPrefix}${i + 1}`;
    if (!isObj(s) || typeof s.title !== "string" || typeof s.detail !== "string") {
      errors.push(`${w}: needs string title and detail`);
      return { id, title: "", detail: "", kind: "action" };
    }
    if (typeof s.kind !== "string" || !STEP_KINDS.has(s.kind)) errors.push(`${w}.kind: "${String(s.kind)}" is not action, decision or loop`);
    const step: OverviewStep = {
      id,
      title: clipText(s.title, 40),
      detail: clipText(s.detail, 160),
      kind: (STEP_KINDS.has(String(s.kind)) ? s.kind : "action") as OverviewStep["kind"],
    };
    if (s.branches !== undefined) {
      if (!Array.isArray(s.branches) || s.branches.some((b) => !isObj(b) || typeof b.when !== "string" || typeof b.then !== "string")) {
        errors.push(`${w}.branches: expected [{when, then}]`);
      } else {
        step.branches = (s.branches as { when: string; then: string }[])
          .slice(0, 4)
          .map((b) => ({ when: clipText(b.when, 90), then: clipText(b.then, 90) }));
      }
    }
    if (Array.isArray(s.agents)) {
      const agents = s.agents
        .filter((a): a is { name: string; role: string } => isObj(a) && typeof a.name === "string" && a.name.trim() !== "" && typeof a.role === "string")
        .slice(0, MAX_AGENTS)
        .map((a) => ({ name: clipText(a.name.trim(), 40), role: clipText(a.role, 120) }));
      if (agents.length) step.agents = agents;
    }
    if (step.kind === "loop" && typeof s.maxPasses === "number" && Number.isInteger(s.maxPasses) && s.maxPasses >= 1 && s.maxPasses <= 10) {
      step.maxPasses = s.maxPasses;
    }
    if (step.kind === "decision" && !step.branches?.length) step.kind = "action";
    if (s.children !== undefined) {
      if (depth >= MAX_STEP_DEPTH) errors.push(`${w}.children: nested deeper than ${MAX_STEP_DEPTH}`);
      else {
        const children = parseOverviewSteps(s.children, `${w}.children`, `${id}.`, errors, depth + 1);
        if (children.length) step.children = children;
      }
    }
    return step;
  });
}

function fenceOf(line: string): { ch: string; len: number; rest: string } | null {
  const m = FENCE_LINE.exec(line);
  if (!m) return null;
  if (m[1][0] === "`" && m[2].includes("`")) return null;
  return { ch: m[1][0], len: m[1].length, rest: m[2] };
}

function locate(md: string): { none: true } | { error: string } | { text: string; prose: string } {
  const lines = md.split("\n");
  let open: { ch: string; len: number } | null = null;
  let start = -1;
  let end = -1;
  let blocks = 0;
  let unclosed = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!open && OPEN.test(line)) {
      blocks++;
      let close = -1;
      for (let j = i + 1; j < lines.length; j++) {
        if (CLOSE.test(lines[j])) {
          close = j;
          break;
        }
      }
      if (close < 0) {
        unclosed = true;
        break;
      }
      if (blocks === 1) {
        start = i;
        end = close;
      }
      i = close;
      continue;
    }
    const f = fenceOf(line);
    if (!f) continue;
    if (!open) open = { ch: f.ch, len: f.len };
    else if (f.ch === open.ch && f.len >= open.len && f.rest.trim() === "") open = null;
  }
  if (blocks === 0) return { none: true };
  if (blocks > 1) return { error: "more than one map" };
  if (unclosed) return { error: "the map's code block is not closed" };
  return { text: lines.slice(start + 1, end).join("\n"), prose: [...lines.slice(0, start), ...lines.slice(end + 1)].join("\n") };
}

function walk(steps: unknown, depth: number, visit: (s: Record<string, unknown>, depth: number) => void): void {
  if (!Array.isArray(steps)) return;
  for (const s of steps) {
    if (!isObj(s)) continue;
    visit(s, depth);
    walk(s.children, depth + 1, visit);
  }
}

function stripNumber(s: string): string {
  return s.replace(/^\s*(?:step\s+)?\d+(?:\.\d+)*(?:\s*[.:)]\s*|\s+)/i, "");
}

/** The map, checked against the prose around it. Never throws. */
export function readWorkflowMap(skillMd: string): WorkflowMapResult {
  const found = locate(skillMd);
  if ("none" in found) return { status: "none" };
  if ("error" in found) return { status: "invalid", errors: [found.error] };
  const invalid = (...errors: string[]): WorkflowMapResult => ({ status: "invalid", errors });

  if (new TextEncoder().encode(found.text).length > WORKFLOW_MAP_MAX_BYTES) return invalid("the map is over 8 KB");

  let raw: unknown;
  try {
    raw = JSON.parse(found.text);
  } catch {
    return invalid("the map is not valid JSON");
  }
  if (!isObj(raw)) return invalid("the map is not valid JSON");
  if (raw.version !== 1) return invalid("the map's version must be 1");

  const placement: string[] = [];
  walk(raw.steps, 0, (s, depth) => {
    const title = typeof s.title === "string" ? s.title : "(untitled)";
    if ((s.maxPasses !== undefined || s.children !== undefined) && s.kind !== "loop") placement.push(`"${title}" has a field its kind can't have`);
    else if (s.branches !== undefined && s.kind !== "decision") placement.push(`"${title}" has a field its kind can't have`);
    if (s.children !== undefined && depth >= MAX_STEP_DEPTH) placement.push("steps nest more than 2 levels");
  });
  if (placement.length) return invalid(...placement);

  let longAgent: string | null = null;
  walk(raw.steps, 0, (s) => {
    if (longAgent || !Array.isArray(s.agents)) return;
    for (const a of s.agents) if (isObj(a) && typeof a.name === "string" && a.name.trim().length > MAX_AGENT_NAME) longAgent = a.name.trim();
  });
  if (longAgent) return invalid(`the map's shape is wrong (agent name over ${MAX_AGENT_NAME} characters)`);

  const parseErrors: string[] = [];
  const steps = parseOverviewSteps(raw.steps, "steps", "s", parseErrors);
  if (parseErrors.length) return invalid(...parseErrors.map((d) => `the map's shape is wrong (${d})`));
  if (!steps.length) return invalid("the map's shape is wrong (steps: needs at least one step)");

  const errors: string[] = [];
  const keys = new Set<string>();
  for (const h of skillHeadings(skillMd).values()) {
    const bare = stripNumber(h);
    for (const v of [h, stripTrailingParens(h), bare, stripTrailingParens(bare)]) keys.add(looseKey(v));
  }
  walk(raw.steps, 0, (s) => {
    if (typeof s.title === "string" && !keys.has(looseKey(s.title)) && !keys.has(looseKey(stripNumber(s.title)))) {
      errors.push(`no heading matches "${s.title}"`);
    }
  });
  const prose = found.prose.toLowerCase();
  const names = new Set<string>();
  const collect = (list: OverviewStep[]) => {
    for (const s of list) {
      for (const a of s.agents ?? []) names.add(a.name);
      if (s.children) collect(s.children);
    }
  };
  collect(steps);
  for (const name of names) if (!prose.includes(name.trim().toLowerCase())) errors.push(`the steps never mention "${name}"`);
  if (errors.length) return invalid(...errors);

  return { status: "valid", map: { steps } };
}
