import { expect, test } from "./fixtures";

test("the runs list shows seeded runs newest first, only the failed one marked, in red", async ({ app }) => {
  await app.open("/runs");
  const rows = app.page.getByTestId("run-row");
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(0)).toContainText("motion-ad #4");
  await expect(rows.nth(0)).toHaveAttribute("data-status", "failed");
  // Only runs that need a look are labelled: the failed one says so in red, a finished one is plain.
  await expect(rows.nth(0).locator(".run-state")).toHaveText("failed");
  const red = await rows.nth(0).locator(".run-state").evaluate((e) => getComputedStyle(e).color);
  expect(red).not.toBe(await rows.nth(0).locator("td").nth(1).evaluate((e) => getComputedStyle(e).color));
  await expect(rows.nth(1).locator(".run-state")).toHaveCount(0);
  await expect(rows.nth(1)).toContainText("motion-ad #3");
  await expect(rows.nth(1)).toContainText("👎");
  await expect(rows.filter({ hasText: "old-skill" })).toContainText("chat in website");
  await expect(rows.nth(0).locator("td").nth(3)).toHaveAttribute("title", /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  await app.page.getByRole("button", { name: /^From chat/ }).click();
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  await expect(app.page).toHaveURL(new RegExp(`/runs/${app.seeded.runIds.history}$`));
});

test.describe("live", () => {
  test.use({ fakeFixture: "slow" });
  test("the Live filter shows a run started in the test, and it leaves when it ends", async ({ app }) => {
    await app.open("/runs");
    await app.page.getByRole("button", { name: /^Live/ }).click();
    await expect(app.page.getByTestId("run-row")).toHaveCount(0);
    const { run } = await app.api<{ run: { id: string } }>("/api/runs", { method: "POST", body: { skillKey: "personal:motion-ad", brief: "live one", place: { kind: "folder" } } });
    await expect(app.page.getByTestId("run-row")).toHaveCount(1);
    await expect(app.page.getByTestId("run-row")).toContainText("live one");
    await app.api(`/api/runs/${run.id}/stop`, { method: "POST" });
    await expect(app.page.getByTestId("run-row")).toHaveCount(0, { timeout: 10_000 });
  });
});
