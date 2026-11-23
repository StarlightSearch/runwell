// Ported from Pulsar (Starlight), released here under the MIT license.
/** The workflow graph's model: what a run (or an overview) looks like as nodes and groups, built by `buildRunGraph`. Pure data. */

/** `stopped`: work a finished run left in progress (a running step, an executing agent call). */
export type NodeState = "waiting" | "running" | "done" | "skipped" | "failed" | "not_run" | "stopped";

export interface ToolCallSummary {
  id: string;
  name: string;
  /** What the call acted on (a path, a command, a URL), one line; "" when nothing names it. */
  target: string;
  status: "running" | "done" | "error";
  result: string | null;
  startedAt: number | null;
  endedAt: number | null;
}

export interface NodeDetail {
  role: "lead" | "subagent";
  /** An agent's task as the lead wrote it. */
  brief: string | null;
  toolCalls: ToolCallSummary[];
  /** The text the node wrote, as whole messages. */
  output: string[];
  /** Files the node produced (the paths the checklist attributed to it). */
  outputs: string[];
  /** Only for a declared agent whose final text ends in a `Verdict: accept|reject` line. */
  verdict: "accept" | "reject" | null;
  startedAt: number | null;
  endedAt: number | null;
}

/**
 * - `step`: an action on the spine (a loop's children are steps whose `parentId` is the loop).
 * - `decision`: a guard step; its branches are listed, not drawn.
 * - `loop-step`: a loop with no children, one node with the repeat glyph.
 * - `agent`: a subagent call (or a declared agent), `parentId` is the step it ran under.
 */
export interface GraphNode {
  id: string;
  kind: "step" | "decision" | "loop-step" | "agent";
  label: string;
  /** The tile's content: the step's number ("3", "5.2"), or an agent's initials. */
  tile: string | null;
  /** One line under the label (a step's note, an agent's error or verdict). */
  line: string | null;
  state: NodeState;
  parentId: string | null;
  /** The loop pass this node's detail is from (the latest), null outside a loop. */
  pass: number | null;
  /** Per-pass detail, only for a node that ran in more than one pass. */
  passes: Record<number, NodeDetail> | null;
  detail: NodeDetail;
  branches?: { when: string; then: string }[];
  /** A declared agent's role, from the overview ("Subagent · reviewer"); absent on runtime-only agents and steps. */
  role?: string;
}

export interface GraphGroup {
  id: string;
  kind: "loop" | "fanout";
  /** The loop's own step id, or the step a fan-out runs under. */
  stepId: string;
  title: string;
  nodeIds: string[];
  pass: number | null;
  maxPasses: number | null;
}

export interface GraphHeader {
  /** 1-based position of the current step among the spine's steps; 0 before any started. */
  stepIndex: number;
  stepTotal: number;
  stepTitle: string | null;
  agentsWorking: number;
  pass: number | null;
  maxPasses: number | null;
  stepsLeft: number;
  failed: number;
  done: boolean;
}

export interface WorkflowGraphModel {
  nodes: GraphNode[];
  groups: GraphGroup[];
  /** Node ids in reading order: each step, then the agents under it. */
  order: string[];
  header: GraphHeader;
}

export interface ActivityLine {
  at: number | null;
  who: string;
  text: string;
}
