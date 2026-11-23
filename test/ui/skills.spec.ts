import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./fixtures";

test("seeded skills render with their source, the warning and the rating", async ({ app }) => {
  await app.open("/skills");
  const row = (ref: string) => app.page.locator(`tr[data-skill="${ref}"]`);
  await expect(row("motion-ad").locator(".src")).toHaveText("Personal");
  await expect(row("toolkit:lint").locator(".src")).toHaveText(/plugin\s*toolkit/i);
  await expect(row("deploy").locator(".src")).toHaveText("website");
  // A project's skills carry that project's own colour, the same one its sidebar entry has.
  const dot = await row("deploy").locator(".pdot").evaluate((e) => getComputedStyle(e).backgroundColor);
  const side = await app.page.getByRole("complementary", { name: "Sidebar" }).locator("a", { hasText: "website" }).locator(".pdot").evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(dot).toBe(side);
  await expect(row("broken").locator(".warn-mark")).toHaveAttribute("title", "Could not read this skill's header");
  await expect(row("motion-ad")).toContainText("67% of 3");
});

test("the Plugins chip filters", async ({ app }) => {
  await app.open("/skills");
  await app.page.getByRole("button", { name: /^Plugins/ }).click();
  await expect(app.page.locator("tbody tr")).toHaveCount(2);
  await expect(app.page.locator('tr[data-skill="motion-ad"]')).toHaveCount(0);
});

test("Don't track hides the skill and writes its ref to config.json", async ({ app }) => {
  await app.open("/skills");
  await app.page.getByRole("button", { name: "More for deploy" }).click();
  await app.page.getByRole("menuitem", { name: "Don't track" }).click();
  await expect(app.page.locator('tr[data-skill="deploy"]')).toHaveCount(0);
  await app.page.getByLabel("Hide ignored").uncheck();
  const row = app.page.locator('tr[data-skill="deploy"]');
  await expect(row).toHaveClass(/ignored/);
  await expect(row).toContainText("ignored");
  expect(JSON.parse(readFileSync(join(app.seeded.home, "config.json"), "utf8")).ignored).toContain("deploy");
});

test("editing a SKILL.md updates the row without a reload", async ({ app }) => {
  await app.open("/skills");
  const file = join(app.seeded.claudeHome, "skills/motion-ad/SKILL.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("Makes short motion-graphics video ads.", "Now makes vertical ads too."));
  await expect(app.page.locator('tr[data-skill="motion-ad"]')).toContainText("Now makes vertical ads too.", { timeout: 3000 });
});

test("By source groups skills under projects and marketplaces; a whole plugin or marketplace can be left untracked", async ({ app }) => {
  await app.open("/skills");
  const page = app.page;
  await page.getByRole("button", { name: "By source" }).click();
  await expect(page).toHaveURL(/group=source/);
  await expect(page.locator('tr[data-group="personal"]')).toContainText("3 skills");
  await expect(page.locator('tr[data-group="market:mkt"]')).toContainText("2 skills");
  // Groups start closed: headers only, and a marketplace's plugins appear when it is opened.
  await expect(page.locator("tr[data-skill]")).toHaveCount(0);
  const plugin = page.locator('tr[data-group="plugin:toolkit"]');
  await expect(plugin).toHaveCount(0);
  await page.locator('tr[data-group="market:mkt"]').click();
  await expect(plugin).toContainText("toolkit");
  await plugin.click();
  await expect(page.locator("tr[data-skill^='toolkit:']")).toHaveCount(2);
  await page.locator('tr[data-group="personal"]').click();
  await expect(page.locator('tr[data-skill="motion-ad"]')).toBeVisible();
  await plugin.getByRole("button", { name: "Don't track plugin toolkit" }).click();
  await expect(plugin).toContainText("not tracked");
  await expect(page.locator("tr[data-skill^='toolkit:']")).toHaveCount(0);
  expect(JSON.parse(readFileSync(join(app.seeded.home, "config.json"), "utf8")).ignored).toContain("toolkit:*");
  await plugin.getByRole("button", { name: "Track plugin toolkit again" }).click();
  await expect(page.locator("tr[data-skill^='toolkit:']")).toHaveCount(2);

  const market = page.locator('tr[data-group="market:mkt"]');
  await market.getByRole("button", { name: "Don't track marketplace mkt" }).click();
  await expect(plugin).toContainText("not tracked (marketplace)");
  await expect(plugin.locator(".grp-btn")).toHaveCount(0);
  await expect(page.locator("tr[data-skill^='toolkit:']")).toHaveCount(0);
  expect(JSON.parse(readFileSync(join(app.seeded.home, "config.json"), "utf8")).ignored).toContain("@mkt");
});

test("the With a graph chip explains itself", async ({ app }) => {
  await app.open("/skills");
  await expect(app.page.getByRole("button", { name: /^With a graph/ })).toHaveAttribute("title", /workflow map .* drawn/);
});
