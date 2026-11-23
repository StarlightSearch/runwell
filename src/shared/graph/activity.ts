// Ported from Pulsar (Starlight), released here under the MIT license.
/** The run's Activity log, read from real events only: steps started and finished, agents started and finished, declared agents' verdicts. Pure. */
import type { ChatMessage, ToolCallInfo } from "./source-types";
import { normalizeAgentName, placeDeclared, type DeclaredCandidate } from "./names";
import { agentName, agentNoun, finalText, firstLine, parseVerdict, scanRun, type ScanEvent, type ScanShape } from "./scan";
import type { ActivityLine, GraphNode, WorkflowGraphModel } from "./types";

const LEAD = "Lead agent";

/** Newest first. Times are the sandbox's stamps when the calls carry them, else null. */
export function buildActivity(model: WorkflowGraphModel, messages: ChatMessage[]): ActivityLine[] {
  const spine = model.nodes.filter((n) => n.kind === "step" || n.kind === "decision" || n.kind === "loop-step");
  const labels = new Map<string, string>(spine.map((n) => [n.id, n.label]));
  const loops = model.groups.filter((g) => g.kind === "loop");
  for (const g of loops) labels.set(g.stepId, g.title);
  const shape: ScanShape = {
    nodeIds: new Set(spine.map((n) => n.id)),
    regionFirst: new Map(loops.flatMap((g) => (g.nodeIds[0] ? [[g.stepId, g.nodeIds[0]] as const] : []))),
    firstStep: spine[0]?.id ?? null,
  };
  const agents = model.nodes.filter((n) => n.kind === "agent");
  const loopOf = new Map(spine.map((n) => [n.id, n.parentId]));
  const declared = agents.filter((n) => n.role !== undefined && n.parentId);
  const candidates: DeclaredCandidate[] = declared.map((n, index) => ({ stepId: n.parentId!, loopId: loopOf.get(n.parentId!) ?? null, index, name: n.label }));
  /** The node a call is drawn as, placed the way the graph placed it (`placeDeclared`), else by normalised name under its step. */
  const agentFor = (stepId: string, call: ToolCallInfo): GraphNode | undefined => {
    const name = agentName(call);
    const hit = placeDeclared(candidates, stepId, loopOf.get(stepId) ?? null, name);
    if (hit) return declared[hit.index];
    const norm = normalizeAgentName(name);
    return agents.find((n) => n.role === undefined && n.parentId === stepId && normalizeAgentName(n.label) === norm);
  };

  const lines: ActivityLine[] = [];
  const prev = new Map<string, string>();
  const events = scanRun(messages, shape);
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.kind === "todo") {
      for (const e of ev.entries) {
        const label = labels.get(e.id);
        if (!label || prev.get(e.id) === e.status) {
          prev.set(e.id, e.status);
          continue;
        }
        prev.set(e.id, e.status);
        const verb = e.status === "in_progress" ? "Started" : e.status === "completed" ? "Finished" : e.status === "skipped" ? "Skipped" : null;
        if (!verb) continue;
        const at = verb === "Started" ? (ev.call.startedAt ?? ev.call.endedAt) : (ev.call.endedAt ?? ev.call.startedAt);
        lines.push({ at: at ?? null, who: LEAD, text: `${verb} ${label}` });
      }
      continue;
    }
    if (ev.kind !== "call" || ev.call.toolName !== "subagent" || !ev.stepId) continue;
    // One batch: the subagent calls made back to back under the same step.
    const stepId = ev.stepId;
    const batch: Extract<ScanEvent, { kind: "call" }>[] = [ev];
    while (i + 1 < events.length) {
      const next = events[i + 1];
      if (next.kind !== "call" || next.call.toolName !== "subagent" || next.stepId !== stepId) break;
      batch.push(next);
      i += 1;
    }
    const ran = batch.map((b) => ({ call: b.call, node: agentFor(stepId, b.call) }));
    const starts = batch.map((b) => b.call.startedAt).filter((t) => t !== undefined);
    if (ran.length > 1) {
      const noun = agentNoun(ran.map((a) => a.node?.role), ran.length);
      const where = ran.find((a) => a.node?.parentId)?.node?.parentId ?? stepId;
      lines.push({ at: starts.length ? Math.min(...starts) : null, who: LEAD, text: `${ran.length} ${noun} started on ${labels.get(where)}` });
    } else {
      lines.push({ at: starts[0] ?? null, who: ran[0].node?.label ?? agentName(ran[0].call), text: "Started" });
    }
    for (const { call, node } of ran) {
      const who = node?.label ?? agentName(call);
      const at = call.endedAt ?? null;
      if (call.status === "error") lines.push({ at, who, text: `Failed: ${firstLine(call.result) ?? "no reason given"}` });
      else if (call.status === "done") {
        const verdict = node?.role !== undefined ? parseVerdict(finalText(call)) : null;
        lines.push({ at, who, text: verdict ? `Verdict: ${verdict}` : "Finished" });
      }
    }
  }
  return lines.reverse();
}
