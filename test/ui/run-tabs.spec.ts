import { expect, test } from "./fixtures";

type Api = { api<T>(p: string, i?: { method?: string; body?: unknown }): Promise<T> };
async function startRun(app: Api) {
  return (await app.api<{ run: { id: string } }>("/api/runs", { method: "POST", body: { skillKey: "personal:motion-ad", brief: "make the ad", place: { kind: "folder" } } })).run.id;
}

test.describe("question timeline", () => {
  test.use({ fakeFixture: "question" });
  test("the Timeline shows a waiting bar after a question", async ({ app }) => {
    const id = await startRun(app);
    await app.open(`/runs/${id}`);
    await app.page.getByTestId("ask-card").getByRole("button", { name: "b.txt" }).click();
    await expect(app.page.locator(".pill")).toHaveText(/Finished/, { timeout: 10_000 });
    await app.page.getByRole("tab", { name: "Timeline" }).click();
    await expect(app.page.getByTestId("tl-waiting")).toHaveCount(1);
  });
});

test.describe("files", () => {
  test.use({ fakeFixture: "files" });

  test("Transcript shows the brief first and a tool row expands", async ({ app }) => {
    const id = await startRun(app);
    await app.open(`/runs/${id}`);
    await expect(app.page.locator(".pill")).toHaveText(/Finished/, { timeout: 10_000 });
    await app.page.getByRole("tab", { name: "Transcript" }).click();
    const tx = app.page.getByTestId("transcript");
    await expect(tx.locator("> *").first()).toHaveAttribute("data-testid", "transcript-brief");
    await expect(app.page.getByTestId("transcript-brief")).toContainText("make the ad");
    const row = app.page.getByTestId("tool-row").filter({ hasText: "words.txt" }).first();
    await row.locator("summary").click();
    await expect(row.locator("pre").first()).toContainText('"file_path"');
  });

  test("Outputs lists the files; HTML is sandboxed; markdown runs no script; Copy path copies the absolute path", async ({ app, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const id = await startRun(app);
    await app.open(`/runs/${id}`);
    await expect(app.page.locator(".pill")).toHaveText(/Finished/, { timeout: 10_000 });
    await app.page.getByRole("tab", { name: /Outputs · 4/ }).click();
    const rows = app.page.getByTestId("output-row");
    await expect(rows).toHaveCount(4);
    await expect(rows.filter({ hasText: "words.txt" })).toContainText("written by this run");

    await rows.filter({ hasText: "page.html" }).getByRole("button", { name: "page.html" }).click();
    const frame = app.page.locator("iframe");
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    await expect(app.page.frameLocator("iframe").locator("#r")).not.toHaveText("pending");
    await expect(app.page.frameLocator("iframe").locator("#r")).not.toHaveText(/status 200/);

    await rows.filter({ hasText: "evil.md" }).getByRole("button", { name: "evil.md" }).click();
    await expect(app.page.locator(".md h1")).toHaveText("Report");
    await expect(app.page.locator(".md")).toContainText("<script>");
    expect(await app.page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined();

    const words = rows.filter({ hasText: "words.txt" });
    await words.getByRole("button", { name: "Copy path" }).click();
    const clip = await app.page.evaluate(() => navigator.clipboard.readText());
    expect(clip.startsWith("/")).toBe(true);
    expect(clip.endsWith("/words.txt")).toBe(true);
  });
});
