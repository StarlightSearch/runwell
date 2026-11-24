/**
 * Turns Workflows' run events into the input the ported graph builder reads.
 *
 * The builder (ported from Pulsar) reads a run as chat messages: `todo_write` calls carry the
 * checklist's state, `subagent` calls carry each agent with its own blocks. So:
 * - each `step` event becomes one synthetic `todo_write` listing every step known so far;
 * - a lead `tool.start` of a subagent tool becomes a `subagent` call, and every event of that agent
 *   (and of agents it started, folded into it) becomes one of its blocks;
 * - other lead tool calls stay ordinary calls, lead text stays text.
 */
import type { Ask, RunEvent, StepReport } from "../events";
import { buildRunGraph, type RunGraphInput } from "./build";
import type { ChatMessage, ContentBlock, OverviewStep, RunStepView, StepStatus, ToolCallInfo } from "./source-types";
import type { WorkflowGraphModel } from "./types";

/** Tool names that start a subagent (spike 3: `Agent`, also `Task`). */
export const SUBAGENT_TOOLS = new Set<string>(["Agent", "Task"]);

const RUN_STEP = { id: "run", title: "Run" } as const;

type TodoStatus = "pending" | "in_progress" | "completed" | "skipped" | "failed";
const TODO_OF: Record<StepReport, TodoStatus> = { started: "in_progress", done: "completed", failed: "failed", skipped: "skipped" };
const ROW_OF: Record<StepReport, StepStatus> = { started: "running", done: "done", failed: "failed", skipped: "skipped" };

/** "render-frames" -> "Render frames". */
export function titleFromSlug(id: string): string {
  const words = id.replace(/[-_.]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : id;
}

interface Planned {
  id: string;
  title: string;
  depth: number;
  /** The loop or parent step this one sits in, if any. */
  parentId: string | null;
}

function flatten(steps: OverviewStep[], depth = 0, parentId: string | null = null, out: Planned[] = []): Planned[] {
  for (const s of steps) {
    out.push({ id: s.id, title: s.title, depth, parentId });
    if (s.children?.length) flatten(s.children, depth + 1, s.id, out);
  }
  return out;
}

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

export function toGraphInput(events: RunEvent[], workflow: OverviewStep[] | null, live: boolean): RunGraphInput {
  const planned = workflow?.length ? flatten(workflow) : [];
  const known = new Map(planned.map((p) => [p.id, p]));
  const unplanned: Planned[] = [];
  const reported = events.some((e) => e.t === "step");

  // Step state as reported so far, in event order.
  const status = new Map<string, TodoStatus>();
  const rowState = new Map<string, { status: StepStatus; note: string | null; startedAt: number | null; finishedAt: number | null }>();

  const ensureKnown = (id: string) => {
    if (known.has(id)) return;
    const p: Planned = { id, title: titleFromSlug(id), depth: 0, parentId: null };
    known.set(id, p);
    unplanned.push(p);
  };
  const allSteps = (): Planned[] => [...planned, ...unplanned];

  /** A loop's own status follows its children unless it was reported itself. */
  const todoList = () =>
    allSteps().map((p) => {
      let st = status.get(p.id);
      if (!st) {
        const kids = allSteps().filter((c) => c.parentId === p.id);
        if (kids.some((k) => status.get(k.id) === "in_progress")) st = "in_progress";
      }
      return { id: p.id, content: p.title, status: st ?? "pending", ...(rowState.get(p.id)?.note ? { note: rowState.get(p.id)!.note } : {}) };
    });

  // Lead blocks in order; subagent calls by id so their own events can be appended.
  const lead: ContentBlock[] = [];
  const calls = new Map<string, ToolCallInfo>();
  /** Which top-level subagent call an agent id belongs to (nested agents fold into their ancestor). */
  const topAgent = new Map<string, string>();
  const subagentOf = (agentId: string | null): ToolCallInfo | null => {
    if (agentId === null) return null;
    const top = topAgent.get(agentId) ?? agentId;
    return calls.get(top) ?? null;
  };
  const push = (agentId: string | null, block: ContentBlock) => {
    const owner = subagentOf(agentId);
    if (owner) (owner.subagentBlocks ??= []).push(block);
    else lead.push(block);
  };

  let todoSeq = 0;
  if (!workflow?.length && !reported) {
    known.set(RUN_STEP.id, { id: RUN_STEP.id, title: RUN_STEP.title, depth: 0, parentId: null });
    unplanned.push(known.get(RUN_STEP.id)!);
    const first = events[0]?.at ?? null;
    status.set(RUN_STEP.id, "in_progress");
    rowState.set(RUN_STEP.id, { status: "running", note: null, startedAt: first, finishedAt: null });
    lead.push({ type: "tool_call", toolCall: todoCall(++todoSeq, todoList(), first) });
  }

  for (const e of events) {
    switch (e.t) {
      case "step": {
        ensureKnown(e.stepId);
        status.set(e.stepId, TODO_OF[e.status]);
        const prev = rowState.get(e.stepId);
        rowState.set(e.stepId, {
          status: ROW_OF[e.status],
          note: e.note ?? prev?.note ?? null,
          startedAt: e.status === "started" ? (prev?.startedAt ?? e.at) : (prev?.startedAt ?? null),
          finishedAt: e.status === "started" ? null : e.at,
        });
        lead.push({ type: "tool_call", toolCall: todoCall(++todoSeq, todoList(), e.at) });
        break;
      }
      case "text":
        if (e.text.trim()) push(e.agentId, { type: "text", text: e.text });
        break;
      case "tool.start": {
        const isSub = SUBAGENT_TOOLS.has(e.name);
        if (isSub && e.agentId === null) {
          const call: ToolCallInfo = {
            toolCallId: e.id,
            toolName: "subagent",
            args: {
              ...(typeof e.input.description === "string" ? { description: e.input.description } : {}),
              task: typeof e.input.prompt === "string" ? e.input.prompt : "",
            },
            argsPartial: "",
            status: "executing",
            subagentBlocks: [],
            startedAt: e.at,
          };
          calls.set(e.id, call);
          lead.push({ type: "tool_call", toolCall: call });
          break;
        }
        if (isSub && e.agentId !== null) topAgent.set(e.id, topAgent.get(e.agentId) ?? e.agentId);
        const call: ToolCallInfo = { toolCallId: e.id, toolName: e.name, args: e.input, argsPartial: "", status: "executing", startedAt: e.at };
        calls.set(e.id, call);
        push(e.agentId, { type: "tool_call", toolCall: call });
        break;
      }
      case "tool.end": {
        const call = calls.get(e.id);
        if (!call) break;
        call.status = e.ok ? "done" : "error";
        call.result = e.result;
        call.endedAt = e.at;
        break;
      }
      default:
        break;
    }
  }

  // With no workflow and no reports, the one "Run" step ends with the run.
  if (!live && rowState.get(RUN_STEP.id)?.status === "running" && !reported) {
    const last = events.at(-1)?.at ?? null;
    rowState.set(RUN_STEP.id, { status: "done", note: null, startedAt: rowState.get(RUN_STEP.id)!.startedAt, finishedAt: last });
  }

  const steps: RunStepView[] = allSteps().map((p) => {
    const r = rowState.get(p.id);
    return { id: p.id, title: p.title, depth: p.depth, status: r?.status ?? "pending", note: r?.note ?? null, startedAt: iso(r?.startedAt ?? null), finishedAt: iso(r?.finishedAt ?? null) };
  });

  const messages: ChatMessage[] = [{ id: "run", role: "assistant", contentBlocks: lead, isStreaming: live }];
  const overviewSteps = workflow?.length ? [...workflow, ...unplanned.map((p): OverviewStep => ({ id: p.id, title: p.title, detail: "", kind: "action" }))] : null;
  return { overviewSteps, steps, messages, live };
}

function todoCall(seq: number, todos: unknown[], at: number | null): ToolCallInfo {
  return {
    toolCallId: `workflows-step-${seq}`,
    toolName: "todo_write",
    args: { todos },
    argsPartial: "",
    status: "done",
    ...(at !== null ? { startedAt: at, endedAt: at } : {}),
  };
}

export function graphOf(events: RunEvent[], workflow: OverviewStep[] | null, live: boolean): WorkflowGraphModel {
  return buildRunGraph(toGraphInput(events, workflow, live));
}

/** The node an ask belongs to: the agent that raised it, else the step running now. */
export function askNodeId(model: WorkflowGraphModel, ask: Ask, events: RunEvent[]): string | null {
  if (ask.agentId !== null) {
    // Fold a nested agent into its top-level ancestor, then find that agent's node by its label.
    const parentOf = new Map<string, string | null>();
    const labelOf = new Map<string, string>();
    for (const e of events) {
      if (e.t !== "tool.start" || !SUBAGENT_TOOLS.has(e.name)) continue;
      parentOf.set(e.id, e.agentId);
      if (typeof e.input.description === "string") labelOf.set(e.id, e.input.description);
      else if (typeof e.input.prompt === "string") labelOf.set(e.id, e.input.prompt.trim().split("\n")[0] ?? "");
    }
    let top = ask.agentId;
    for (let p = parentOf.get(top); p; p = parentOf.get(top)) top = p;
    const label = labelOf.get(top);
    const node = model.nodes.find((n) => n.kind === "agent" && n.label === label);
    if (node) return node.id;
  }
  const running = model.nodes.filter((n) => n.kind !== "agent" && n.state === "running");
  return running.at(-1)?.id ?? null;
}
