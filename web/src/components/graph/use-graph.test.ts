import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../../../src/shared/events";
import { graphOf } from "../../../../src/shared/graph/from-events";
import type { OverviewStep } from "../../../../src/shared/graph/source-types";
import { computeGraph } from "./use-graph";

const WF: OverviewStep[] = [
  { id: "s1", title: "Brief", detail: "", kind: "action" },
  { id: "s2", title: "Render", detail: "", kind: "action" },
];
const at = (n: number) => 1_700_000_000_000 + n * 1000;
const EVENTS: RunEvent[] = [
  { t: "step", at: at(0), stepId: "s1", status: "started", note: null },
  { t: "step", at: at(1), stepId: "s1", status: "done", note: null },
  { t: "step", at: at(2), stepId: "s2", status: "started", note: null },
];

describe("computeGraph", () => {
  it("upTo 0 leaves every node waiting", () => {
    const { model } = computeGraph(EVENTS, WF, true, 900, 0);
    expect(model.nodes.every((n) => n.state === "waiting")).toBe(true);
  });
  it("with all events the header matches graphOf", () => {
    expect(computeGraph(EVENTS, WF, true, 900).model.header).toEqual(graphOf(EVENTS, WF, true).header);
  });
  it("picks narrow below 600 and hybrid above", () => {
    expect(computeGraph(EVENTS, WF, true, 500).layout.mode).toBe("narrow");
    expect(computeGraph(EVENTS, WF, true, 900).layout.mode).toBe("hybrid");
  });
});
