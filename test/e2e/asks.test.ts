import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUILT, checkHygiene, harness, type Harness } from "./harness";

type Ask = { id: string; kind: string; questions?: { question: string }[] };

describe.skipIf(!BUILT)("asks", () => {
  let h: Harness;
  beforeAll(async () => (h = await harness()));
  afterAll(async () => {
    checkHygiene(h);
    await h.stopServer();
  });
  const pending = async (id: string) => {
    for (let i = 0; i < 100; i++) {
      const { asks } = (await (await h.fetchApi(`/api/runs/${id}/asks`)).json()) as { asks: Ask[] };
      if (asks.length) return asks[0]!;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("no ask");
  };

  it("a question waits, its answer reaches claude, and the wait is counted", async () => {
    const run = await h.startRun("question");
    const ask = await pending(run.id);
    expect(ask.kind).toBe("question");
    await h.waitForStatus(run.id, "waiting");
    await new Promise((r) => setTimeout(r, 200));
    const q = ask.questions![0]!.question;
    const r = await h.fetchApi(`/api/runs/${run.id}/asks/${ask.id}/answer`, { method: "POST", body: { kind: "question", answers: { [q]: "b.txt" } } });
    expect(r.status).toBe(200);
    const done = await h.waitForStatus(run.id, "finished");
    expect(done.waitingMs as number).toBeGreaterThan(0);
  });

  it("a permission can be denied with a reason, and the run goes on", async () => {
    const run = await h.startRun("permission");
    const ask = await pending(run.id);
    expect(ask.kind).toBe("permission");
    const r = await h.fetchApi(`/api/runs/${run.id}/asks/${ask.id}/answer`, { method: "POST", body: { kind: "permission", allow: false, message: "not here" } });
    expect(r.status).toBe(200);
    await h.waitForStatus(run.id, "finished");
    const again = await h.fetchApi(`/api/runs/${run.id}/asks/${ask.id}/answer`, { method: "POST", body: { kind: "permission", allow: true } });
    expect(again.status).toBe(409);
  });
});
