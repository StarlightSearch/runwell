/** Full-size screenshots for checking the look by eye. Skipped unless RUNWELL_LOOK names a folder. */
import { join } from "node:path";
import { expect, test } from "./fixtures";

const OUT = process.env.RUNWELL_LOOK;
test.skip(!OUT, "set RUNWELL_LOOK to a folder");
test.use({ viewport: { width: 1600, height: 950 } });

test("look", async ({ app }) => {
  const page = app.page;
  await app.open("/skills");
  await expect(page.locator("tr[data-skill]").first()).toBeVisible();
  await page.locator("tr[data-skill]").nth(1).hover();
  await page.screenshot({ path: join(OUT!, "skills.png") });
  await page.goto(`${app.base}/skills/${encodeURIComponent("personal:review-loop")}`);
  await expect(page.getByTestId("skill-graph")).toBeVisible();
  await page.locator(".gnode", { hasText: "Draft" }).first().click();
  await page.screenshot({ path: join(OUT!, "skill.png") });
  await page.goto(`${app.base}/runs`);
  await expect(page.getByTestId("run-row").first()).toBeVisible();
  await page.screenshot({ path: join(OUT!, "runs.png") });
});
