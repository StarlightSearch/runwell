import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./fixtures";

const answeredInLog = (home: string) => {
  try {
    return readFileSync(join(home, "fake.log"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((l) => "answered" in l)?.answered;
  } catch {
    return undefined;
  }
};
async function startRun(app: { api<T>(p: string, i?: { method?: string; body?: unknown }): Promise<T> }) {
  return (await app.api<{ run: { id: string } }>("/api/runs", { method: "POST", body: { skillKey: "personal:motion-ad", brief: "go", place: { kind: "folder" } } })).run.id;
}

test.describe("question", () => {
  test.use({ fakeFixture: "question" });

  test("pauses with Waiting for you; the second option resumes and finishes; the answer reaches claude", async ({ app }) => {
    const id = await startRun(app);
    await app.open(`/runs/${id}`);
    await expect(app.page.locator(".pill")).toHaveText(/Waiting for you/);
    await expect(app.page).toHaveTitle(/^\(1\) /);
    const card = app.page.getByTestId("ask-card");
    await expect(card).toContainText("Claude asks: Should the file be named a.txt or b.txt?");
    await app.page.waitForTimeout(300);
    await card.getByRole("button", { name: "b.txt" }).click();
    await expect(app.page.getByTestId("ask-done")).toHaveText("You answered: b.txt");
    await expect(app.page.locator(".pill")).toHaveText(/Finished/, { timeout: 10_000 });
    expect(answeredInLog(app.seeded.home)).toEqual({ kind: "question", answers: { "Should the file be named a.txt or b.txt?": "b.txt" } });
    const run = (await app.api<{ run: { waitingMs: number } }>(`/api/runs/${id}`)).run;
    expect(run.waitingMs).toBeGreaterThan(0);
    await expect(app.page).not.toHaveTitle(/^\(1\) /);
  });

  test("a reload while the card is open shows it again; answering in one tab removes it in another", async ({ app, context }) => {
    const id = await startRun(app);
    await app.open(`/runs/${id}`);
    await expect(app.page.getByTestId("ask-card")).toBeVisible();
    await app.page.reload();
    await expect(app.page.getByTestId("ask-card")).toBeVisible();
    const other = await context.newPage();
    await other.goto(app.page.url());
    await expect(other.getByTestId("ask-card")).toBeVisible();
    await other.getByTestId("ask-card").getByRole("button", { name: "a.txt" }).click();
    await expect(app.page.getByTestId("ask-card")).toHaveCount(0, { timeout: 2000 });
  });
});

test.describe("permission", () => {
  test.use({ fakeFixture: "permission" });
  test("shows the command; Deny with a reason reaches claude as a denial", async ({ app }) => {
    const id = await startRun(app);
    await app.open(`/runs/${id}`);
    const card = app.page.getByTestId("ask-card");
    await expect(card).toContainText("Claude wants to run Bash");
    await expect(card).toContainText("touch c.txt");
    await card.getByRole("button", { name: "Deny" }).click();
    await card.getByLabel("Tell Claude why").fill("not in this folder");
    await card.getByRole("button", { name: "Deny" }).click();
    await expect(app.page.getByTestId("ask-done")).toContainText("You denied: touch c.txt");
    await expect.poll(() => answeredInLog(app.seeded.home)).toEqual({ kind: "permission", allow: false, message: "not in this folder" });
  });
});
