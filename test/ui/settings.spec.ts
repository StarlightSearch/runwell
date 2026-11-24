import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./fixtures";

const bytesOf = (s: string) => {
  const m = /· ([\d.]+) (B|KB|MB|GB)$/.exec(s.trim());
  if (!m) return -1;
  return Number(m[1]) * { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[m[2] as "B"];
};

test("folders show found; a missing Claude folder is refused and the old value stays", async ({ app }) => {
  await app.open("/settings");
  const row = app.page.getByTestId("folder-claudeHome");
  await expect(row).toContainText(app.seeded.claudeHome);
  await expect(row.locator(".found")).toHaveText("found");
  await expect(app.page.getByTestId("folder-nodePath").locator(".found")).toHaveText("found");
  await row.getByRole("button", { name: "Edit" }).click();
  await row.getByLabel("Claude's folder path").fill("/nowhere/at/all");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText("That folder does not exist.");
  const cfg = JSON.parse(readFileSync(join(app.seeded.home, "config.json"), "utf8"));
  expect(cfg.claudeHome).toBe(app.seeded.claudeHome);
});

test("ignoring toolkit:* hides those skills on the Skills page, and shows them dimmed when asked", async ({ app }) => {
  await app.open("/settings");
  await app.page.getByLabel("Add an ignored skill").fill("toolkit:*");
  await app.page.getByRole("button", { name: "Add" }).click();
  await expect(app.page.getByTestId("ignored-list")).toContainText("toolkit:*");
  await app.page.getByRole("complementary", { name: "Sidebar" }).getByText("Skills", { exact: true }).click();
  await expect(app.page.locator("tr[data-skill='motion-ad']")).toBeVisible();
  await expect(app.page.locator("tr[data-skill^='toolkit:']")).toHaveCount(0);
  await app.page.getByLabel("Hide ignored").uncheck();
  const rows = app.page.locator("tr[data-skill^='toolkit:']");
  await expect(rows).toHaveCount(2);
  for (const cls of await rows.evaluateAll((els) => els.map((e) => e.className))) expect(cls).toContain("ignored");
  await expect(app.page.locator("tr[data-skill='motion-ad']")).not.toHaveClass(/ignored/);
});

test("changing the port shows the restart line and config.json holds it", async ({ app }) => {
  await app.open("/settings");
  await app.page.getByLabel("Port").fill("4999");
  await app.page.getByRole("button", { name: "Save" }).click();
  await expect(app.page.getByTestId("restart-line")).toHaveText("Takes effect the next time Workflows starts.");
  expect(JSON.parse(readFileSync(join(app.seeded.home, "config.json"), "utf8")).port).toBe(4999);
});

test("Delete runs for one skill removes only that skill's runs, and the size shrinks", async ({ app }) => {
  const loopDir = join(app.seeded.home, "runs", app.seeded.runIds.loop);
  writeFileSync(join(loopDir, "big.bin"), Buffer.alloc(400_000));
  await app.open("/settings");
  const before = bytesOf(await app.page.getByTestId("data-size").innerText());
  await app.page.getByRole("button", { name: "Delete runs…" }).click();
  const dlg = app.page.getByRole("dialog", { name: "Delete runs" });
  await dlg.getByLabel("Which runs").selectOption({ label: "Runs of review-loop" });
  await expect(dlg.getByTestId("delete-count")).toContainText("1 run will be deleted");
  await expect(dlg.getByRole("button", { name: "Delete" })).toBeDisabled();
  await dlg.getByLabel("Type DELETE to confirm").fill("DELETE");
  await dlg.getByRole("button", { name: "Delete" }).click();
  await expect(app.page.getByText("1 run deleted.")).toBeVisible();
  expect(existsSync(loopDir)).toBe(false);
  expect(existsSync(join(app.seeded.home, "runs", app.seeded.runIds.video))).toBe(true);
  const runs = (await app.api<{ runs: { skillKey: string }[] }>("/api/runs?limit=500")).runs;
  expect(runs.some((r) => r.skillKey === "personal:review-loop")).toBe(false);
  expect(runs.filter((r) => r.skillKey === "personal:motion-ad")).toHaveLength(4);
  await expect.poll(async () => bytesOf(await app.page.getByTestId("data-size").innerText())).toBeLessThan(before);
});
