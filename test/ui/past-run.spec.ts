import { expect, test } from "./fixtures";

test("a finished run opens on Run: the video first, the png under Other files", async ({ app }) => {
  await app.open(`/runs/${app.seeded.runIds.video}`);
  const page = app.page;
  await expect(page.getByRole("tab", { name: "Run", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("delivered").locator("video").first()).toBeVisible();
  await expect(page.getByTestId("delivered").locator(".deliv-head")).toContainText("ad-9x16.mp4");
  await expect(page.getByTestId("other-files")).toContainText("poster.png");
  await expect(page.locator(".pill")).toHaveText("Finished");
  const meta = page.getByTestId("place-line").locator("li");
  await expect(meta).toHaveText([/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/, "6m 40s", "Run button", "New run folder", "v1"]);
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("Improve");
  expect(body).not.toContain("Export");
});

test("rating toggles and survives a reload; a note is saved on blur", async ({ app }) => {
  await app.open(`/runs/${app.seeded.runIds.failed}`);
  const page = app.page;
  await expect(page.getByTestId("run-error")).toContainText("Claude stopped without finishing");
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await expect(page.getByRole("button", { name: "Good", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Note").fill("the music was too loud");
  await page.getByLabel("Note").blur();
  await expect.poll(async () => (await app.api<{ run: { note: string | null } }>(`/api/runs/${app.seeded.runIds.failed}`)).run.note).toBe("the music was too loud");
  await page.reload();
  await expect(page.getByRole("button", { name: "Good", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Note")).toHaveValue("the music was too loud");
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await expect(page.getByRole("button", { name: "Good", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await app.api<{ run: { rating: number | null } }>(`/api/runs/${app.seeded.runIds.failed}`)).run.rating).toBeNull();
});

test("a history run reads 'Chat in', is tagged not installed and has no Run again", async ({ app }) => {
  await app.open(`/runs/${app.seeded.runIds.history}`);
  await expect(app.page.getByTestId("place-line")).toContainText("Chat in website");
  await expect(app.page.getByTestId("not-installed")).toBeVisible();
  await expect(app.page.getByRole("button", { name: "Run again" })).toHaveCount(0);
  await expect(app.page.getByTestId("delivered")).toContainText("This run kept no files.");
});

test("How it went shows the loop; Replay at 0 has every node waiting and at the end matches the graph", async ({ app }) => {
  await app.open(`/runs/${app.seeded.runIds.loop}`);
  const page = app.page;
  await expect(page.getByTestId("run-brief")).toContainText("Review the launch post");
  await expect(page.getByTestId("segment").filter({ hasText: "↻ ×2" })).toHaveCount(1);
  await page.getByRole("tab", { name: "Graph" }).click();
  const states = async () => page.locator(".gnode").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-node")}:${e.getAttribute("data-state")}`));
  const finalStates = await states();
  await page.getByRole("tab", { name: "Run", exact: true }).click();
  await page.getByRole("button", { name: "Replay" }).click();
  await expect(page.getByTestId("replay")).toBeVisible();
  const nodes = page.locator(".gnode");
  await expect(nodes.first()).toBeVisible();
  for (const s of await nodes.evaluateAll((els) => els.map((e) => e.getAttribute("data-state")))) expect(s).toBe("waiting");
  await page.getByLabel("Replay position").fill(String(14));
  await expect.poll(states).toEqual(finalStates);
});

test("Run again opens the dialog with the old brief; Delete run asks first and returns to Runs", async ({ app }) => {
  await app.open(`/runs/${app.seeded.runIds.second}`);
  const page = app.page;
  await page.getByRole("button", { name: "Run again" }).click();
  await expect(page.getByLabel("Brief")).toHaveValue("Ad number 2 for pulsarbot.cloud");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More" }).click();
  let asked = false;
  page.once("dialog", (d) => ((asked = true), void d.accept()));
  await page.getByRole("menuitem", { name: "Delete run" }).click();
  await expect(page).toHaveURL(/\/runs$/);
  expect(asked).toBe(true);
  const r = await fetch(`${app.base}/api/runs/${app.seeded.runIds.second}`, { headers: { authorization: `Bearer ${app.token}` } });
  expect(r.status).toBe(404);
});

test("Open folder opens the run folder, the project for a chat run, and says so when the folder is gone", async ({ app }) => {
  const { join } = await import("node:path");
  const { rmSync } = await import("node:fs");
  const page = app.page;
  await app.open(`/runs/${app.seeded.runIds.video}`);
  await page.getByRole("button", { name: "Open folder" }).click();
  await expect.poll(() => app.revealed.at(-1)).toBe(join(app.seeded.home, "runs", app.seeded.runIds.video, "work"));

  await page.goto(`${app.base}/runs/${app.seeded.runIds.history}`);
  await page.getByRole("button", { name: "Open folder" }).click();
  await expect.poll(() => app.revealed.at(-1)).toBe(app.seeded.trusted);

  rmSync(join(app.seeded.home, "runs", app.seeded.runIds.third, "work"), { recursive: true, force: true });
  await page.goto(`${app.base}/runs/${app.seeded.runIds.third}`);
  const before = app.revealed.length;
  await page.getByRole("button", { name: "Open folder" }).click();
  await expect(page.getByTestId("folder-note")).toHaveText("This run's folder no longer exists.");
  expect(app.revealed.length).toBe(before);
});

test("a run with no kept files offers Look again, which asks the server to collect them again", async ({ app }) => {
  await app.open(`/runs/${app.seeded.runIds.failed}`);
  const page = app.page;
  const rescan = page.waitForRequest((r) => r.url().endsWith(`/api/runs/${app.seeded.runIds.failed}/outputs/rescan`) && r.method() === "POST");
  await page.getByTestId("delivered").getByRole("button", { name: "Look again" }).click();
  expect((await (await rescan).response())?.status()).toBe(200);
  await expect(page.getByTestId("delivered")).toContainText("This run kept no files.");
});
