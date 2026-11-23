import { expect, test } from "./fixtures";

test("the gallery shows the seeded files newest first; Video leaves only mp4; a tile opens its run", async ({ app }) => {
  await app.open("/outputs");
  const tiles = app.page.getByTestId("output-tile");
  await expect(tiles).toHaveCount(4);
  await expect(tiles.nth(0)).toContainText("copy.txt");
  await expect(tiles.nth(1)).toContainText("notes.md");
  await expect(tiles.nth(0)).toContainText(/motion-ad #3 · \d{2}\/\d{2}\/\d{4}/);
  await app.page.getByRole("button", { name: "Video", exact: true }).click();
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first()).toHaveAttribute("data-kind", "video");
  await tiles.first().click();
  await expect(app.page).toHaveURL(new RegExp(`/runs/${app.seeded.runIds.video}$`));
});

test("a kind with nothing shows the empty state", async ({ app }) => {
  await app.open("/outputs");
  await app.page.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(app.page.getByText("Nothing yet.")).toBeVisible();
  await expect(app.page.getByText("Files your runs produce show up here.")).toBeVisible();
});
