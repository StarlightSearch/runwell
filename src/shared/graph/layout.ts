// Ported from Pulsar (Starlight), released here under the MIT license.
/**
 * Positions a workflow graph for a canvas width. Pure arithmetic.
 *
 * - `hybrid` (width >= NARROW_BELOW): steps centred on one vertical spine; a fan-out of up to 4
 *   agents is a row under its step, 5 or more (or a row that does not fit) two columns off the spine.
 * - `narrow` (width < NARROW_BELOW): the plain vertical graph, spine on the left, agents an indented
 *   list under their step.
 *
 * Nodes are never scaled: steps and agents keep their real heights (and hybrid steps their width)
 * at every width; the canvas grows taller instead. Edges are SVG paths of `M`/`H`/`V` commands only.
 * A loop's return path is the one dotted line; the canvas draws it with `marker-end` pointing at the
 * arrowhead marker `LOOP_RETURN_MARKER`.
 *
 * Forks (`opts.forks`, off by default): a decision whose branches name the steps right after it draws
 * those steps as parallel lanes, a row side by side in hybrid, stacked and indented in the vertical
 * form, the way a fan-out of agents is drawn, and their edges join again into the next step. See
 * `forkLanes` for when that applies.
 */
import type { GraphGroup, GraphNode, WorkflowGraphModel } from "./types";

export const STEP_W = 340;
export const STEP_H = 50;
/** Tall enough for a two-line agent name plus one line under it. */
export const AGENT_H = 62;
export const GAP_Y = 24;
export const NARROW_BELOW = 600;
/** The id of the arrowhead `<marker>` the canvas defines and puts on each loop return path. */
export const LOOP_RETURN_MARKER = "wg-loop-arrow";

export type LayoutMode = "hybrid" | "narrow";

export interface PlacedNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedGroup {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  labelLeft: string;
  labelRight: string | null;
}

export interface PlacedEdge {
  from: string;
  to: string;
  path: string;
  live: boolean;
}

export interface GraphLayout {
  mode: LayoutMode;
  width: number;
  height: number;
  nodes: PlacedNode[];
  groups: PlacedGroup[];
  edges: PlacedEdge[];
  loopReturns: { groupId: string; path: string }[];
}

interface Metrics {
  top: number;
  bottom: number;
  gap: number;
  stepH: number;
  agentH: number;
  loopHead: number;
  loopFoot: number;
}

/* Hybrid (the v6 `.flow[data-o=hy]`): 24px side padding, a loop pads 52px each side, its title row 44px. */
const HYBRID: Metrics = { top: 32, bottom: 36, gap: GAP_Y, stepH: STEP_H, agentH: AGENT_H, loopHead: 44, loopFoot: 22 };
const SIDE = 24;
const LOOP_PAD = 52;
const NESTED_LOOP_PAD = 30;
const LOOP_RAIL_IN = 22;
const ROW_GAP = 10;
const ROW_MIN_W = 150;
const ROW_MAX_W = 214;
const ROW_MARGIN = 6;
const COL_GAP = 48;
const COL_MAX_W = 240;

/* The vertical form. */
interface VMetrics extends Metrics {
  pad: number;
  indent: number;
  agentGap: number;
  loopLeft: number;
}
const NARROW: VMetrics = {
  top: 28, bottom: 32, gap: 18, stepH: STEP_H, agentH: AGENT_H, loopHead: 38, loopFoot: 16,
  pad: 24, indent: 52, agentGap: 10, loopLeft: 12,
};
/** The spine's x inside a vertical node: the centre of its tile. */
/** Vertical forms: the spine runs this far in from a step's left edge (through its tile). */
export const SPINE_INSET = 24;
/** Room a loop keeps on its right for the return rail (vertical forms), and the rail's inset. */
const V_RAIL_ROOM = 28;
const V_RAIL_IN = 14;
/** How far an outer loop's return moves off a child it shares with an inner loop. */
const RETURN_SHIFT = 8;

type FanShape = "row" | "ribs" | "stack";
interface Fan {
  shape: FanShape;
  agents: PlacedNode[];
  top: number;
  bottom: number;
}

const SPINE_KINDS = new Set<GraphNode["kind"]>(["step", "decision", "loop-step"]);

export function layoutWorkflowGraph(model: WorkflowGraphModel, width: number, opts: { done?: boolean; forks?: boolean } = {}): GraphLayout {
  const mode: LayoutMode = width < NARROW_BELOW ? "narrow" : "hybrid";
  const vm = mode === "narrow" ? NARROW : null;
  const m: Metrics = vm ?? HYBRID;

  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const fullSpine = model.order.filter((id) => {
    const n = byId.get(id);
    return n !== undefined && SPINE_KINDS.has(n.kind);
  });
  const fanGroups = new Map(model.groups.filter((g) => g.kind === "fanout").map((g) => [g.stepId, g]));
  const agentsOf = (stepId: string): string[] => {
    const g = fanGroups.get(stepId);
    const ids = g ? g.nodeIds : model.nodes.filter((n) => n.kind === "agent" && n.parentId === stepId).map((n) => n.id);
    return ids.filter((id) => byId.get(id)?.kind === "agent");
  };
  const loopKey = (id: string) =>
    model.groups.filter((g) => g.kind === "loop" && g.nodeIds.includes(id)).map((g) => g.id).sort().join(",");
  const lanes = opts.forks ? forkLanes(fullSpine, byId, (id) => agentsOf(id).length > 0, loopKey) : new Map<string, string[]>();
  const inLane = new Set([...lanes.values()].flat());
  /** The spine without fork lanes: a lane hangs under its decision like an agent under its step. */
  const spine = fullSpine.filter((id) => !inLane.has(id));

  // Loops with at least one placed child, members in spine order; outer loops before inner ones. A loop
  // whose only child is another loop has the same members as it; the model lists an outer loop before
  // its inner ones, so that order breaks the tie and nesting is strict (`contains`), never set equality.
  const loops = model.groups
    .filter((g): g is GraphGroup => g.kind === "loop")
    .map((g, index) => ({ group: g, index, members: spine.filter((id) => g.nodeIds.includes(id)) }))
    .filter((l) => l.members.length > 0)
    .sort((a, b) => b.members.length - a.members.length || a.index - b.index);
  type Loop = (typeof loops)[number];
  const rank = new Map(loops.map((l, k) => [l, k]));
  const contains = (o: Loop, l: Loop) => rank.get(o)! < rank.get(l)! && l.members.every((id) => o.members.includes(id));
  /** 1 for an outermost loop, 2 for a loop inside it, ... */
  const levelOf = (l: Loop) => 1 + loops.filter((o) => contains(o, l)).length;
  const depthOf = (id: string) => loops.filter((l) => l.members.includes(id)).length;

  const placed = new Map<string, PlacedNode>();
  const fans = new Map<string, Fan>();
  const regionY = new Map<string, { top: number; bottom: number }>();
  const cx = Math.round(width / 2);
  const baseW = vm ? width - 2 * vm.pad : STEP_W;

  let y = m.top;
  spine.forEach((id, i) => {
    for (const l of loops.filter((x) => x.members[0] === id)) {
      regionY.set(l.group.id, { top: y, bottom: y });
      y += m.loopHead;
    }
    const depth = depthOf(id);
    const stepW = baseW - V_RAIL_ROOM * depth;
    const node: PlacedNode = vm
      ? { id, x: vm.pad, y, w: stepW, h: m.stepH }
      : { id, x: cx - STEP_W / 2, y, w: STEP_W, h: STEP_H };
    placed.set(id, node);
    y = node.y + node.h;

    const laneIds = lanes.get(id);
    const agentIdList = laneIds ?? agentsOf(id);
    if (agentIdList.length) {
      const fan = vm
        ? stackFan(node, agentIdList, vm, laneIds ? m.stepH : vm.agentH)
        : hybridFan(node, agentIdList, width, depth, laneIds ? STEP_H : AGENT_H);
      fans.set(id, fan);
      for (const a of fan.agents) placed.set(a.id, a);
      y = fan.bottom;
    }

    for (const l of loops.filter((x) => x.members.at(-1) === id).reverse()) {
      y += m.loopFoot;
      regionY.get(l.group.id)!.bottom = y;
    }
    if (i < spine.length - 1) y += m.gap;
  });
  const height = (spine.length ? y : 0) + m.bottom;

  // Loop regions, inner first so an outer one can wrap them.
  const regions = new Map<string, PlacedGroup>();
  for (const l of [...loops].reverse()) {
    const ys = regionY.get(l.group.id)!;
    const boxes = l.members.flatMap((id) => [placed.get(id)!, ...(fans.get(id)?.agents ?? [])]);
    const nested = loops.filter((o) => contains(l, o)).map((o) => regions.get(o.group.id)!);
    let x0: number;
    let x1: number;
    if (vm) {
      const level = levelOf(l);
      x0 = vm.pad - (level === 1 ? vm.loopLeft : Math.round(vm.loopLeft / 2));
      x1 = vm.pad + baseW - V_RAIL_ROOM * (level - 1);
    } else {
      x0 = Math.min(...boxes.map((b) => b.x - LOOP_PAD), ...nested.map((r) => r.x - NESTED_LOOP_PAD));
      x1 = Math.max(...boxes.map((b) => b.x + b.w + LOOP_PAD), ...nested.map((r) => r.x + r.w + NESTED_LOOP_PAD));
      x0 = Math.max(0, x0);
      x1 = Math.min(width, x1);
    }
    regions.set(l.group.id, {
      id: l.group.id,
      x: x0,
      y: ys.top,
      w: x1 - x0,
      h: ys.bottom - ys.top,
      labelLeft: l.group.title,
      labelRight: passLabel(l.group, opts.done === true),
    });
  }

  // Edges: step to step down the spine; a fan-out branches from its step and joins into the next node.
  const edges: PlacedEdge[] = [];
  const live = (to: string) => byId.get(to)?.state === "running";
  const push = (from: string, to: string, pts: [number, number][]) => edges.push({ from, to, path: orthoPath(pts), live: live(to) });
  const cxOf = (n: PlacedNode) => n.x + n.w / 2;
  const spineX = (n: PlacedNode) => (vm ? n.x + SPINE_INSET : cxOf(n));
  spine.forEach((id, i) => {
    const a = placed.get(id)!;
    const fan = fans.get(id);
    const nextId = spine[i + 1];
    const b = nextId !== undefined ? placed.get(nextId)! : null;
    const sx = spineX(a);
    if (fan) {
      const ry = Math.round((a.y + a.h + fan.top) / 2);
      const jy = b ? Math.round((fan.bottom + b.y) / 2) : 0;
      for (const g of fan.agents) {
        const gcy = g.y + g.h / 2;
        const inner = cxOf(g) < sx ? g.x + g.w : g.x;
        if (fan.shape === "row") {
          push(id, g.id, [[sx, a.y + a.h], [sx, ry], [cxOf(g), ry], [cxOf(g), g.y]]);
          if (b) push(g.id, nextId, [[cxOf(g), g.y + g.h], [cxOf(g), jy], [spineX(b), jy], [spineX(b), b.y]]);
        } else {
          push(id, g.id, [[sx, a.y + a.h], [sx, gcy], [inner, gcy]]);
          if (b) push(g.id, nextId, [[inner, gcy], [spineX(b), gcy], [spineX(b), b.y]]);
        }
      }
    } else if (b) {
      push(id, nextId, [[sx, a.y + a.h], [spineX(b), a.y + a.h], [spineX(b), b.y]]);
    }
  });

  // One return per loop: from its last child's right edge, up the region's right side, into its first child.
  const loopReturns = [...loops].reverse().map((l) => {
    const region = regions.get(l.group.id)!;
    const first = placed.get(l.members[0])!;
    const last = placed.get(l.members.at(-1)!)!;
    const rx = region.x + region.w - (vm ? V_RAIL_IN : LOOP_RAIL_IN);
    // A loop around another one that shares its first or last child leaves and enters that child a few
    // pixels further out, so the two returns never run along the same line.
    const inner = loops.filter((o) => contains(l, o));
    const shift = RETURN_SHIFT * (inner.length ? 1 : 0);
    let ys = last.y + last.h / 2 + (inner.some((o) => o.members.at(-1) === l.members.at(-1)) ? shift : 0);
    let ye = first.y + first.h / 2 - (inner.some((o) => o.members[0] === l.members[0]) ? shift : 0);
    if (first === last) {
      ys += 10;
      ye -= 10;
    }
    return { groupId: l.group.id, path: orthoPath([[last.x + last.w, ys], [rx, ys], [rx, ye], [first.x + first.w, ye]]) };
  });

  return {
    mode,
    width,
    height,
    nodes: [...placed.values()],
    groups: loops.map((l) => regions.get(l.group.id)!),
    edges,
    loopReturns,
  };
}

/** A branch's target, read from its `then`: a step number ("2", "step 2") or the step's title, alone or in a sentence. */
function branchTarget(then: string, candidates: GraphNode[]): GraphNode | undefined {
  const num = /^\s*(?:step\s*)?(\d+(?:\.\d+)?)\s*\.?\s*$/i.exec(then);
  if (num) return candidates.find((n) => n.tile === num[1]);
  const key = loose(then);
  if (!key) return undefined;
  return candidates.find((n) => loose(n.label) === key) ?? candidates.find((n) => loose(n.label) !== "" && ` ${key} `.includes(` ${loose(n.label)} `));
}

const loose = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Decisions that fork: decision id -> its lanes, in spine order. The lanes are the steps right after
 * the decision that its branches name (at least two), each a plain step with no agents of its own,
 * in the same loops as the decision; they join in the step after them. The last step is never a
 * lane, so there is always a join. A branch naming a later step (a skip ahead) or nothing draws no
 * lane. Anything else stays one line, its branches listed.
 */
export function forkLanes(spine: string[], byId: Map<string, GraphNode>, hasAgents: (id: string) => boolean, loopKey: (id: string) => string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const taken = new Set<string>();
  spine.forEach((id, i) => {
    const d = byId.get(id)!;
    if (d.kind !== "decision" || !d.branches?.length || taken.has(id)) return;
    const after = spine.slice(i + 1).map((x) => byId.get(x)!);
    const targets = new Set<string>();
    for (const b of d.branches) {
      const t = typeof b.then === "string" ? branchTarget(b.then, after) : undefined;
      if (t) targets.add(t.id);
    }
    // The lanes: the targets directly after the decision. A target further on is a skip ahead.
    const run: string[] = [];
    for (const x of spine.slice(i + 1)) {
      const n = byId.get(x)!;
      if (!targets.has(x) || !(n.kind === "step" || n.kind === "loop-step") || hasAgents(x) || loopKey(x) !== loopKey(id) || taken.has(x)) break;
      run.push(x);
    }
    // The last step is never a lane: the lanes join in it (a branch naming it skips straight there).
    if (i + 1 + run.length >= spine.length) run.pop();
    if (run.length < 2 || hasAgents(id)) return;
    out.set(id, run);
    for (const x of run) taken.add(x);
  });
  return out;
}

/** Hybrid fan-out: a centred row when up to 4 agents fit, else two columns either side of the spine. */
function hybridFan(step: PlacedNode, ids: string[], width: number, depth: number, h = AGENT_H): Fan {
  const n = ids.length;
  const cx = step.x + step.w / 2;
  const avail = width - 2 * SIDE - (depth ? 2 * LOOP_PAD + 2 * NESTED_LOOP_PAD * (depth - 1) : 0);
  if (n <= 4 && n * ROW_MIN_W + (n - 1) * ROW_GAP <= avail) {
    const w = Math.min(ROW_MAX_W, Math.floor((avail - (n - 1) * ROW_GAP) / n));
    const total = n * w + (n - 1) * ROW_GAP;
    const x0 = Math.round(cx - total / 2);
    const top = step.y + step.h + GAP_Y + ROW_MARGIN;
    const agents = ids.map((id, i) => ({ id, x: x0 + i * (w + ROW_GAP), y: top, w, h }));
    return { shape: "row", agents, top, bottom: top + h + ROW_MARGIN };
  }
  const w = Math.min(COL_MAX_W, Math.floor((avail - COL_GAP) / 2));
  const top = step.y + step.h + GAP_Y;
  const agents = ids.map((id, i) => ({
    id,
    x: i % 2 === 0 ? cx - COL_GAP / 2 - w : cx + COL_GAP / 2,
    y: top + Math.floor(i / 2) * (h + ROW_GAP),
    w,
    h,
  }));
  const rows = Math.ceil(n / 2);
  return { shape: "ribs", agents, top, bottom: top + rows * h + (rows - 1) * ROW_GAP };
}

/** The vertical form: every agent stacked under its step, indented from the spine. */
function stackFan(step: PlacedNode, ids: string[], vm: VMetrics, h = vm.agentH): Fan {
  const top = step.y + step.h + vm.agentGap;
  const w = step.w - vm.indent;
  let y = top;
  const agents = ids.map((id) => {
    const a = { id, x: step.x + vm.indent, y, w, h };
    y += a.h + vm.agentGap;
    return a;
  });
  return { shape: "stack", agents, top, bottom: y - vm.agentGap };
}

/** "pass 2 of 3"; "pass 4 (limit 3)" once a run has gone past the limit SKILL.md states; "pass 2" with no limit. */
export function passText(pass: number, maxPasses: number | null): string {
  if (maxPasses === null) return `pass ${pass}`;
  return pass > maxPasses ? `pass ${pass} (limit ${maxPasses})` : `pass ${pass} of ${maxPasses}`;
}

function passLabel(g: GraphGroup, done: boolean): string | null {
  if (g.pass !== null && done) return g.pass === 1 ? "1 pass" : `${g.pass} passes`;
  if (g.pass !== null) return passText(g.pass, g.maxPasses);
  return g.maxPasses !== null ? `up to ${g.maxPasses} passes` : null;
}

const num = (n: number) => String(Math.round(n * 10) / 10);

/** An orthogonal polyline as `M x y` then `H`/`V` commands; repeated points are dropped. */
function orthoPath(pts: [number, number][]): string {
  const p = pts.filter((q, k) => k === 0 || q[0] !== pts[k - 1][0] || q[1] !== pts[k - 1][1]);
  let d = `M${num(p[0][0])} ${num(p[0][1])}`;
  for (let k = 1; k < p.length; k++) {
    const [x0, y0] = p[k - 1];
    const [x1, y1] = p[k];
    if (y1 === y0) d += ` H${num(x1)}`;
    else if (x1 === x0) d += ` V${num(y1)}`;
    else throw new Error("workflow-graph layout: diagonal edge segment");
  }
  return d;
}
