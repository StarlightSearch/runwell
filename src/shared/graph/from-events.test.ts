import { describe, expect, it } from "vitest";
import type { RunEvent, StepReport } from "../events";
import type { OverviewStep } from "./source-types";
import { askNodeId, graphOf, toGraphInput } from "./from-events";

const at = (n: number) => 1_700_000_000_000 + n * 1000;
const WF: OverviewStep[] = [
  { id: "s1", title: "Brief", detail: "", kind: "action" },
  { id: "s2", title: "Build until it passes", detail: "", kind: "loop", maxPasses: 3, children: [
    { id: "s2.1", title: "Animate", detail: "", kind: "action" }, { id: "s2.2", title: "Review", detail: "", kind: "action" }] },
];
const ev = (stepId: string, status: StepReport, n: number, note: string | null = null): RunEvent => ({ t: "step", at: at(n), stepId, status, note });

describe("toGraphInput / graphOf", () => {
  it("planned steps follow reported status", () => {
    const g = graphOf([ev("s1", "started", 0), ev("s1", "done", 5, "read 4 pages")], WF, true);
    expect(g.nodes.find((n) => n.id === "s1")).toMatchObject({ state: "done", line: "read 4 pages" });
    expect(g.nodes.find((n) => n.id === "s2.1")!.state).toBe("waiting");
  });

  it("a loop child started again after done is pass 2", () => {
    const g = graphOf([ev("s2.1", "started", 1), ev("s2.1", "done", 2), ev("s2.2", "started", 3), ev("s2.2", "done", 4), ev("s2.1", "started", 5)], WF, true);
    expect(g.groups.find((x) => x.kind === "loop")).toMatchObject({ pass: 2, maxPasses: 3 });
  });

  it("a subagent attaches to the running step, with its own calls and state", () => {
    const g = graphOf([
      ev("s1", "started", 0),
      { t: "tool.start", at: at(1), id: "T1", agentId: null, name: "Task", input: { description: "Copy researcher", prompt: "Verify claims" } },
      { t: "tool.start", at: at(2), id: "b1", agentId: "T1", name: "Bash", input: { command: "ls" } },
      { t: "tool.end", at: at(3), id: "b1", ok: true, result: "a.txt" }], WF, true);
    const agent = g.nodes.find((n) => n.kind === "agent")!;
    expect(agent).toMatchObject({ label: "Copy researcher", parentId: "s1", state: "running" });
    expect(agent.detail.toolCalls.map((c) => c.name)).toEqual(["Bash"]);
    expect(g.header.agentsWorking).toBe(1);
  });

  it("an unplanned step id is added, not rejected", () => {
    const g = graphOf([ev("render-frames", "started", 0)], WF, true);
    expect(g.nodes.find((n) => n.id === "render-frames")).toMatchObject({ label: "Render frames", state: "running" });
  });

  it("with no workflow the graph is the reported steps in order", () => {
    const g = graphOf([ev("plan", "done", 0), ev("write", "started", 1)], null, true);
    expect(g.order.filter((id) => ["plan", "write"].includes(id))).toEqual(["plan", "write"]);
  });

  it("a finished run leaves no node running", () => {
    const g = graphOf([ev("s1", "started", 0)], WF, false);
    expect(g.nodes.find((n) => n.id === "s1")!.state).toBe("stopped");
  });

  it("with no steps and no workflow, agents still show under one node named Run", () => {
    const g = graphOf([{ t: "tool.start", at: at(1), id: "T1", agentId: null, name: "Task", input: { description: "Helper", prompt: "x" } }], null, false);
    expect(g.nodes.filter((n) => n.kind === "agent")).toHaveLength(1);
    expect(g.nodes.find((n) => n.kind !== "agent")!.label).toBe("Run");
  });

  it("a nested subagent's calls fold into its top-level agent; Agent counts as a subagent tool", () => {
    const g = graphOf([
      ev("s1", "started", 0),
      { t: "tool.start", at: at(1), id: "A1", agentId: null, name: "Agent", input: { description: "Outer", prompt: "x" } },
      { t: "tool.start", at: at(2), id: "A2", agentId: "A1", name: "Agent", input: { description: "Inner", prompt: "y" } },
      { t: "tool.start", at: at(3), id: "r1", agentId: "A2", name: "Read", input: { file_path: "/p/a.txt" } },
      { t: "tool.end", at: at(4), id: "r1", ok: true, result: "hi" },
      { t: "tool.end", at: at(5), id: "A2", ok: true, result: "inner done" },
      { t: "tool.end", at: at(6), id: "A1", ok: false, result: "outer failed" }], WF, true);
    const agents = g.nodes.filter((n) => n.kind === "agent");
    expect(agents.map((a) => a.label)).toEqual(["Outer"]);
    expect(agents[0]!.state).toBe("failed");
    expect(agents[0]!.detail.toolCalls.map((c) => c.name)).toEqual(["Agent", "Read"]);
  });

  it("step rows carry status and ISO times", () => {
    const input = toGraphInput([ev("s1", "started", 0), ev("s1", "failed", 2, "no network")], WF, false);
    expect(input.steps.find((r) => r.id === "s1")).toMatchObject({ status: "failed", note: "no network", startedAt: new Date(at(0)).toISOString(), finishedAt: new Date(at(2)).toISOString() });
    expect(input.steps.find((r) => r.id === "s2.1")).toMatchObject({ status: "pending", depth: 1 });
  });
});

describe("askNodeId", () => {
  it("is the agent's node for an agent's ask, else the running step", () => {
    const events: RunEvent[] = [
      ev("s1", "started", 0),
      { t: "tool.start", at: at(1), id: "T1", agentId: null, name: "Task", input: { description: "Helper", prompt: "x" } },
    ];
    const g = graphOf(events, WF, true);
    const agentNode = g.nodes.find((n) => n.kind === "agent")!;
    expect(askNodeId(g, { id: "q1", kind: "permission", toolCallId: null, agentId: "T1", tool: "Bash", input: {} }, events)).toBe(agentNode.id);
    expect(askNodeId(g, { id: "q2", kind: "permission", toolCallId: null, agentId: null, tool: "Write", input: {} }, events)).toBe("s1");
  });
});
