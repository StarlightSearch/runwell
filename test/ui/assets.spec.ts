/**
 * Captures the README's screenshots and the frames of its GIF. Skipped unless RUNWELL_CAPTURE names a
 * folder: `RUNWELL_CAPTURE=/tmp/shots npx playwright test test/ui/assets.spec.ts --project=dark`.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./fixtures";

const OUT = process.env.RUNWELL_CAPTURE;
test.skip(!OUT, "set RUNWELL_CAPTURE to a folder to capture the README assets");
// Live times in the screenshots, not the recorded fixture's.
if (OUT) process.env.FAKE_CLAUDE_NOW = "1";
test.use({ fakeFixture: "subagents-slow", viewport: { width: 1280, height: 780 } });

test("capture", async ({ app }) => {
  test.setTimeout(120_000);
  mkdirSync(join(OUT!, "frames"), { recursive: true });
  const page = app.page;
  await app.open("/skills");
  await expect(page.locator("tr[data-skill]").first()).toBeVisible();
  await page.screenshot({ path: join(OUT!, "skills.png") });

  const { run } = await app.api<{ run: { id: string } }>("/api/runs", { method: "POST", body: { skillKey: "personal:motion-ad", brief: "A 15 second ad for the spring launch", place: { kind: "folder" } } });
  await page.goto(`${app.base}/runs/${run.id}`);
  let i = 0;
  let shotLive = false;
  const end = Date.now() + 40_000;
  while (Date.now() < end) {
    await page.screenshot({ path: join(OUT!, "frames", `${String(i++).padStart(4, "0")}.png`) });
    if (!shotLive && (await page.locator(".gnode.agent.state-running").count()) >= 2) {
      await page.screenshot({ path: join(OUT!, "run-live.png") });
      shotLive = true;
    }
    if (/Finished/.test((await page.locator(".pill").textContent()) ?? "")) break;
    await page.waitForTimeout(250);
  }
  for (let k = 0; k < 8; k++) await page.screenshot({ path: join(OUT!, "frames", `${String(i++).padStart(4, "0")}.png`) });
  await page.reload();
  await expect(page.getByTestId("how-it-went")).toBeVisible();
  await page.screenshot({ path: join(OUT!, "run-past.png") });
});
