/**
 * Captures the README's screenshots and the frames of its animation, at 2x. Skipped unless WORKFLOWS_CAPTURE
 * names a folder: `WORKFLOWS_CAPTURE=/tmp/shots npx playwright test test/ui/assets.spec.ts --project=dark`.
 * The animation is an animated WebP (sharp, small, no 256-colour limit), made from the frames with:
 * `ffmpeg -framerate 2.5 -i /tmp/shots/frames/%04d.png -c:v libwebp_anim -quality 88 -compression_level 6 -loop 0 docs/assets/workflows.webp`
 * (copy the last frame a few times first, so the finished run holds for a moment).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./fixtures";

const OUT = process.env.WORKFLOWS_CAPTURE;
test.skip(!OUT, "set WORKFLOWS_CAPTURE to a folder to capture the README assets");
// Live times in the screenshots, not the recorded fixture's.
if (OUT) process.env.FAKE_CLAUDE_NOW = "1";
// 2x, so the README stays sharp on high-density screens.
test.use({ fakeFixture: "subagents-slow", viewport: { width: 1280, height: 780 }, deviceScaleFactor: 2 });

test("capture", async ({ app }) => {
  test.setTimeout(120_000);
  mkdirSync(join(OUT!, "frames"), { recursive: true });
  const page = app.page;
  await app.open("/skills");
  await expect(page.locator("tr[data-skill]").first()).toBeVisible();
  await page.screenshot({ path: join(OUT!, "skills.png") });

  const { run } = await app.api<{ run: { id: string } }>("/api/runs", { method: "POST", body: { skillKey: "personal:motion-ad", brief: "A short ad for the Lumen 2 spring launch", place: { kind: "folder" } } });
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
  // The delivered video, loaded, so the shot shows its first frame and no loading spinner.
  await page.waitForFunction(() => (document.querySelector("video")?.readyState ?? 0) >= 4);
  await page.evaluate(async () => {
    const v = document.querySelector("video")!;
    v.currentTime = 0.05;
    await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
    // Headless Chromium keeps its loading ring over a loaded video; the shot shows the frame without it.
    v.controls = false;
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT!, "run-past.png") });
});
