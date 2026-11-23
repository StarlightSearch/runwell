// Ported from Pulsar (Starlight), released here under the MIT license.
/** Builds a run's workflow graph: the steps down a spine, loops as regions, and the agents each step called. Pure. */
import type { ChatMessage, ToolCallInfo } from "./source-types";
import type { OverviewStep } from "./source-types";
import type { RunStepView } from "./source-types";
import { baseAgentName, normalizeAgentName, placeDeclared, type DeclaredCandidate } from "./names";
import { inferPasses, passAt } from "./passes";
import {
  agentName, agentNoun, agentOutput, agentToolCalls, finalText, firstLine, parseVerdict, scanRun, summarizeCall,
  type ScanShape,
} from "./scan";
import type { GraphGroup, GraphHeader, GraphNode, NodeDetail, NodeState, WorkflowGraphModel } from "./types";

/** Step rows may carry their recorded times (ISO); read when present. */
type StepRow = RunStepView & { startedAt?: string | null; finishedAt?: string | null };

export interface RunGraphInput {
  overviewSteps: OverviewStep[] | null;
  steps: StepRow[];
  messages: ChatMessage[];
  live: boolean;
  /**
   * The run's outputs as the tracker attributed them (project-relative, `.pi/`, `..` and paths outside
   * the project already refused by `toProjectPath`). When given, a step's Outputs are only these: each
   * todo_write string that names one is shown as the tracker's path, under the pass it was named in, and
   * the rest go on the step's latest pass. Without it (the overview page), the todo_write strings as written.
   */
  outputs?: { path: string; stepId: string | null }[];
}

interface SpineItem {
  id: string;
  kind: "step" | "decision" | "loop-step";
  label: string;
  tile: string;
  loopId: string | null;
  branches?: { when: string; then: string }[];
  agents: { name: string; role: string }[];
}
interface LoopItem {
  id: string;
  title: string;
  childIds: string[];
  nodeIds: string[];
  maxPasses: number | null;
}
interface Skeleton {
  spine: SpineItem[];
  loops: LoopItem[];
}

const emptyDetail = (role: NodeDetail["role"]): NodeDetail => ({
  role, brief: null, toolCalls: [], output: [], outputs: [], verdict: null, startedAt: null, endedAt: null,
});

/** Overview steps as spine nodes and loop regions (a loop with children is a region, not a node). */
function skeletonOf(steps: OverviewStep[]): Skeleton {
  const spine: SpineItem[] = [];
  const loops: LoopItem[] = [];
  const walk = (list: OverviewStep[], loopId: string | null, prefix: string) => {
    list.forEach((s, i) => {
      const tile = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      const children = s.children ?? [];
      if (children.length) {
        const loop: LoopItem = {
          id: s.id,
          title: s.title,
          childIds: children.map((c) => c.id),
          nodeIds: [],
          maxPasses: typeof s.maxPasses === "number" && s.maxPasses > 0 ? s.maxPasses : null,
        };
        loops.push(loop);
        const from = spine.length;
        walk(children, s.id, tile);
        loop.nodeIds = spine.slice(from).map((n) => n.id);
        return;
      }
      spine.push({
        id: s.id,
        kind: s.kind === "decision" ? "decision" : s.kind === "loop" ? "loop-step" : "step",
        label: s.title,
        tile,
        loopId,
        ...(s.kind === "decision" && s.branches ? { branches: s.branches } : {}),
        agents: Array.isArray(s.agents) ? s.agents.filter((a) => typeof a?.name === "string" && a.name.trim()).map((a) => ({ name: a.name, role: typeof a.role === "string" ? a.role : "" })) : [],
      });
    });
  };
  walk(steps, null, "");
  return { spine, loops };
}

/** The checklist alone as overview steps: every item an action, an item with deeper items directly under it a loop around them. */
function stepsFromDepth(rows: RunStepView[]): OverviewStep[] {
  const roots: OverviewStep[] = [];
  const stack: { depth: number; step: OverviewStep }[] = [];
  for (const row of rows) {
    const step: OverviewStep = { id: row.id, title: row.title, detail: "", kind: "action" };
    while (stack.length && stack[stack.length - 1].depth >= row.depth) stack.pop();
    const parent = stack[stack.length - 1]?.step;
    if (parent) {
      parent.kind = "loop";
      (parent.children ??= []).push(step);
    } else roots.push(step);
    stack.push({ depth: row.depth, step });
  }
  return roots;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || null;

const callState = (call: ToolCallInfo): NodeState =>
  call.status === "done" ? "done" : call.status === "error" ? "failed" : "running";

const parseTime = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : t;
};

function core(input: RunGraphInput, isStatic: boolean): WorkflowGraphModel {
  const { live, messages } = input;
  const skeleton = skeletonOf(input.overviewSteps?.length ? input.overviewSteps : stepsFromDepth(input.steps));
  const rows = new Map(input.steps.map((r) => [r.id, r]));
  const loopById = new Map(skeleton.loops.map((l) => [l.id, l]));
  const spineById = new Map(skeleton.spine.map((s) => [s.id, s]));

  const shape: ScanShape = {
    nodeIds: new Set(skeleton.spine.map((s) => s.id)),
    regionFirst: new Map(skeleton.loops.flatMap((l) => (l.nodeIds[0] ? [[l.id, l.nodeIds[0]] as const] : []))),
    firstStep: null,
  };
  const firstId = input.steps[0]?.id ?? skeleton.spine[0]?.id;
  shape.firstStep = firstId ? (shape.nodeIds.has(firstId) ? firstId : (shape.regionFirst.get(firstId) ?? null)) : null;

  const events = scanRun(messages, shape);

  /**
   * Where each subagent call belongs: a call whose name matches a
   * declared agent of its own step, or of a step in the same loop, goes to that declaring step; else to
   * the step that was in progress when it was spawned.
   */
  const declaredCandidates: DeclaredCandidate[] = skeleton.spine.flatMap((s) =>
    s.agents.map((a, index) => ({ stepId: s.id, loopId: s.loopId, index, name: a.name })),
  );
  const placed = new Map<number, { stepId: string; spawnedIn: string; declared: number | null; name: string }>();
  for (const ev of events) {
    if (ev.kind !== "call" || !ev.stepId || ev.call.toolName !== "subagent") continue;
    // Still streaming its arguments: no name yet, or half of one ("Fin"), which would draw a stray
    // "Subagent" node beside the declared one it becomes. It joins the graph once it starts.
    if (ev.call.status === "streaming_args") continue;
    const name = agentName(ev.call);
    const hit = placeDeclared(declaredCandidates, ev.stepId, spineById.get(ev.stepId)?.loopId ?? null, name);
    placed.set(ev.index, { stepId: hit?.stepId ?? ev.stepId, spawnedIn: ev.stepId, declared: hit?.index ?? null, name });
  }
  /** A subagent call's key within a loop (its declared agent, else its normalised name); null for a call not spawned in the loop. */
  const agentKeyIn = (loopId: string) => (_call: ToolCallInfo, index: number) => {
    const p = placed.get(index);
    if (!p || spineById.get(p.spawnedIn)?.loopId !== loopId || spineById.get(p.stepId)?.loopId !== loopId) return null;
    return p.declared !== null ? `declared:${p.stepId}:${p.declared}` : `name:${p.stepId}:${normalizeAgentName(p.name)}`;
  };

  const loopPasses = new Map(skeleton.loops.map((l) => [l.id, inferPasses(messages, { id: l.id, childIds: l.childIds }, agentKeyIn(l.id))]));
  const currentPass = (loopId: string) => loopPasses.get(loopId)?.at(-1)?.pass ?? null;
  /** A node's pass at a tool-call index: 0 outside a loop, else the loop's pass (1 before the first). */
  const passKey = (nodeId: string, index: number) => {
    const loopId = spineById.get(nodeId)?.loopId;
    return loopId ? (passAt(loopPasses.get(loopId) ?? [], index) ?? 1) : 0;
  };

  // Per step, its detail per pass key.
  const stepDetails = new Map<string, Map<number, NodeDetail>>();
  const detailOf = (id: string, key: number) => {
    let byPass = stepDetails.get(id);
    if (!byPass) stepDetails.set(id, (byPass = new Map()));
    let d = byPass.get(key);
    if (!d) byPass.set(key, (d = emptyDetail("lead")));
    return d;
  };

  /** `declared`: the agent's position in its step's declared list (absent on runtime-only agents). */
  interface AgentSlot { name: string; role?: string; declared?: number; runs: Map<number, ToolCallInfo> }
  const agentSlots = new Map<string, AgentSlot[]>(
    skeleton.spine.map((s) => [s.id, s.agents.map((a, i) => ({ name: a.name.trim(), role: a.role, declared: i, runs: new Map() }))]),
  );

  const prevStatus = new Map<string, string>();
  /** The pass key each step was in when it last went in_progress: its completion and outputs belong there, even when the same todo_write starts the next pass. */
  const activeKey = new Map<string, number>();
  const prevOutputs = new Map<string, Set<string>>();
  for (const ev of events) {
    if (ev.kind === "text") {
      if (ev.stepId) detailOf(ev.stepId, passKey(ev.stepId, ev.index)).output.push(ev.text);
    } else if (ev.kind === "call") {
      if (!ev.stepId) continue;
      if (ev.call.toolName !== "subagent") {
        detailOf(ev.stepId, passKey(ev.stepId, ev.index)).toolCalls.push(summarizeCall(ev.call));
        continue;
      }
      const place = placed.get(ev.index);
      if (!place) continue;
      const key = passKey(place.stepId, ev.index);
      const slots = agentSlots.get(place.stepId)!;
      const norm = normalizeAgentName(place.name);
      // Declared agents by their declaration; others by normalised name, one run per pass (a retry replaces the failed run).
      let slot =
        place.declared !== null
          ? slots.find((s) => s.declared === place.declared)
          : slots.find((s) => s.role === undefined && normalizeAgentName(s.name) === norm && (!s.runs.has(key) || s.runs.get(key)!.status === "error"));
      if (!slot) slots.push((slot = { name: baseAgentName(place.name), runs: new Map() }));
      slot.runs.set(key, ev.call);
    } else {
      for (const e of ev.entries) {
        if (!shape.nodeIds.has(e.id)) continue;
        const before = prevStatus.get(e.id);
        const starting = e.status === "in_progress" && before !== "in_progress";
        if (starting) activeKey.set(e.id, passKey(e.id, ev.index));
        const d = detailOf(e.id, activeKey.get(e.id) ?? passKey(e.id, ev.index));
        if (starting) d.startedAt ??= ev.call.startedAt ?? ev.call.endedAt ?? null;
        if (e.status === "completed" && before !== "completed") d.endedAt = ev.call.endedAt ?? ev.call.startedAt ?? null;
        prevStatus.set(e.id, e.status);
        const seen = prevOutputs.get(e.id) ?? new Set<string>();
        for (const o of e.outputs) if (!seen.has(o)) { seen.add(o); d.outputs.push(o); }
        prevOutputs.set(e.id, seen);
      }
    }
  }

  if (input.outputs) {
    const tracked = new Map<string, string[]>();
    for (const o of input.outputs) {
      if (!o.stepId) continue;
      const list = tracked.get(o.stepId) ?? [];
      if (!list.includes(o.path)) list.push(o.path);
      tracked.set(o.stepId, list);
    }
    for (const s of skeleton.spine) {
      const mine = tracked.get(s.id) ?? [];
      const byPass = stepDetails.get(s.id);
      const keys = [...(byPass?.keys() ?? [])].sort((a, b) => a - b);
      const shown = new Set<string>();
      for (const k of keys) {
        const d = byPass!.get(k)!;
        const paths: string[] = [];
        for (const raw of d.outputs) {
          const hit = mine.find((p) => raw === p || raw.endsWith(`/${p}`));
          if (hit && !shown.has(hit)) { shown.add(hit); paths.push(hit); }
        }
        d.outputs = paths;
      }
      const rest = mine.filter((p) => !shown.has(p));
      if (rest.length) detailOf(s.id, keys.at(-1) ?? (s.loopId ? (currentPass(s.loopId) ?? 1) : 0)).outputs.push(...rest);
    }
  }

  const unrun: NodeState = isStatic || live ? "waiting" : "not_run";
  /** On a finished run, work still marked in progress was interrupted. */
  const stopped = !isStatic && !live;
  const nodes: GraphNode[] = [];
  const order: string[] = [];
  const fanouts: GraphGroup[] = [];

  for (const s of skeleton.spine) {
    const row = rows.get(s.id);
    const byPass = stepDetails.get(s.id);
    const keys = [...(byPass?.keys() ?? [])].sort((a, b) => a - b);
    const latest = keys.at(-1);
    const detail = latest !== undefined ? byPass!.get(latest)! : emptyDetail("lead");
    detail.startedAt ??= parseTime(row?.startedAt);
    detail.endedAt ??= parseTime(row?.finishedAt);
    const state: NodeState =
      !row || row.status === "pending" ? unrun : row.status === "running" ? (stopped ? "stopped" : "running") : row.status;
    nodes.push({
      id: s.id,
      kind: s.kind,
      label: s.label,
      tile: s.tile,
      line: state === "stopped" ? "Stopped here" : (row?.note ?? null),
      state,
      parentId: s.loopId,
      pass: s.loopId && latest ? latest : null,
      passes: keys.length > 1 ? Object.fromEntries(keys.map((k) => [k, byPass!.get(k)!])) : null,
      detail,
      ...(s.branches ? { branches: s.branches } : {}),
    });
    order.push(s.id);

    const slots = agentSlots.get(s.id)!;
    const agentIds: string[] = [];
    const loopPass = s.loopId ? currentPass(s.loopId) : null;
    slots.forEach((slot, i) => {
      const declared = slot.role !== undefined;
      const runKeys = [...slot.runs.keys()].sort((a, b) => a - b);
      const details = new Map(runKeys.map((k) => {
        const call = slot.runs.get(k)!;
        const task = call.args?.task;
        const d: NodeDetail = {
          role: "subagent",
          brief: typeof task === "string" ? task : null,
          toolCalls: agentToolCalls(call),
          output: agentOutput(call),
          outputs: [],
          verdict: declared ? parseVerdict(finalText(call)) : null,
          startedAt: call.startedAt ?? null,
          endedAt: call.endedAt ?? null,
        };
        return [k, d] as const;
      }));
      const lastKey = runKeys.at(-1);
      const lastCall = lastKey !== undefined ? slot.runs.get(lastKey)! : null;
      const detail = lastKey !== undefined ? details.get(lastKey)! : emptyDetail("subagent");
      let state: NodeState = lastCall ? callState(lastCall) : unrun;
      if (state === "running" && stopped) state = "stopped";
      // A declared agent not yet called in the loop's current pass is waiting for it.
      if (declared && live && lastKey !== undefined && loopPass !== null && loopPass > lastKey && state !== "running") state = "waiting";
      const line =
        state === "stopped"
          ? "Stopped here"
          : state === "failed"
          ? (firstLine(lastCall?.result) ?? "Failed")
          : detail.verdict
            ? detail.verdict === "accept" ? "Accepted" : "Rejected"
            : declared ? slot.role || null : null;
      const id = `${s.id}/agent-${i + 1}`;
      nodes.push({
        id,
        kind: "agent",
        label: slot.name,
        tile: initials(slot.name),
        line,
        state,
        parentId: s.id,
        pass: s.loopId && lastKey ? lastKey : null,
        passes: runKeys.length > 1 ? Object.fromEntries(runKeys.map((k) => [k, details.get(k)!])) : null,
        detail,
        ...(declared ? { role: slot.role } : {}),
      });
      agentIds.push(id);
    });
    order.push(...agentIds);
    if (agentIds.length) {
      const passes = slots.flatMap((sl) => [...sl.runs.keys()]).filter((k) => k > 0);
      fanouts.push({
        id: `fanout:${s.id}`,
        kind: "fanout",
        stepId: s.id,
        title: `${agentIds.length} ${agentNoun(slots.map((sl) => sl.role), agentIds.length)}`,
        nodeIds: agentIds,
        pass: passes.length ? Math.max(...passes) : null,
        maxPasses: s.loopId ? (loopById.get(s.loopId)?.maxPasses ?? null) : null,
      });
    }
  }

  const groups: GraphGroup[] = [
    ...skeleton.loops.map((l): GraphGroup => ({
      id: `loop:${l.id}`,
      kind: "loop",
      stepId: l.id,
      title: l.title,
      nodeIds: l.nodeIds,
      pass: isStatic ? null : currentPass(l.id),
      maxPasses: l.maxPasses,
    })),
    ...fanouts,
  ];

  return { nodes, groups, order, header: headerOf(nodes, groups, input, isStatic) };
}

function headerOf(nodes: GraphNode[], groups: GraphGroup[], input: RunGraphInput, isStatic: boolean): GraphHeader {
  const spine = nodes.filter((n) => n.kind === "step" || n.kind === "decision" || n.kind === "loop-step");
  const runningAt = spine.findLastIndex((n) => n.state === "running");
  const current = runningAt >= 0 ? spine[runningAt] : null;
  const loop = current?.parentId ? groups.find((g) => g.kind === "loop" && g.stepId === current.parentId) : undefined;
  return {
    stepIndex: current ? runningAt + 1 : spine.filter((n) => n.state === "done" || n.state === "skipped").length,
    stepTotal: spine.length,
    stepTitle: current?.label ?? null,
    agentsWorking: nodes.filter((n) => n.kind === "agent" && n.state === "running").length,
    pass: loop?.pass ?? null,
    maxPasses: loop?.maxPasses ?? null,
    stepsLeft: spine.filter((n) => n.state === "waiting").length,
    failed: nodes.filter((n) => n.state === "failed").length,
    done: !isStatic && !input.live,
  };
}

/** A run's graph: its steps (shaped by the workflow it started from, else by depth) and the agents it called. */
export function buildRunGraph(input: RunGraphInput): WorkflowGraphModel {
  return core(input, false);
}

/** A skill's graph before any run: every node waiting, declared agents shown. */
export function buildStaticGraph(steps: OverviewStep[]): WorkflowGraphModel {
  return core({ overviewSteps: steps, steps: [], messages: [], live: false }, true);
}
