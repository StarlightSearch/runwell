import { expect, test } from "./fixtures";

test("a skill's page shows its workflow graph and a step's detail, and its runs in a tab", async ({ app }) => {
  await app.open("/skills");
  const page = app.page;
  await page.locator("tr[data-skill='review-loop']").getByRole("link", { name: "review-loop" }).click();
  await expect(page).toHaveURL(/\/skills\/personal%3Areview-loop$/);
  await expect(page.getByTestId("skill-stats")).toContainText("1 run");
  const graph = page.getByTestId("skill-graph");
  await expect(graph.getByTestId("loop-region")).toContainText("Draft and review");
  for (const s of await graph.locator(".gnode").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")))) expect(s).toBe("waiting");
  await graph.locator(".gnode", { hasText: "Read the brief" }).click();
  await expect(page.getByTestId("step-detail")).toHaveText("Read it.");
  await page.getByRole("tab", { name: "Runs · 1" }).click();
  await expect(page).toHaveURL(/\?tab=runs$/);
  await expect(page.getByTestId("skill-graph")).toHaveCount(0);
  const rows = page.getByTestId("run-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Review the launch post");
  await rows.first().click();
  await expect(page).toHaveURL(new RegExp(`/runs/${app.seeded.runIds.loop}$`));
  await page.locator(".crumb").getByRole("link", { name: "review-loop" }).click();
  await expect(page).toHaveURL(/\/skills\/personal%3Areview-loop$/);
});

test("a skill with no workflow map offers to draw one and says it uses Claude Code usage", async ({ app }) => {
  await app.open(`/skills/${encodeURIComponent("project:" + app.seeded.trusted + ":deploy")}`);
  const skills = await app.api<{ skills: { key: string; name: string }[] }>("/api/skills");
  const deploy = skills.skills.find((s) => s.name === "deploy")!;
  await app.open(`/skills/${encodeURIComponent(deploy.key)}`);
  await expect(app.page.getByTestId("no-workflow")).toContainText("uses your Claude Code usage");
  await expect(app.page.getByRole("button", { name: "Draw the workflow" })).toBeVisible();
  await expect(app.page.getByTestId("runs-table")).toHaveCount(0);
});

test("Enter on a focused skill row opens its page; R still opens the Run dialog", async ({ app }) => {
  await app.open("/skills");
  await expect(app.page.locator("tr[data-skill]").first()).toBeVisible();
  await app.page.keyboard.press("r");
  await expect(app.page.getByRole("dialog")).toBeVisible();
  await app.page.keyboard.press("Escape");
  await app.page.keyboard.press("Enter");
  await expect(app.page).toHaveURL(/\/skills\/.+/);
});
