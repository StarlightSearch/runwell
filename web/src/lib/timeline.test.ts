import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../../src/shared/events";
import { graphOf } from "../../../src/shared/graph/from-events";
import { timelineRows } from "./timeline";

const at = (s: number) => 1_700_000_000_000 + s * 1000;
const events: RunEvent[] = [
  { t: "step", at: at(0), stepId: "a", status: "started", note: null },
  { t: "tool.start", at: at(1), id: "T1", agentId: null, name: "Agent", input: { description: "Helper", prompt: "x" } },
  { t: "tool.end", at: at(4), id: "T1", ok: true, result: "done" },
  { t: "step", at: at(5), stepId: "a", status: "done", note: null },
  { t: "step", at: at(6), stepId: "b", status: "started", note: null },
  { t: "ask", at: at(7), ask: { id: "q1", kind: "permission", toolCallId: null, agentId: null, tool: "Bash", input: {} } },
  { t: "ask.done", at: at(10), id: "q1", answer: { kind: "permission", allow: true, message: null } },
];

describe("timelineRows", () => {
  it("a row per step and agent with parents, a waiting row per ask, open rows ending at endAt", () => {
    const rows = timelineRows(graphOf(events, null, true), events, at(20));
    const step = (id: string) => rows.find((r) => r.id === id)!;
    expect(step("a")).toMatchObject({ kind: "step", start: at(0), end: at(5), parentId: null });
    const agent = rows.find((r) => r.kind === "agent")!;
    expect(agent).toMatchObject({ label: "Helper", parentId: "a", start: at(1), end: at(4) });
    expect(step("b")).toMatchObject({ start: at(6), end: at(20) });
    expect(rows.find((r) => r.kind === "waiting")).toMatchObject({ label: "Waiting for you", start: at(7), end: at(10) });
  });
});
