import { expect, test } from "./fixtures";
import { SEED_SESSION } from "./seed";

test("a finished run offers Continue in Claude: copy the command, open a terminal, and Desktop only where Claude Code supports it", async ({ app, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await app.open(`/runs/${app.seeded.runIds.video}`);
  const page = app.page;
  await page.getByRole("button", { name: /Continue in Claude/ }).click();
  await page.getByRole("menuitem", { name: /Copy command/ }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toMatch(new RegExp(`^cd '.+' && claude --resume ${SEED_SESSION}$`));

  await page.getByRole("button", { name: /Continue in Claude/ }).click();
  const desktop = page.getByRole("menuitem", { name: /Open in Claude Desktop/ });
  if (process.platform === "linux") await expect(desktop).toBeDisabled();
  else await expect(desktop).toBeEnabled();

  await page.getByRole("menuitem", { name: /Open in a terminal/ }).click();
  await expect(page.getByTestId("continue-note")).toHaveText("Opened in a terminal.");
  expect(app.launched.at(-1)!.args.join(" ")).toContain(`--resume ${SEED_SESSION}`);
});

test("a run with no Claude session has no Continue button", async ({ app }) => {
  await app.open(`/runs/${app.seeded.runIds.second}`);
  await expect(app.page.getByRole("button", { name: "Run again" })).toBeVisible();
  await expect(app.page.getByRole("button", { name: /Continue in Claude/ })).toHaveCount(0);
});
