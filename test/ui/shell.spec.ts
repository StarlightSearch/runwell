import { expect, test } from "./fixtures";

test("the shell loads with the sidebar, recent runs and the right theme, and no console error", async ({ app }, info) => {
  const errors: string[] = [];
  app.page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  app.page.on("pageerror", (e) => errors.push(e.message));
  await app.open("/skills");
  const side = app.page.getByRole("complementary", { name: "Sidebar" });
  for (const label of ["Skills", "Runs", "Outputs", "Settings"]) await expect(side.getByText(label, { exact: true })).toBeVisible();
  await expect(app.page.getByTestId("recent-run")).toHaveCount(4);
  await expect(app.page.getByTestId("recent-run").first()).toContainText("motion-ad #4");
  const bg = await app.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (info.project.name === "dark") expect(bg).toBe("rgb(11, 11, 12)");
  else expect(bg).not.toBe("rgb(11, 11, 12)");
  const text = await app.page.evaluate(() => document.body.innerText);
  expect(text).not.toContain("Skillrun");
  expect(text).not.toContain("Pulsar Workflows");
  expect(text).not.toContain("—");
  expect(errors).toEqual([]);
});

test("without the cookie the page says how to open Runwell", async ({ app }) => {
  await app.page.goto(`${app.base}/skills`);
  await expect(app.page.getByText("Open Runwell with /runwell in Claude Code or npx runwell in a terminal.")).toBeVisible();
});

test("the theme toggle switches and is remembered", async ({ app }) => {
  await app.open("/skills");
  const before = await app.page.evaluate(() => document.documentElement.dataset.theme);
  await app.page.getByRole("button", { name: /theme/ }).click();
  const after = await app.page.evaluate(() => document.documentElement.dataset.theme);
  expect(after).not.toBe(before);
  await app.page.reload();
  expect(await app.page.evaluate(() => document.documentElement.dataset.theme)).toBe(after);
});
