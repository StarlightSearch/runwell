import { describe, expect, it } from "vitest";
import type { OverviewStep } from "./source-types";
import { buildRunGraph, buildStaticGraph } from "./build";
import {
  AGENT_H, GAP_Y, layoutWorkflowGraph, NARROW_BELOW, STEP_H, STEP_W,
  type GraphLayout, type PlacedNode,
} from "./layout";
import { passText } from "./layout";
import type { WorkflowGraphModel } from "./types";
import { contractReview, earnings, evaluation, logWatch } from "./__fixtures__/runs";

const SPINE_KINDS = new Set(["step", "decision", "loop-step"]);
const spineIds = (m: WorkflowGraphModel) => m.order.filter((id) => SPINE_KINDS.has(m.nodes.find((n) => n.id === id)!.kind));
const agentIds = (m: WorkflowGraphModel, stepId: string) => m.nodes.filter((n) => n.kind === "agent" && n.parentId === stepId).map((n) => n.id);
const at = (l: GraphLayout, id: string): PlacedNode => {
  const n = l.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no placed node ${id}`);
  return n;
};
const overlaps = (a: PlacedNode, b: PlacedNode) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function expectNoOverlapInside(l: GraphLayout) {
  for (let i = 0; i < l.nodes.length; i++) {
    const a = l.nodes[i];
    expect(a.x, `${a.id} left`).toBeGreaterThanOrEqual(0);
    expect(a.x + a.w, `${a.id} right`).toBeLessThanOrEqual(l.width);
    expect(a.y + a.h, `${a.id} bottom`).toBeLessThanOrEqual(l.height);
    for (let j = i + 1; j < l.nodes.length; j++) expect(overlaps(a, l.nodes[j]), `${a.id} / ${l.nodes[j].id}`).toBe(false);
  }
  for (const g of l.groups) {
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.x + g.w).toBeLessThanOrEqual(l.width);
  }
}

/** Splits an M/H/V path into its points; throws on any other command. */
function points(path: string): [number, number][] {
  const tokens = path.trim().split(/\s+/);
  const pts: [number, number][] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.startsWith("M")) {
      pts.push([Number(t.slice(1)), Number(tokens[i + 1])]);
      i += 2;
    } else if (t.startsWith("H")) {
      pts.push([Number(t.slice(1)), pts.at(-1)![1]]);
      i += 1;
    } else if (t.startsWith("V")) {
      pts.push([pts.at(-1)![0], Number(t.slice(1))]);
      i += 1;
    } else throw new Error(`not orthogonal: ${path}`);
  }
  for (const p of pts) expect(Number.isFinite(p[0]) && Number.isFinite(p[1]), path).toBe(true);
  return pts;
}

const actions = (n: number): OverviewStep[] => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, title: `Step ${i + 1}`, detail: "", kind: "action" as const }));

describe("layoutWorkflowGraph", () => {
  it("picks the mode from the width", () => {
    const m = buildRunGraph(logWatch);
    expect(layoutWorkflowGraph(m, 900).mode).toBe("hybrid");
    expect(layoutWorkflowGraph(m, NARROW_BELOW).mode).toBe("hybrid");
    expect(layoutWorkflowGraph(m, NARROW_BELOW - 1).mode).toBe("narrow");
  });

  it("hybrid: steps centred on one spine, top to bottom in order, 24px apart", () => {
    const m = buildRunGraph(logWatch);
    const l = layoutWorkflowGraph(m, 900);
    const ids = spineIds(m);
    expect(ids).toEqual(["s1", "s2", "s3", "s4"]);
    const placed = ids.map((id) => at(l, id));
    for (const n of placed) {
      expect(n.x + n.w / 2).toBe(450);
      expect(n.w).toBe(STEP_W);
      expect(n.h).toBe(STEP_H);
    }
    for (let i = 1; i < placed.length; i++) expect(placed[i].y - (placed[i - 1].y + placed[i - 1].h)).toBe(GAP_Y);
  });

  it("a fan-out of 3 is one row under its step; of 6 is two columns off the spine", () => {
    const three = buildStaticGraph([
      { id: "s1", title: "Review", detail: "", kind: "action", agents: [{ name: "A", role: "" }, { name: "B", role: "" }, { name: "C", role: "" }] },
      { id: "s2", title: "Write", detail: "", kind: "action" },
    ]);
    const l3 = layoutWorkflowGraph(three, 1000);
    const row = agentIds(three, "s1").map((id) => at(l3, id));
    expect(row).toHaveLength(3);
    const step = at(l3, "s1");
    expect(new Set(row.map((a) => a.y)).size).toBe(1);
    expect(row[0].y).toBeGreaterThan(step.y + step.h);
    expect(row[0].x).toBeLessThan(row[1].x);
    expect(row[1].x).toBeLessThan(row[2].x);
    const rowMid = (row[0].x + row[2].x + row[2].w) / 2;
    expect(Math.abs(rowMid - (step.x + step.w / 2))).toBeLessThanOrEqual(1);
    for (const a of row) expect(a.h).toBe(AGENT_H);
    expect(at(l3, "s2").y).toBeGreaterThan(row[0].y + row[0].h);

    const m6 = buildRunGraph(evaluation);
    for (const width of [700, 1100]) {
      const l6 = layoutWorkflowGraph(m6, width);
      const e2 = at(l6, "e2");
      const cx = e2.x + e2.w / 2;
      const agents = agentIds(m6, "e2").map((id) => at(l6, id));
      expect(agents).toHaveLength(6);
      const left = agents.filter((a) => a.x + a.w < cx);
      const right = agents.filter((a) => a.x > cx);
      expect(left).toHaveLength(3);
      expect(right).toHaveLength(3);
      expect(new Set(left.map((a) => a.x)).size).toBe(1);
      expect(new Set(right.map((a) => a.x)).size).toBe(1);
      for (const a of agents) expect(a.y).toBeGreaterThan(e2.y + e2.h);
    }
  });

  it("with 6 agents at width 700 (and 1100, 600, 360) no two nodes overlap and every node is inside [0, width]", () => {
    const m = buildRunGraph(evaluation);
    expectNoOverlapInside(layoutWorkflowGraph(m, 700));
    expectNoOverlapInside(layoutWorkflowGraph(m, 1100));
    expectNoOverlapInside(layoutWorkflowGraph(m, 600));
    expectNoOverlapInside(layoutWorkflowGraph(m, 360));
    expectNoOverlapInside(layoutWorkflowGraph(m, 420));
    // The loop fixtures too, fan-out inside a loop included.
    for (const fx of [contractReview, earnings]) {
      const mm = buildRunGraph(fx);
      for (const w of [600, 700, 1100]) expectNoOverlapInside(layoutWorkflowGraph(mm, w));
      expectNoOverlapInside(layoutWorkflowGraph(mm, 360));
      expectNoOverlapInside(layoutWorkflowGraph(mm, 480));
    }
  });

  it("narrow under 600: agents become an indented list under their step", () => {
    const m = buildRunGraph(evaluation);
    const l = layoutWorkflowGraph(m, 520);
    expect(l.mode).toBe("narrow");
    const e2 = at(l, "e2");
    const agents = agentIds(m, "e2").map((id) => at(l, id));
    expect(new Set(agents.map((a) => a.x)).size).toBe(1);
    expect(agents[0].x).toBeGreaterThan(e2.x);
    expect(agents[0].x + agents[0].w).toBe(e2.x + e2.w);
    for (let i = 0; i < agents.length; i++) {
      const prevBottom = i === 0 ? e2.y + e2.h : agents[i - 1].y + agents[i - 1].h;
      expect(agents[i].y).toBeGreaterThan(prevBottom);
      expect(agents[i].h).toBe(AGENT_H);
    }
    expect(at(l, "e3").y).toBeGreaterThan(agents[5].y + agents[5].h);
    // Steps keep their real height and share one left spine.
    for (const id of ["e1", "e2", "e3"]) {
      expect(at(l, id).h).toBe(STEP_H);
      expect(at(l, id).x).toBe(e2.x);
    }
  });

  it("a loop region encloses its children and has exactly one loop return path up its right side", () => {
    for (const [fx, loopStep] of [[contractReview, "s5"], [earnings, "s3"]] as const) {
      const m = buildRunGraph(fx);
      const group = m.groups.find((g) => g.kind === "loop" && g.stepId === loopStep)!;
      for (const w of [1100, 700, 520, 360]) {
        const l = layoutWorkflowGraph(m, w);
        const region = l.groups.find((g) => g.id === group.id)!;
        expect(region, `${loopStep} at ${w}`).toBeDefined();
        expect(region.labelLeft).toBe(group.title);
        const members = l.nodes.filter((n) => group.nodeIds.includes(n.id) || group.nodeIds.includes(m.nodes.find((x) => x.id === n.id)!.parentId ?? ""));
        expect(members.length).toBeGreaterThanOrEqual(group.nodeIds.length);
        for (const n of members) {
          expect(n.x).toBeGreaterThanOrEqual(region.x);
          expect(n.x + n.w).toBeLessThanOrEqual(region.x + region.w);
          expect(n.y).toBeGreaterThan(region.y);
          expect(n.y + n.h).toBeLessThanOrEqual(region.y + region.h);
        }
        // Nodes outside the loop stay outside the region.
        for (const n of l.nodes.filter((x) => !members.includes(x))) expect(n.y + n.h <= region.y || n.y >= region.y + region.h).toBe(true);
        const returns = l.loopReturns.filter((r) => r.groupId === group.id);
        expect(returns).toHaveLength(1);
        const pts = points(returns[0].path);
        const first = at(l, group.nodeIds[0]);
        const last = at(l, group.nodeIds.at(-1)!);
        // Starts at the last child, ends at the first child's right edge.
        expect(pts[0][0]).toBe(last.x + last.w);
        expect(pts.at(-1)![0]).toBe(first.x + first.w);
        // Its vertical run goes up, right of every member, inside the region.
        const rises = pts.slice(1).map((p, i) => [pts[i], p] as const).filter(([a, b]) => a[0] === b[0] && b[1] < a[1]);
        expect(rises).toHaveLength(1);
        const rx = rises[0][0][0];
        for (const n of members) expect(rx).toBeGreaterThan(n.x + n.w);
        expect(rx).toBeLessThan(region.x + region.w);
      }
    }
    // A loop label names its pass.
    const l = layoutWorkflowGraph(buildRunGraph(earnings), 1100);
    expect(l.groups[0].labelRight).toBe("pass 2 of 3");
    const s = layoutWorkflowGraph(buildStaticGraph(buildStaticOverviewWithLoop()), 1100);
    expect(s.groups[0].labelRight).toBe("up to 3 passes");
  });

  it("edges are orthogonal (every path segment is horizontal or vertical) and the edge into a running node is live", () => {
    for (const fx of [evaluation, contractReview, earnings, logWatch]) {
      const m = buildRunGraph(fx);
      for (const w of [1100, 700, 520, 360]) {
        const l = layoutWorkflowGraph(m, w);
        for (const e of [...l.edges.map((x) => x.path), ...l.loopReturns.map((x) => x.path)]) {
          expect(e).toMatch(/^M\S+ \S+( [HV]\S+)*$/);
          points(e);
        }
        const running = new Set(m.nodes.filter((n) => n.state === "running").map((n) => n.id));
        for (const e of l.edges) expect(e.live, `${e.from} -> ${e.to}`).toBe(running.has(e.to));
        // Every spine node but the first has an edge in.
        for (const id of spineIds(m).slice(1)) expect(l.edges.some((e) => e.to === id), id).toBe(true);
      }
    }
    const l = layoutWorkflowGraph(buildRunGraph(contractReview), 1000);
    expect(l.edges.find((e) => e.to === "s5.2")!.live).toBe(true);
    // A shared trunk: every agent of the fan-out has an edge in from its step and one out to the next node.
    const m = buildRunGraph(evaluation);
    const le = layoutWorkflowGraph(m, 1000);
    for (const id of agentIds(m, "e2")) {
      expect(le.edges.filter((e) => e.from === "e2" && e.to === id)).toHaveLength(1);
      expect(le.edges.filter((e) => e.from === id && e.to === "e3")).toHaveLength(1);
    }
    expect(le.edges.some((e) => e.from === "e2" && e.to === "e3")).toBe(false);
  });

  it("height grows with content; nodes keep their real size at every width (never scaled)", () => {
    for (const w of [1100, 700, 520, 360]) {
      const short = layoutWorkflowGraph(buildStaticGraph(actions(3)), w);
      const long = layoutWorkflowGraph(buildStaticGraph(actions(9)), w);
      expect(long.height).toBeGreaterThan(short.height);
      expect(long.width).toBe(w);
    }
    const m = buildRunGraph(evaluation);
    for (const w of [600, 700, 1100, 1600]) {
      const l = layoutWorkflowGraph(m, w);
      for (const id of spineIds(m)) expect([at(l, id).w, at(l, id).h]).toEqual([STEP_W, STEP_H]);
      for (const id of agentIds(m, "e2")) expect(at(l, id).h).toBe(AGENT_H);
    }
  });
});

/** An outer loop whose only child is an inner loop with steps (valid: two levels of nesting). */
function nestedOnlyChild(): OverviewStep[] {
  return [
    { id: "s1", title: "Gather", detail: "", kind: "action" },
    {
      id: "s2", title: "Outer", detail: "", kind: "loop", maxPasses: 2,
      children: [{
        id: "s2.1", title: "Inner", detail: "", kind: "loop", maxPasses: 3,
        children: [
          { id: "a", title: "Draft", detail: "", kind: "action" },
          { id: "b", title: "Review", detail: "", kind: "action", agents: [{ name: "R1", role: "" }, { name: "R2", role: "" }] },
        ],
      }],
    },
    { id: "s3", title: "Report", detail: "", kind: "action" },
  ];
}
/** The same, with a sibling step after the inner loop inside the outer one. */
function nestedWithSibling(): OverviewStep[] {
  const steps = nestedOnlyChild();
  steps[1].children!.push({ id: "c", title: "Decide", detail: "", kind: "action" });
  return steps;
}

describe("nested loops", () => {
  const cases = [["only child", nestedOnlyChild], ["with sibling", nestedWithSibling]] as const;
  for (const [name, fixture] of cases) {
    it(`${name}: no crash, no overlap, inner region strictly inside the outer, distinct return rails`, () => {
      const m = buildStaticGraph(fixture());
      const outerG = m.groups.find((g) => g.stepId === "s2")!;
      const innerG = m.groups.find((g) => g.stepId === "s2.1")!;
      for (const w of [1100, 700, 520, 360]) {
        const l = layoutWorkflowGraph(m, w);
        expectNoOverlapInside(l);
        const outer = l.groups.find((g) => g.id === outerG.id)!;
        const inner = l.groups.find((g) => g.id === innerG.id)!;
        expect(outer.labelLeft).toBe("Outer");
        expect(inner.labelLeft).toBe("Inner");
        expect(inner.x, `${name} ${w} left`).toBeGreaterThan(outer.x);
        expect(inner.x + inner.w, `${name} ${w} right`).toBeLessThan(outer.x + outer.w);
        expect(inner.y).toBeGreaterThan(outer.y);
        expect(inner.y + inner.h).toBeLessThan(outer.y + outer.h);
        for (const id of ["a", "b"]) {
          const n = at(l, id);
          expect(n.x).toBeGreaterThanOrEqual(inner.x);
          expect(n.x + n.w).toBeLessThanOrEqual(inner.x + inner.w);
        }
        expect(l.loopReturns).toHaveLength(2);
        const segs = (path: string) => {
          const pts = points(path);
          return pts.slice(1).map((p, i) => [pts[i], p] as const);
        };
        const ro = segs(l.loopReturns.find((r) => r.groupId === outerG.id)!.path);
        const ri = segs(l.loopReturns.find((r) => r.groupId === innerG.id)!.path);
        const rail = (s: typeof ro) => s.find(([a, b]) => a[0] === b[0])![0][0];
        expect(rail(ro)).toBeGreaterThan(rail(ri));
        expect(rail(ro)).toBeLessThan(outer.x + outer.w);
        expect(rail(ri)).toBeLessThan(inner.x + inner.w);
        // No two segments of the two returns lie on top of each other.
        for (const [a0, a1] of ro) for (const [b0, b1] of ri) {
          const sameH = a0[1] === a1[1] && b0[1] === b1[1] && a0[1] === b0[1]
            && Math.max(Math.min(a0[0], a1[0]), Math.min(b0[0], b1[0])) < Math.min(Math.max(a0[0], a1[0]), Math.max(b0[0], b1[0]));
          const sameV = a0[0] === a1[0] && b0[0] === b1[0] && a0[0] === b0[0];
          expect(sameH || sameV, `${name} ${w}: returns coincide`).toBe(false);
        }
      }
    });
  }
});

describe("loop label on a finished run", () => {
  it("reads N passes when done, Pass N of M while live", () => {
    const m = buildRunGraph(earnings);
    expect(layoutWorkflowGraph(m, 1100).groups[0].labelRight).toBe("pass 2 of 3");
    expect(layoutWorkflowGraph(m, 1100, { done: true }).groups[0].labelRight).toBe("2 passes");
    expect(layoutWorkflowGraph(m, 360, { done: true }).groups[0].labelRight).toBe("2 passes");
    const one = { ...m, groups: m.groups.map((g) => (g.kind === "loop" ? { ...g, pass: 1 } : g)) };
    expect(layoutWorkflowGraph(one, 1100, { done: true }).groups[0].labelRight).toBe("1 pass");
  });

  it("reads Pass N (limit M) while live once a run has gone past its stated limit", () => {
    const m = buildRunGraph(earnings);
    const over = { ...m, groups: m.groups.map((g) => (g.kind === "loop" ? { ...g, pass: 4 } : g)) };
    expect(layoutWorkflowGraph(over, 1100).groups[0].labelRight).toBe("pass 4 (limit 3)");
    expect(passText(4, 3)).toBe("pass 4 (limit 3)");
    expect(passText(2, 3)).toBe("pass 2 of 3");
    expect(passText(2, null)).toBe("pass 2");
  });
});

function buildStaticOverviewWithLoop(): OverviewStep[] {
  return [
    { id: "s1", title: "Draft", detail: "", kind: "action" },
    {
      id: "s2", title: "Review until accepted", detail: "", kind: "loop", maxPasses: 3,
      children: [{ id: "s2.1", title: "Revise", detail: "", kind: "action" }, { id: "s2.2", title: "Review", detail: "", kind: "action" }],
    },
  ];
}

describe("forks", () => {
  const router: OverviewStep[] = [
    {
      id: "s1", title: "Understand the request", detail: "", kind: "decision",
      branches: [
        { when: "asks to create", then: "Create issues" },
        { when: "asks to list", then: "List issues" },
        { when: "asks to close", then: "go to Close issues" },
        { when: "asks to triage", then: "step 5" },
      ],
    },
    { id: "s2", title: "Create issues", detail: "", kind: "action" },
    { id: "s3", title: "List issues", detail: "", kind: "action" },
    { id: "s4", title: "Close issues", detail: "", kind: "action" },
    { id: "s5", title: "Triage issues", detail: "", kind: "action" },
    { id: "s6", title: "Report", detail: "", kind: "action" },
  ];
  const lanes = ["s2", "s3", "s4", "s5"];

  it("are off by default: Pulsar's graph keeps one line", () => {
    const l = layoutWorkflowGraph(buildStaticGraph(router), 900);
    expect(new Set(lanes.map((id) => at(l, id).x)).size).toBe(1);
  });

  it("draw the branches side by side in hybrid, each wired from the decision and into the join", () => {
    const l = layoutWorkflowGraph(buildStaticGraph(router), 900, { forks: true });
    expectNoOverlapInside(l);
    const ys = new Set(lanes.map((id) => at(l, id).y));
    expect(ys.size).toBe(1);
    expect(at(l, "s2").h).toBe(STEP_H);
    expect(at(l, "s6").y).toBeGreaterThan(at(l, "s2").y + STEP_H);
    for (const id of lanes) {
      expect(l.edges.some((e) => e.from === "s1" && e.to === id)).toBe(true);
      expect(l.edges.some((e) => e.from === id && e.to === "s6")).toBe(true);
    }
    expect(l.edges.some((e) => e.from === "s1" && e.to === "s6")).toBe(false);
    for (const e of l.edges) points(e.path);
  });

  it("stack the lanes under the decision on narrow widths", () => {
    for (const opts of [{}]) {
      const l = layoutWorkflowGraph(buildStaticGraph(router), 360, { forks: true, ...opts });
      expectNoOverlapInside(l);
      for (const id of lanes) expect(at(l, id).x).toBeGreaterThan(at(l, "s1").x);
      expect(l.edges.filter((e) => e.to === "s6").map((e) => e.from).sort()).toEqual(lanes);
    }
  });

  it("stay one line when the branches do not name the steps right after the decision", () => {
    const skips: OverviewStep[] = [
      { ...router[0], branches: [{ when: "a", then: "Report" }, { when: "b", then: "nothing" }] },
      ...router.slice(1),
    ];
    const gap: OverviewStep[] = [router[0], router[1], { id: "x", title: "Load the team", detail: "", kind: "action" }, ...router.slice(2)];
    for (const steps of [skips, gap]) {
      const l = layoutWorkflowGraph(buildStaticGraph(steps), 900, { forks: true });
      expect(new Set(steps.slice(1).map((s) => at(l, s.id).x)).size, steps.map((s) => s.id).join()).toBe(1);
    }
  });

  it("the last step is never a lane: the lanes join in it", () => {
    const l = layoutWorkflowGraph(buildStaticGraph(router.slice(0, 5)), 900, { forks: true });
    expect(new Set(["s2", "s3", "s4"].map((id) => at(l, id).y)).size).toBe(1);
    expect(l.edges.filter((e) => e.to === "s5").map((e) => e.from).sort()).toEqual(["s2", "s3", "s4"]);
  });

  it("a branch that skips ahead draws no lane, the rest still fork", () => {
    const steps: OverviewStep[] = [
      { ...router[0], branches: [{ when: "create", then: "Create issues" }, { when: "list", then: "List issues" }, { when: "unclear", then: "Report" }] },
      router[1], router[2], router[5],
    ];
    const l = layoutWorkflowGraph(buildStaticGraph(steps), 900, { forks: true });
    expect(at(l, "s2").y).toBe(at(l, "s3").y);
    expect(l.edges.filter((e) => e.to === "s6").map((e) => e.from).sort()).toEqual(["s2", "s3"]);
  });
});
