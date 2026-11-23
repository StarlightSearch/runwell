import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUILT, checkHygiene, harness, type Harness } from "./harness";

describe.skipIf(!BUILT)("failure and stop", () => {
  let h: Harness;
  beforeAll(async () => (h = await harness()));
  afterAll(async () => {
    checkHygiene(h);
    await h.stopServer();
  });

  it("a failing run ends failed with its error", async () => {
    const run = await h.startRun("failure");
    const r = await h.waitForStatus(run.id, "failed");
    expect(String(r.error)).not.toBe("");
  });

  it("stop ends a run as stopped", async () => {
    const run = await h.startRun("slow");
    await h.waitForStatus(run.id, "running");
    await h.fetchApi(`/api/runs/${run.id}/stop`, { method: "POST" });
    await h.waitForStatus(run.id, "stopped", 5000);
  });

  it("a claude that ignores the interrupt is killed within the grace period", async () => {
    const run = await h.startRun("slow", { flags: ["ignore-sigint"] });
    await h.waitForStatus(run.id, "running");
    const t = Date.now();
    await h.fetchApi(`/api/runs/${run.id}/stop`, { method: "POST" });
    await h.waitForStatus(run.id, "stopped", 9000);
    expect(Date.now() - t).toBeLessThan(8000);
  }, 15_000);
});
