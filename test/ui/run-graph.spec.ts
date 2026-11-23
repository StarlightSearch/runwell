import { expect, test } from "./fixtures";

async function startRun(app: { api<T>(p: string, i?: { method?: string; body?: unknown }): Promise<T> }) {
  const r = await app.api<{ run: { id: string } }>("/api/runs", { method: "POST", body: { skillKey: "personal:motion-ad", brief: "make it", place: { kind: "folder" } } });
  return r.run.id;
}

test.describe("live graph", () => {
  test.use({ fakeFixture: "subagents-slow" });

  test("steps down a spine; two agents side by side while step 2 runs; nodes turn done live; the panel shows an agent", async ({ app }, info) => {
    const id = await startRun(app);
    await app.open(`/runs/${id}`);
    const page = app.page;
    await expect(page.getByTestId("progress")).toContainText("2 agents running");
    await expect(page.getByTestId("progress")).toContainText(/Step 2 of 2/);
    const agents = page.locator(".gnode.agent.state-running");
    await expect(agents).toHaveCount(2);
    await expect(page.locator(".gnode.agent.state-waiting")).toContainText("Frame renderer");
    const [a, b] = [await agents.nth(0).boundingBox(), await agents.nth(1).boundingBox()];
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(4);
    const s2 = await page.locator('.gnode[data-node="s2"]').boundingBox();
    expect(a!.y).toBeGreaterThan(s2!.y);
    await expect(page.locator('.gnode[data-node="s1"]')).toHaveAttribute("data-state", "done");
    await expect(page.locator('.gnode[data-node="s2"]')).toHaveAttribute("data-state", "running");
    await page.locator(".graph").screenshot({ path: `test-results/graph-${info.project.name}.png` });
    await page.locator(".gnode.agent", { hasText: "Count words" }).click();
    await expect(page.getByTestId("node-panel")).toContainText("Count words in a.txt and b.txt");
    await expect(page.getByTestId("node-panel")).toContainText("wc -w");
    await expect(page.locator('.gnode[data-node="s2"]')).toHaveAttribute("data-state", "done", { timeout: 15_000 });
    await expect(page.locator(".pill")).toHaveText(/Finished/, { timeout: 15_000 });
  });

  test("Stop asks first and ends the run as Stopped", async ({ app }) => {
    const id = await startRun(app);
    await app.open(`/runs/${id}`);
    await expect(app.page.locator(".pill")).toHaveText(/Running/);
    app.page.once("dialog", (d) => void d.accept());
    await app.page.getByRole("button", { name: "Stop" }).click();
    await expect(app.page.locator(".pill")).toHaveText(/Stopped/, { timeout: 10_000 });
  });
});

test("a loop run shows its region with the pass count", async ({ app }) => {
  await app.open(`/runs/${app.seeded.runIds.loop}`);
  await expect(app.page.getByTestId("loop-region")).toContainText("2 passes");
  await expect(app.page.getByTestId("loop-region")).toContainText("Draft and review");
});

test.describe("failed run", () => {
  test.use({ fakeFixture: "failure" });
  test("shows Failed and the error", async ({ app }) => {
    const id = await startRun(app);
    await app.open(`/runs/${id}`);
    await expect(app.page.locator(".pill")).toHaveText(/Failed/, { timeout: 10_000 });
    await expect(app.page.getByTestId("run-error")).not.toBeEmpty();
  });
});
