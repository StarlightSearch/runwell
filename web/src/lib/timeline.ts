import type { RunEvent } from "../../../src/shared/events";
import type { WorkflowGraphModel } from "../../../src/shared/graph/types";

export interface TimelineRow {
  id: string;
  label: string;
  kind: "step" | "agent" | "waiting";
  parentId: string | null;
  start: number;
  end: number;
}

/** One row per step and agent that started (from their detail times), one per ask while it waited. */
export function timelineRows(model: WorkflowGraphModel, events: RunEvent[], endAt: number): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (const id of model.order) {
    const n = model.nodes.find((x) => x.id === id);
    if (!n?.detail.startedAt) continue;
    rows.push({
      id: n.id,
      label: n.label,
      kind: n.kind === "agent" ? "agent" : "step",
      parentId: n.kind === "agent" ? n.parentId : null,
      start: n.detail.startedAt,
      end: n.detail.endedAt ?? endAt,
    });
  }
  const opened = new Map<string, number>();
  for (const e of events) {
    if (e.t === "ask") opened.set(e.ask.id, e.at);
    else if (e.t === "ask.done" && opened.has(e.id)) {
      rows.push({ id: `wait-${e.id}`, label: "Waiting for you", kind: "waiting", parentId: null, start: opened.get(e.id)!, end: e.at });
      opened.delete(e.id);
    }
  }
  for (const [id, start] of opened) rows.push({ id: `wait-${id}`, label: "Waiting for you", kind: "waiting", parentId: null, start, end: endAt });
  return rows;
}
