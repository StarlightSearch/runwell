import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./fixtures";

const loggedLines = (home: string) => {
  try {
    return readFileSync(join(home, "fake.log"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

test.describe("run dialog", () => {
  test.use({ fakeFixture: "slow" });

  test("R opens it for the focused row and esc closes it", async ({ app }) => {
    await app.open("/skills");
    await app.page.locator('tr[data-skill="motion-ad"]').hover();
    await app.page.keyboard.press("r");
    await expect(app.page.getByRole("dialog", { name: "Run motion-ad" })).toBeVisible();
    await app.page.keyboard.press("Escape");
    await expect(app.page.getByRole("dialog")).toHaveCount(0);
  });

  test("Ctrl+Enter starts the run with the brief and an attached file, and lands on the run", async ({ app }) => {
    await app.open("/skills");
    await app.page.locator('tr[data-skill="motion-ad"]').getByRole("button", { name: "Run" }).click();
    const dialog = app.page.getByRole("dialog");
    await dialog.getByLabel("Brief").fill("A 15 second ad, 9:16");
    const file = join(app.seeded.home, "logo.png");
    writeFileSync(file, "png");
    await dialog.locator('input[type="file"]').setInputFiles(file);
    await expect(dialog.getByText("logo.png")).toBeVisible();
    await app.page.keyboard.press("Control+Enter");
    await expect(app.page).toHaveURL(/\/runs\/[a-z2-7]{12}$/);
    await expect(app.page.locator(".pill")).toHaveText(/Running/);
    await expect.poll(() => loggedLines(app.seeded.home).find((l) => l.stdin)?.stdin ?? "").toContain("A 15 second ad, 9:16");
    const first = JSON.parse(loggedLines(app.seeded.home).find((l) => l.stdin).stdin).message.content[0].text as string;
    expect(first).toMatch(/Attached files:\n.*\/inputs\/logo\.png/);
  });

  test("an untrusted project asks first; nothing starts until Run here anyway", async ({ app }) => {
    await app.open("/skills");
    await app.page.locator('tr[data-skill="motion-ad"]').getByRole("button", { name: "Run" }).click();
    const dialog = app.page.getByRole("dialog");
    await dialog.getByLabel("Where").selectOption({ label: "client-repo (not trusted)" });
    await dialog.getByRole("button", { name: "Start run ⌘↵" }).click();
    await expect(dialog.getByText("Claude Code has not been trusted in this folder. Running here can start this folder's hooks and MCP servers.")).toBeVisible();
    expect(loggedLines(app.seeded.home).filter((l) => l.argv)).toHaveLength(0);
    await dialog.getByRole("button", { name: "Run here anyway" }).click();
    await dialog.getByRole("button", { name: "Start run ⌘↵" }).click();
    await expect(app.page).toHaveURL(/\/runs\/[a-z2-7]{12}$/);
    await expect.poll(() => loggedLines(app.seeded.home).find((l) => l.argv)?.cwd).toBe(app.seeded.untrusted);
  });

  test("runs start in Auto mode by default; Ask first leaves the mode to your settings", async ({ app }) => {
    const argvOf = async () => {
      let line: { argv: string[] } | undefined;
      await expect.poll(() => (line = loggedLines(app.seeded.home).filter((l) => l.argv).at(-1))).toBeTruthy();
      return line!.argv;
    };
    await app.open("/skills");
    await app.page.locator('tr[data-skill="motion-ad"]').getByRole("button", { name: "Run" }).click();
    const dialog = app.page.getByRole("dialog");
    await expect(dialog.getByLabel("Permission mode")).toHaveValue("auto");
    await dialog.getByRole("button", { name: /Start run/ }).click();
    await expect(app.page).toHaveURL(/\/runs\/[a-z2-7]{12}$/);
    await expect(app.page.getByTestId("place-line")).toContainText("auto mode");
    let argv = await argvOf();
    expect(argv[argv.indexOf("--permission-mode") + 1]).toBe("auto");

    await app.open("/skills");
    await app.page.locator('tr[data-skill="review-loop"]').getByRole("button", { name: "Run" }).click();
    await app.page.getByRole("dialog").getByLabel("Permission mode").selectOption("ask");
    await app.page.getByRole("dialog").getByRole("button", { name: /Start run/ }).click();
    await expect(app.page.getByTestId("place-line")).toContainText("asks first");
    await expect.poll(() => loggedLines(app.seeded.home).filter((l) => l.argv).length).toBe(2);
    argv = await argvOf();
    expect(argv).not.toContain("--permission-mode");
  });

  test("Allow everything is off each time the dialog opens; From run prefills the brief", async ({ app }) => {
    await app.open("/skills");
    const openDialog = async () => {
      await app.page.locator('tr[data-skill="motion-ad"]').getByRole("button", { name: "Run" }).click();
      return app.page.getByRole("dialog");
    };
    let dialog = await openDialog();
    await dialog.getByLabel("Allow everything for this run").check();
    await expect(dialog.getByText("Commands can reach outside the folder. Nothing will ask first.")).toBeVisible();
    await app.page.keyboard.press("Escape");
    dialog = await openDialog();
    await expect(dialog.getByLabel("Allow everything for this run")).not.toBeChecked();
    await dialog.getByLabel("From run").selectOption({ label: "From run #2" });
    await expect(dialog.getByLabel("Brief")).toHaveValue("Ad number 2 for pulsarbot.cloud");
  });
});

test.describe("signed out", () => {
  test.use({ fakeAuth: "out" });
  test("Start is disabled and the sign-in message shows", async ({ app }) => {
    await app.open("/skills");
    await app.page.locator('tr[data-skill="motion-ad"]').getByRole("button", { name: "Run" }).click();
    const dialog = app.page.getByRole("dialog");
    await expect(dialog.getByText("Run `claude` in a terminal and sign in.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Start run ⌘↵" })).toBeDisabled();
  });
});

test("Run a skill opens a skill picker; Change skill switches skill and keeps the brief", async ({ app }) => {
  await app.open("/skills");
  const page = app.page;
  await page.getByRole("button", { name: /Run a skill/ }).click();
  const picker = page.getByRole("dialog", { name: "Pick a skill to run" });
  await expect(picker).toBeVisible();
  await page.keyboard.type("motion");
  await expect(picker.getByRole("option").first()).toContainText("motion-ad");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Run motion-ad" })).toBeVisible();
  await page.getByLabel("Brief").fill("keep this brief");
  await page.getByRole("button", { name: "Change skill" }).click();
  await expect(page.getByRole("dialog", { name: "Pick a skill to run" })).toBeVisible();
  await page.keyboard.type("review");
  await expect(page.getByRole("option").first()).toContainText("review-loop");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Run review-loop" })).toBeVisible();
  await expect(page.getByLabel("Brief")).toHaveValue("keep this brief");
});
