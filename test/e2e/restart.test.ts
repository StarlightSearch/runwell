import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alive, BUILT, checkHygiene, harness, readEvents, type Harness } from "./harness";

describe.skipIf(!BUILT)("restart", () => {
  let h: Harness;
  beforeAll(async () => (h = await harness()));
  afterAll(async () => {
    checkHygiene(h);
    await h.stopServer();
  });

  it("a server killed mid-run comes back with the run failed, its events kept and its claude gone", async () => {
    const run = await h.startRun("slow", { flags: ["ignore-sigint"] });
    await h.waitForStatus(run.id, "running");
    let fakePid = 0;
    for (let i = 0; i < 50 && !fakePid; i++) {
      await new Promise((res) => setTimeout(res, 100));
      try {
        fakePid = Number(readFileSync(h.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.pid).at(-1)?.pid ?? 0);
      } catch {
        /* not written yet */
      }
    }
    expect(fakePid).toBeGreaterThan(0);
    await h.stopServer("SIGKILL");
    await h.restartServer();
    const r = await h.waitForStatus(run.id, "failed", 5000);
    expect(r.error).toBe("Workflows restarted during this run");
    const after = await readEvents(h, run.id);
    expect(after.some((e) => e.t === "status" && e.status === "running")).toBe(true);
    expect(after.at(-1)).toMatchObject({ t: "status", status: "failed" });
    const end = Date.now() + 3000;
    while (alive(fakePid) && Date.now() < end) await new Promise((res) => setTimeout(res, 100));
    expect(alive(fakePid)).toBe(false);
  }, 20_000);
});
