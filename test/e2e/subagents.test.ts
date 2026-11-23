import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunEvent } from "../../src/shared/events";
import { graphOf } from "../../src/shared/graph/from-events";
import { BUILT, checkHygiene, harness, readEvents, type Harness } from "./harness";

describe.skipIf(!BUILT)("subagents", () => {
  let h: Harness;
  beforeAll(async () => (h = await harness()));
  afterAll(async () => {
    checkHygiene(h);
    await h.stopServer();
  });

  it("the stored run draws the three parallel agents under step 1, where they ran", async () => {
    const run = await h.startRun("subagents");
    await h.waitForStatus(run.id, "finished");
    const events = (await readEvents(h, run.id)) as unknown as RunEvent[];
    const detail = (await (await h.fetchApi(`/api/runs/${run.id}`)).json()) as { workflow: { steps: never[] | null } };
    const model = graphOf(events, detail.workflow.steps, false);
    const ran = model.nodes.filter((n) => n.kind === "agent" && n.detail.startedAt);
    expect(ran).toHaveLength(3);
    expect(new Set(ran.map((n) => n.parentId))).toEqual(new Set(["s1"]));
  });
});
