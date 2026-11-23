import { describe, expect, it } from "vitest";
import type { ToolCallInfo } from "./source-types";
import { buildRunGraph, buildStaticGraph, type RunGraphInput } from "./build";
import { inferPasses } from "./passes";
import { buildActivity } from "./activity";
import type { GraphNode, WorkflowGraphModel } from "./types";
import { assistant, call, step, subagent, todo, user } from "./__fixtures__/helpers";
import { contractReview, earnings, earningsOverview, EARNINGS_T0, E_IDS, evaluation, logWatch, REVIEWERS } from "./__fixtures__/runs";
import taglineRun from "./__fixtures__/tagline-panel-run.json";

const node = (m: WorkflowGraphModel, id: string): GraphNode => {
  const n = m.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
};
const agentsOf = (m: WorkflowGraphModel, stepId: string) => m.nodes.filter((n) => n.kind === "agent" && n.parentId === stepId);

describe("buildRunGraph", () => {
  it("evaluation run: e2 fans out to six agents named from descriptions, four running, two done; header agentsWorking 4", () => {
    const m = buildRunGraph(evaluation);
    const agents = agentsOf(m, "e2");
    expect(agents.map((a) => a.label)).toEqual([
      "Test 1 with skill", "Test 2 with skill", "Test 3 with skill", "Test 1 baseline", "Test 2 baseline", "Test 3 baseline",
    ]);
    expect(agents.filter((a) => a.state === "running")).toHaveLength(4);
    expect(agents.filter((a) => a.state === "done")).toHaveLength(2);
    const fan = m.groups.filter((g) => g.kind === "fanout");
    expect(fan).toHaveLength(1);
    expect(fan[0].stepId).toBe("e2");
    expect(fan[0].nodeIds).toEqual(agents.map((a) => a.id));
    expect(m.header).toMatchObject({ agentsWorking: 4, stepIndex: 2, stepTotal: 5, stepTitle: "Run with the skill", stepsLeft: 3, failed: 0 });
    expect(m.order.slice(0, 3)).toEqual(["e1", "e2", agents[0].id]);
    expect(m.order.at(-1)).not.toBe("compile");
    // The lead's work while e1 ran.
    expect(node(m, "e1").detail.toolCalls.map((c) => [c.name, c.target])).toEqual([["write", "evals/evals.json"]]);
    expect(node(m, "e1").detail.output).toEqual(["Writing three test requests."]);
    expect(agents[0].detail.brief).toBe("Answer request 1 using the skill");
    expect(agents[0].detail.role).toBe("subagent");
  });

  it("contract review: s5 is a loop group with three child nodes; no fan-out", () => {
    const m = buildRunGraph(contractReview);
    const loop = m.groups.find((g) => g.kind === "loop");
    expect(loop).toMatchObject({ stepId: "s5", title: "Review each clause", nodeIds: ["s5.1", "s5.2", "s5.3"] });
    expect(m.groups.some((g) => g.kind === "fanout")).toBe(false);
    expect(m.nodes.some((n) => n.id === "s5")).toBe(false);
    expect(node(m, "s5.2")).toMatchObject({ parentId: "s5", state: "running", tile: "5.2" });
    expect(node(m, "s6").state).toBe("waiting");
    expect(m.header).toMatchObject({ stepTotal: 8, stepTitle: "Flag the risks", stepIndex: 6, stepsLeft: 2, pass: 1 });
  });

  it("log watch: s3 is a decision node carrying its branches", () => {
    const m = buildRunGraph(logWatch);
    expect(node(m, "s3")).toMatchObject({ kind: "decision", branches: logWatch.overviewSteps[2].branches });
    expect(m.header.done).toBe(true);
  });

  it("earnings run: declared reviewers matched by name case-insensitively; pass 2 inferred from todo_write history; each reviewer has passes {1, 2}; verdict colours from Verdict lines", () => {
    const m = buildRunGraph(earnings);
    const agents = agentsOf(m, "s3.2");
    const byName = (n: string) => agents.find((a) => a.label === n)!;
    for (const r of REVIEWERS) {
      const a = byName(r.name);
      expect(a).toBeDefined();
      expect(Object.keys(a.passes ?? {})).toEqual(["1", "2"]);
      expect(a.pass).toBe(2);
      expect(a.detail.verdict).toBe("accept");
    }
    expect(byName("Financial Expert").passes![1].verdict).toBe("reject");
    expect(byName("Risk Analyst").passes![1].verdict).toBe("reject");
    expect(byName("Persuasiveness Expert").passes![1].verdict).toBe("accept");
    expect(byName("Financial Expert").detail.toolCalls.map((c) => c.target)).toEqual(["drafts/v2.md"]);
    expect(byName("Financial Expert").detail.output).toEqual(["Numbers check out.\nVerdict: accept"]);
    expect(agents).toHaveLength(4); // the undeclared fact checker joins the fan-out
    const loop = m.groups.find((g) => g.kind === "loop")!;
    expect(loop).toMatchObject({ stepId: "s3", pass: 2, maxPasses: 3 });
    expect(node(m, "s3.1").passes && Object.keys(node(m, "s3.1").passes!)).toEqual(["1", "2"]);
    expect(node(m, "s3.1").detail.toolCalls.map((c) => c.target)).toEqual(["drafts/v2.md"]);
    expect(node(m, "s4").detail.outputs).toEqual(["report.md"]);
  });

  it("an undeclared subagent's Verdict line gives no verdict", () => {
    const m = buildRunGraph(earnings);
    const fact = agentsOf(m, "s3.2").find((a) => a.label === "Fact checker")!;
    expect(fact.detail.verdict).toBeNull();
    expect(fact.line).toBeNull();
  });

  it("a declared agent never called is waiting while live and not_run when finished", () => {
    const overview = structuredClone(earningsOverview);
    overview[2].children![1].agents = [...REVIEWERS, { name: "Legal Expert", role: "Checks the wording" }];
    const finished = buildRunGraph({ ...earnings, overviewSteps: overview });
    expect(agentsOf(finished, "s3.2").find((a) => a.label === "Legal Expert")?.state).toBe("not_run");
    const live = buildRunGraph({ ...earnings, overviewSteps: overview, live: true });
    expect(agentsOf(live, "s3.2").find((a) => a.label === "Legal Expert")?.state).toBe("waiting");
  });

  it("a subagent call still streaming its arguments draws no node until it starts", () => {
    const at = (status: "streaming_args" | "executing", description: string | undefined) => buildRunGraph({
      overviewSteps: null,
      steps: [step("s1", "Review", 0, "running")],
      messages: [user("u", "go"), assistant("a", [todo(["s1"], { s1: "in_progress" }), subagent(description, "", status)], true)],
      live: true
    });
    expect(agentsOf(at("streaming_args", undefined), "s1")).toEqual([]);
    expect(agentsOf(at("streaming_args", "Fin"), "s1")).toEqual([]);
    expect(agentsOf(at("executing", "Financial Expert"), "s1").map((a) => a.label)).toEqual(["Financial Expert"]);
  });

  it("a subagent call before the first todo_write attaches to the first step; one without description takes the first line of task", () => {
    const m = buildRunGraph({
      overviewSteps: null,
      steps: [step("s1", "Look around", 0, "running"), step("s2", "Write", 0, "pending")],
      messages: [user("u", "go"), assistant("a", [subagent(undefined, "  Survey the folder for notes  \nthen list them", "executing")], true)],
      live: true
    });
    const agents = agentsOf(m, "s1");
    expect(agents.map((a) => a.label)).toEqual(["Survey the folder for notes"]);
  });

  it("no overview steps: built from depth, an item with deeper items is a loop region", () => {
    const steps = [
      step("s1", "One", 0, "done"),
      step("s2", "Two", 0, "running"),
      step("s2.1", "Two a", 1, "running"),
      step("s2.2", "Two b", 1, "pending"),
      step("s3", "Three", 0, "pending"),
    ];
    for (const overviewSteps of [null, []]) {
      const m = buildRunGraph({ overviewSteps, steps, messages: [], live: true });
      expect(m.groups).toEqual([expect.objectContaining({ kind: "loop", stepId: "s2", nodeIds: ["s2.1", "s2.2"] })]);
      expect(m.nodes.map((n) => [n.id, n.kind])).toEqual([
        ["s1", "step"], ["s2.1", "step"], ["s2.2", "step"], ["s3", "step"],
      ]);
    }
  });

  it("a subagent call that errors is failed with its error as the line; header failed 1", () => {
    const m = buildRunGraph({
      overviewSteps: null,
      steps: [step("s1", "Research", 0, "running")],
      messages: [
        user("u", "go"),
        assistant("a", [todo(["s1"], { s1: "in_progress" }), subagent("Search the web", "find it", "error", { result: "Error: model refused\nstack" })], true),
      ],
      live: true
    });
    const [agent] = agentsOf(m, "s1");
    expect(agent).toMatchObject({ state: "failed", line: "Error: model refused" });
    expect(m.header.failed).toBe(1);
  });

  it("durations: a done node's detail has startedAt/endedAt from stamps when present, else from step rows", () => {
    const m = buildRunGraph(earnings);
    expect(node(m, "s4").detail).toMatchObject({ startedAt: EARNINGS_T0 + 600_000, endedAt: EARNINGS_T0 + 900_100 });
    expect(node(m, "s1").detail).toMatchObject({ startedAt: EARNINGS_T0, endedAt: EARNINGS_T0 + 60_000 });
    expect(node(m, "s2").detail).toMatchObject({ startedAt: null, endedAt: null });
    const fin = agentsOf(m, "s3.2").find((a) => a.label === "Financial Expert")!;
    expect(fin.passes![1]).toMatchObject({ startedAt: EARNINGS_T0 + 120_000, endedAt: EARNINGS_T0 + 180_000 });
  });
});

describe("fix round 1", () => {
  it("a finished run's running row and executing call are stopped, never counted as working", () => {
    const m = buildRunGraph({
      overviewSteps: null,
      steps: [step("s1", "Research", 0, "done"), step("s2", "Write", 0, "running"), step("s3", "Send", 0, "pending")],
      messages: [
        user("u", "go"),
        assistant("a", [todo(["s1", "s2", "s3"], { s1: "completed", s2: "in_progress" }), subagent("Draft it", "write the draft", "executing")]),
      ],
      live: false
    });
    expect(node(m, "s2")).toMatchObject({ state: "stopped", line: "Stopped here" });
    expect(agentsOf(m, "s2")[0]).toMatchObject({ state: "stopped", line: "Stopped here" });
    expect(node(m, "s3").state).toBe("not_run");
    expect(m.header).toMatchObject({ agentsWorking: 0, stepTitle: null, stepIndex: 1 });
    // The same while live is still running.
    const live = buildRunGraph({ ...evaluation });
    expect(live.nodes.some((n) => n.state === "stopped")).toBe(false);
  });

  it("a todo_write that ends a pass and starts the next files each step's times and outputs under its own pass", () => {
    const overview = [
      { id: "s3", title: "Review", detail: "", kind: "loop" as const, children: [
        { id: "s3.1", title: "Revise", detail: "", kind: "action" as const },
        { id: "s3.2", title: "Check", detail: "", kind: "action" as const },
      ] },
    ];
    const ids = ["s3", "s3.1", "s3.2"];
    const at = (t: number) => ({ startedAt: t, endedAt: t + 1 });
    const m = buildRunGraph({
      overviewSteps: overview,
      steps: [step("s3", "Review", 0, "running"), step("s3.1", "Revise", 1, "done"), step("s3.2", "Check", 1, "done")],
      messages: [
        user("u", "go"),
        assistant("a", [
          todo(ids, { s3: "in_progress", "s3.1": "in_progress" }, at(100)),
          todo(ids, { s3: "in_progress", "s3.1": "completed", "s3.2": "in_progress" }, at(200)),
          todo(ids, { s3: "in_progress", "s3.1": "in_progress", "s3.2": "completed" }, at(300), { "s3.2": ["review-1.md"] }),
          todo(ids, { s3: "in_progress", "s3.1": "completed", "s3.2": "in_progress" }, at(400), { "s3.2": ["review-1.md"] }),
          todo(ids, { s3: "in_progress", "s3.1": "completed", "s3.2": "completed" }, at(500), { "s3.2": ["review-1.md", "review-2.md"] }),
        ], true),
      ],
      live: true
    });
    const p = node(m, "s3.2").passes!;
    expect(p[1]).toMatchObject({ startedAt: 200, endedAt: 301, outputs: ["review-1.md"] });
    expect(p[2]).toMatchObject({ startedAt: 400, endedAt: 501, outputs: ["review-2.md"] });
    expect(p[2].startedAt!).toBeLessThanOrEqual(p[2].endedAt!);
    expect(node(m, "s3.1").passes![1]).toMatchObject({ startedAt: 100, endedAt: 201 });
  });

  it("a declared agent without a role string keeps its declared status", () => {
    const overview = structuredClone(earningsOverview);
    overview[2].children![1].agents = [{ name: "Financial Expert" } as unknown as { name: string; role: string }];
    const m = buildRunGraph({ ...earnings, overviewSteps: overview });
    const fin = agentsOf(m, "s3.2").find((a) => a.label === "Financial Expert")!;
    expect(fin.role).toBe("");
    expect(fin.passes![1].verdict).toBe("reject");
  });
});

describe("buildStaticGraph", () => {
  it("buildStaticGraph: every node waiting, declared agents present", () => {
    const m = buildStaticGraph(earningsOverview);
    expect(m.nodes.every((n) => n.state === "waiting")).toBe(true);
    expect(agentsOf(m, "s3.2").map((a) => a.label)).toEqual(REVIEWERS.map((r) => r.name));
    expect(agentsOf(m, "s3.2")[0].line).toBe(REVIEWERS[0].role);
    expect(m.groups.map((g) => g.kind).sort()).toEqual(["fanout", "loop"]);
    expect(m.header).toMatchObject({ stepIndex: 0, stepTotal: 5, maxPasses: null, done: false });
  });
});

describe("inferPasses", () => {
  it("a pass starts each time the loop's first child goes in_progress after having been done", () => {
    const passes = inferPasses(earnings.messages, { id: "s3", childIds: ["s3.1", "s3.2"] });
    expect(passes.map((p) => p.pass)).toEqual([1, 2]);
    expect(passes[0].startIndex).toBeLessThan(passes[1].startIndex);
    expect(inferPasses(earnings.messages, { id: "zz", childIds: ["zz.1"] })).toEqual([]);
  });
});

describe("buildActivity", () => {
  it('buildActivity: newest first, contains "3 reviewers started on draft v1"-style lines only from real events', () => {
    const m = buildRunGraph(earnings);
    const lines = buildActivity(m, earnings.messages);
    const texts = lines.map((l) => `${l.who}: ${l.text}`);
    expect(texts[0]).toBe("Lead agent: Finished Write the final report");
    expect(texts).toContain("Lead agent: 3 reviewers started on Review the draft");
    expect(texts).toContain("Lead agent: 4 agents started on Review the draft");
    expect(texts).toContain("Financial Expert: Verdict: reject");
    expect(texts).toContain("Persuasiveness Expert: Verdict: accept");
    expect(texts.some((t) => t.startsWith("Fact checker: Verdict"))).toBe(false);
    expect(texts).toContain("Fact checker: Finished");
    expect(texts.at(-1)).toBe("Lead agent: Started Gather the filings");
    // Nothing for steps that never changed state.
    expect(buildActivity(buildRunGraph({ ...evaluation, messages: [] }), [])).toEqual([]);
    const stamped = lines.find((l) => l.text === "Verdict: reject" && l.who === "Financial Expert");
    expect(stamped?.at).toBe(EARNINGS_T0 + 180_000);
  });
});

/* The real tagline-panel run (Task 12 E2E): the checklist never says "pass N" and the agent kept 3.1 in
 * progress while it spawned three rounds of reviewers named "… for bike lock tagline", "… v2", "… v3". */
const tagline = taglineRun as unknown as RunGraphInput;
const TAGLINE_REVIEWERS = ["Clarity Reviewer", "Brand Reviewer", "Brevity Reviewer"];

describe("real run: tagline-panel", () => {
  it("infers three passes from the repeated reviewers, and the loop says so", () => {
    const m = buildRunGraph(tagline);
    const loop = m.groups.find((g) => g.kind === "loop")!;
    expect(loop).toMatchObject({ stepId: "s3", pass: 3, maxPasses: 2 });
    expect(m.header.done).toBe(true);
  });

  it("attaches the reviewers to 3.2, which declares them, three agents with a pass each", () => {
    const m = buildRunGraph(tagline);
    expect(agentsOf(m, "s3.1")).toHaveLength(0);
    const agents = agentsOf(m, "s3.2");
    expect(agents.map((a) => a.label)).toEqual(TAGLINE_REVIEWERS);
    for (const a of agents) {
      expect(Object.keys(a.passes ?? {})).toEqual(["1", "2", "3"]);
      expect(a.pass).toBe(3);
      expect(a.state).toBe("done");
      expect(a.role).toBeTruthy();
      expect(a.detail.brief).toContain("Lose your keys, not your bike");
      expect(a.passes![1].brief).toContain("Bike security in your pocket");
    }
    const fanout = m.groups.find((g) => g.kind === "fanout")!;
    expect(fanout).toMatchObject({ stepId: "s3.2", nodeIds: agents.map((a) => a.id), pass: 3, title: "3 reviewers" });
  });

  it("reads each pass's verdict, past the [subagent usage] line", () => {
    const m = buildRunGraph(tagline);
    const by = (label: string) => agentsOf(m, "s3.2").find((a) => a.label === label)!;
    expect([1, 2, 3].map((p) => by("Clarity Reviewer").passes![p].verdict)).toEqual(["accept", "accept", "reject"]);
    expect([1, 2, 3].map((p) => by("Brand Reviewer").passes![p].verdict)).toEqual(["reject", "reject", "reject"]);
    expect(by("Brevity Reviewer").detail.verdict).toBe("accept");
    expect(by("Brevity Reviewer").line).toBe("Accepted");
    expect(by("Clarity Reviewer").line).toBe("Rejected");
    expect(by("Brand Reviewer").detail.output.join("\n")).not.toContain("[subagent usage]");
  });

  it("files the steps' own work under their passes", () => {
    const m = buildRunGraph(tagline);
    // Each revision opens its pass: v2 was written before the second round of reviews, not after it.
    const p = node(m, "s3.1").passes!;
    expect(p[1].toolCalls.map((c) => c.target)).toEqual(["tagline-v1.md"]);
    expect(p[2].toolCalls.map((c) => c.target)).toEqual(["tagline-v2.md"]);
  });

  it("the activity log names the declared reviewers, their step and their verdicts", () => {
    const m = buildRunGraph(tagline);
    const texts = buildActivity(m, tagline.messages).map((l) => `${l.who}: ${l.text}`);
    expect(texts.filter((t) => t === "Lead agent: 3 reviewers started on Get parallel reviews")).toHaveLength(3);
    expect(texts.filter((t) => t === "Brand Reviewer: Verdict: reject")).toHaveLength(3);
    expect(texts.filter((t) => t === "Clarity Reviewer: Verdict: accept")).toHaveLength(2);
  });
});

/* The earnings-report shape (Financial Expert, Risk Analyst, Persuasiveness Expert, up to 3 passes)
 * with a checklist that never re-marks its loop children: passes come from the reviewers alone. */
describe("earnings shape, unannotated checklist", () => {
  const rounds = [1, 2, 3].flatMap((n) => [
    call("write", { path: `drafts/v${n}.md`, content: `draft ${n}` }),
    ...REVIEWERS.map((r) => subagent(`${r.name} review of the draft${n === 1 ? "" : ` v${n}`}`, `Review drafts/v${n}.md`, "done", { result: `Notes.\nVerdict: ${n === 3 ? "accept" : "reject"}` })),
  ]);
  const messages = [
    user("u", "Grade the Q3 earnings"),
    assistant("a", [
      todo(E_IDS, { s1: "in_progress" }),
      todo(E_IDS, { s1: "completed", s2: "completed", s3: "in_progress", "s3.1": "in_progress" }),
      ...rounds,
      todo(E_IDS, { s1: "completed", s2: "completed", s3: "completed", "s3.1": "completed", "s3.2": "completed", s4: "completed" }),
    ]),
  ];
  const steps = earnings.steps;

  it("with the overview: three declared reviewers on 3.2, passes 1 to 3", () => {
    const m = buildRunGraph({ ...earnings, messages });
    const agents = agentsOf(m, "s3.2");
    expect(agents.map((a) => a.label)).toEqual(REVIEWERS.map((r) => r.name));
    for (const a of agents) {
      expect(Object.keys(a.passes ?? {})).toEqual(["1", "2", "3"]);
      expect(a.detail.verdict).toBe("accept");
      expect(a.passes![1].verdict).toBe("reject");
    }
    expect(agentsOf(m, "s3.1")).toHaveLength(0);
    expect(m.groups.find((g) => g.kind === "loop")).toMatchObject({ pass: 3, maxPasses: 3 });
  });

  it("without an overview: three agents merged by name under the step that ran them, passes 1 to 3", () => {
    const m = buildRunGraph({ ...earnings, overviewSteps: null, steps, messages });
    const agents = agentsOf(m, "s3.1");
    expect(agents.map((a) => a.label)).toEqual(REVIEWERS.map((r) => `${r.name} review of the draft`));
    for (const a of agents) expect(Object.keys(a.passes ?? {})).toEqual(["1", "2", "3"]);
    expect(m.groups.find((g) => g.kind === "loop")).toMatchObject({ stepId: "s3", pass: 3 });
  });
});

describe("inferPasses with agents", () => {
  it("a loop agent whose normalised name already ran in the current pass starts the next pass; a child re-entering after done does too", () => {
    const ids = ["l", "l.1", "l.2"];
    const messages = [
      user("u", "go"),
      assistant("a", [
        todo(ids, { l: "in_progress", "l.1": "in_progress" }),
        subagent("Critic", "look", "done"),
        call("write", { path: "v2.md", content: "x" }),
        subagent("Critic v2", "look again", "done"),
        todo(ids, { l: "in_progress", "l.1": "completed", "l.2": "in_progress" }),
        todo(ids, { l: "in_progress", "l.1": "in_progress", "l.2": "completed" }),
      ]),
    ];
    const agentKey = (call: ToolCallInfo) =>
      call.toolName === "subagent" ? String(call.args?.description).replace(/ v\d+$/, "").toLowerCase() : null;
    const passes = inferPasses(messages, { id: "l", childIds: ["l.1", "l.2"] }, agentKey);
    expect(passes).toEqual([{ pass: 1, startIndex: 0 }, { pass: 2, startIndex: 2 }, { pass: 3, startIndex: 5 }]);
  });
});

/* Review probes (fix round 1 on the fix waves): fan-outs, retries and agents outside the loop are not passes. */
describe("passes: fan-outs, retries and the loop's window", () => {
  const open = todo(E_IDS, { s1: "completed", s2: "completed", s3: "in_progress", "s3.1": "in_progress" });
  const run = (blocks: ReturnType<typeof subagent>[], extra: Partial<RunGraphInput> = {}) =>
    buildRunGraph({ ...earnings, messages: [user("u", "go"), assistant("a", blocks)], ...extra });
  const loopPass = (m: WorkflowGraphModel) => m.groups.find((g) => g.kind === "loop")!.pass;

  it("a parallel fan-out of #n helpers is one pass with three agents", () => {
    const m = run([open, subagent("Helper #1", "a", "done"), subagent("Helper #2", "b", "done"), subagent("Helper #3", "c", "done")]);
    expect(loopPass(m)).toBe(1);
    expect(agentsOf(m, "s3.1").map((a) => a.label)).toEqual(["Helper #1", "Helper #2", "Helper #3"]);
    expect(agentsOf(m, "s3.1").every((a) => a.passes === null)).toBe(true);
  });

  it("the same name twice back to back, with no lead work between, is one pass", () => {
    const m = run([open, subagent("Critic", "a", "done"), subagent("Critic v2", "b", "done")]);
    expect(loopPass(m)).toBe(1);
  });

  it("a retry after an error is not a pass, even after lead work", () => {
    const m = run([
      todo(E_IDS, { s1: "completed", s2: "completed", s3: "in_progress", "s3.1": "completed", "s3.2": "in_progress" }),
      subagent("Risk Analyst", "review", "error", { result: "timed out" }),
      call("read", { path: "drafts/v1.md" }),
      subagent("Risk Analyst", "review", "done", { result: "Fine.\nVerdict: accept" }),
    ]);
    expect(loopPass(m)).toBe(1);
    const risk = agentsOf(m, "s3.2").find((a) => a.label === "Risk Analyst")!;
    expect(risk).toMatchObject({ state: "done", pass: 1, passes: null });
    expect(risk.detail.verdict).toBe("accept");
  });

  it("an undeclared agent's retry replaces its failed run instead of adding a node", () => {
    const m = run([open, subagent("Fact checker", "check", "error", { result: "boom" }), subagent("Fact checker", "check", "done")]);
    expect(agentsOf(m, "s3.1")).toHaveLength(1);
    expect(agentsOf(m, "s3.1")[0].state).toBe("done");
  });

  it("an agent before the loop whose name contains a declared one stays on its own step and starts no pass", () => {
    const m = run([
      todo(E_IDS, { s1: "in_progress" }),
      subagent("Junior Risk Analyst helper for filings", "find filings", "done"),
      todo(E_IDS, { s1: "completed", s2: "completed", s3: "in_progress", "s3.1": "completed", "s3.2": "in_progress" }),
      subagent("Risk Analyst", "review", "done", { result: "Fine.\nVerdict: accept" }),
    ]);
    expect(agentsOf(m, "s1").map((a) => a.label)).toEqual(["Junior Risk Analyst helper for filings"]);
    expect(agentsOf(m, "s1")[0].role).toBeUndefined();
    expect(loopPass(m)).toBe(1);
    expect(agentsOf(m, "s3.2").find((a) => a.label === "Risk Analyst")).toMatchObject({ pass: 1, passes: null });
  });

  it("a declared name spawned under a step outside the loop is not pulled into it", () => {
    const m = run([
      todo(E_IDS, { s1: "completed", s2: "in_progress" }),
      subagent("Risk Analyst", "early look", "done"),
      todo(E_IDS, { s1: "completed", s2: "completed", s3: "in_progress", "s3.1": "completed", "s3.2": "in_progress" }),
      subagent("Risk Analyst", "review", "done"),
    ]);
    expect(agentsOf(m, "s2").map((a) => a.label)).toEqual(["Risk Analyst"]);
    expect(loopPass(m)).toBe(1);
    expect(agentsOf(m, "s3.2").find((a) => a.label === "Risk Analyst")).toMatchObject({ pass: 1, passes: null });
  });

  it("agents spawned after the loop closed count toward no pass", () => {
    const m = run([
      todo(E_IDS, { s1: "completed", s2: "completed", s3: "in_progress", "s3.1": "completed", "s3.2": "in_progress" }),
      subagent("Risk Analyst", "review", "done"),
      todo(E_IDS, { s1: "completed", s2: "completed", s3: "completed", "s3.1": "completed", "s3.2": "completed" }),
      call("read", { path: "report.md" }),
      subagent("Risk Analyst", "one more look", "done"),
    ]);
    expect(loopPass(m)).toBe(1);
  });
});

/* Final review I1: a step's Outputs are the tracker's attributed paths, never the raw todo_write strings. */
describe("step outputs come from the tracker", () => {
  const overview = [
    { id: "s1", title: "Write", detail: "", kind: "action" as const },
    { id: "s2", title: "Check", detail: "", kind: "action" as const },
  ];
  const ids = ["s1", "s2"];
  const base: RunGraphInput = {
    overviewSteps: overview,
    steps: [step("s1", "Write", 0, "done"), step("s2", "Check", 0, "done")],
    messages: [
      user("u", "go"),
      assistant("a", [
        todo(ids, { s1: "in_progress" }),
        todo(ids, { s1: "completed", s2: "in_progress" }, {}, { s1: ["/workspace/p1/report.md", ".pi/x", "../y"] }),
        todo(ids, { s1: "completed", s2: "completed" }, {}, { s1: ["/workspace/p1/report.md", ".pi/x", "../y"], s2: ["notes.md"] }),
      ]),
    ],
    live: false
  };

  it("absolute paths become the tracker's project path; .pi/ and ../ strings are not offered", () => {
    const m = buildRunGraph({ ...base, outputs: [{ path: "report.md", stepId: "s1" }, { path: "notes.md", stepId: "s2" }] });
    expect(node(m, "s1").detail.outputs).toEqual(["report.md"]);
    expect(node(m, "s2").detail.outputs).toEqual(["notes.md"]);
  });

  it("an output the tracker gave a step that its todo_write never named still shows on that step", () => {
    const m = buildRunGraph({ ...base, outputs: [{ path: "report.md", stepId: "s1" }, { path: "extra.csv", stepId: "s2" }, { path: "loose.txt", stepId: null }] });
    expect(node(m, "s2").detail.outputs).toEqual(["extra.csv"]);
    expect(node(m, "s1").detail.outputs).toEqual(["report.md"]);
  });

  it("a run whose tracker recorded nothing offers no outputs", () => {
    const m = buildRunGraph({ ...base, outputs: [] });
    expect(node(m, "s1").detail.outputs).toEqual([]);
  });
});

describe("Runwell: failed steps", () => {
  it("a step reported failed is a failed node and counts in the header", () => {
    const g = buildRunGraph({ overviewSteps: null, live: false, steps: [step("a", "A", 0, "done"), step("b", "B", 0, "failed")],
      messages: [assistant("m1", [todo(["a", "b"], { a: "completed", b: "failed" })])] });
    expect(g.nodes.find((n) => n.id === "b")!.state).toBe("failed");
    expect(g.header.failed).toBe(1);
    expect(g.nodes.some((n) => (n.kind as string) === "compile")).toBe(false);
  });
});
