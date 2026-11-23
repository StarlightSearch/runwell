import { expect, test } from "./fixtures";

test("Ctrl+K finds a skill and Enter opens its Run dialog; esc closes; r in the brief opens nothing", async ({ app }) => {
  await app.open("/runs");
  const page = app.page;
  await expect(page.getByTestId("run-row").first()).toBeVisible();
  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Search" });
  await expect(palette).toBeVisible();
  await page.keyboard.type("review-lo");
  await expect(palette.getByRole("option").first()).toContainText("review-loop");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Run review-loop" });
  await expect(dialog).toBeVisible();
  await page.getByLabel("Brief").type("run the review");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Ctrl+K finds a run by its brief and opens it", async ({ app }) => {
  await app.open("/skills");
  await app.page.keyboard.press("Control+K");
  await app.page.keyboard.type("launch post");
  await expect(app.page.getByRole("option").first()).toContainText("review-loop #1");
  await app.page.keyboard.press("Enter");
  await expect(app.page).toHaveURL(new RegExp(`/runs/${app.seeded.runIds.loop}$`));
});

test("g then o goes to Outputs, g then r to Runs; ? lists the keys; arrows and Enter open a run", async ({ app }) => {
  await app.open("/skills");
  const page = app.page;
  await expect(page.locator("tr[data-skill]").first()).toBeVisible();
  await page.keyboard.press("g");
  await page.keyboard.press("o");
  await expect(page).toHaveURL(/\/outputs$/);
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toContainText("Go to Outputs");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("g");
  await page.keyboard.press("r");
  await expect(page).toHaveURL(/\/runs$/);
  await expect(page.getByTestId("run-row").first()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/runs/${app.seeded.runIds.third}$`));
  await page.keyboard.press("r");
  await expect(page.getByRole("dialog", { name: "Pick a skill to run" })).toBeVisible();
});
