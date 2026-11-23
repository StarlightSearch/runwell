// Ported from Pulsar (Starlight), released here under the MIT license.
/**
 * Agent names as the graph compares them. A lead names the same reviewer
 * differently each pass ("Clarity Reviewer for bike lock tagline", "… v2", "… v3"), so names are
 * compared with a trailing version, pass or round stripped. Ordinals ("Helper #2", "Expert (2)",
 * "Helper 2") are kept: they tell agents of one parallel fan-out apart. Pure.
 */

/** One or more trailing markers: "v2", "version 2", "pass 3", "round 2", each optionally after - – — : or ,. */
const TRAILING = /(?:\s*[-–—:,]?\s*(?:\bv\s?\d+|\bversion\s*\d+|\bpass\s*#?\d+|\bround\s*#?\d+))+$/i;

/** The name without its trailing version marker, casing kept: the label of an agent that ran on several passes. */
export function baseAgentName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return trimmed.replace(TRAILING, "").trim() || trimmed;
}

/** Lowercased, spaces collapsed, trailing version marker stripped. */
export function normalizeAgentName(name: string): string {
  return baseAgentName(name).toLowerCase();
}

/**
 * Whether a runtime agent name is a declared agent: its normalised name equals the declared one or starts
 * with it at a word boundary ("Clarity Reviewer for the tagline" is "Clarity Reviewer"; "Junior Risk
 * Analyst" and "Risk Analysts" are not "Risk Analyst").
 */
export function matchesDeclared(runtime: string, declared: string): boolean {
  const d = normalizeAgentName(declared);
  if (d === "") return false;
  const r = normalizeAgentName(runtime);
  return r === d || (r.startsWith(d) && /[^\p{L}\p{N}_]/u.test(r[d.length]!));
}

/** A declared agent a step offers to `placeDeclared`. */
export interface DeclaredCandidate {
  stepId: string;
  /** The loop the step sits in, or null. */
  loopId: string | null;
  /** The agent's position in the step's declared list. */
  index: number;
  name: string;
}

/**
 * Where a runtime agent spawned under `fromStep` (in loop `fromLoop`) belongs: the declared agent it matches on its own step, else on a step of the same loop; the
 * longest declared name wins. Never a step elsewhere in the run. Shared by the graph and the activity log.
 */
export function placeDeclared(
  candidates: DeclaredCandidate[],
  fromStep: string,
  fromLoop: string | null,
  runtime: string,
): DeclaredCandidate | null {
  let best: { c: DeclaredCandidate; rank: number; len: number } | null = null;
  for (const c of candidates) {
    const rank = c.stepId === fromStep ? 0 : fromLoop !== null && c.loopId === fromLoop ? 1 : -1;
    if (rank < 0 || !matchesDeclared(runtime, c.name)) continue;
    const len = normalizeAgentName(c.name).length;
    if (!best || rank < best.rank || (rank === best.rank && len > best.len)) best = { c, rank, len };
  }
  return best?.c ?? null;
}
