import { useMemo } from "react";
import type { RunEvent } from "../../../../src/shared/events";
import { graphOf } from "../../../../src/shared/graph/from-events";
import { layoutWorkflowGraph, type GraphLayout } from "../../../../src/shared/graph/layout";
import type { OverviewStep } from "../../../../src/shared/graph/source-types";
import type { WorkflowGraphModel } from "../../../../src/shared/graph/types";

/** The graph of a run's first `upTo` events (all by default), laid out for `width`. Pure. */
export function computeGraph(events: RunEvent[], workflow: OverviewStep[] | null, live: boolean, width: number, upTo?: number): { model: WorkflowGraphModel; layout: GraphLayout } {
  const slice = upTo === undefined ? events : events.slice(0, upTo);
  const model = graphOf(slice, workflow, upTo !== undefined && upTo < events.length ? true : live);
  return { model, layout: layoutWorkflowGraph(model, Math.max(320, width), { done: !live && upTo === undefined }) };
}

export function useGraph(events: RunEvent[], workflow: OverviewStep[] | null, live: boolean, width: number, upTo?: number) {
  return useMemo(() => computeGraph(events, workflow, live, width, upTo), [events, workflow, live, width, upTo]);
}
