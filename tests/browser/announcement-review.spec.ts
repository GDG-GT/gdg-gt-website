import {
  test,
  expect,
  accessibility,
  fictionalTeam,
  fictionalPublishedTitle,
} from "./public-fixture";
test("published announcement review recovers an accepted edit without a second mutation", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  fixture.teamReview = true;
  fixture.announcementReview = true;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/admin/team/" + fictionalTeam.id + "?section=announcements");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel(/^Announcement title/)
    .fill("Fictional reviewed browser post");
  const message = "Fictional proposed body " + "LongContext".repeat(30);
  await page.getByLabel(/^Message/).fill(message);
  const save = page.getByRole("button", {
    name: "Save private draft",
    exact: true,
  });
  await save.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(fictionalPublishedTitle);
  await expect(dialog).toContainText(message);
  await expect(dialog).toContainText(
    "returns the published post to a private draft",
  );
  expect(fixture.announcementWrites).toEqual([]);
  expect(await accessibility(page)).toEqual([]);
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(save).toBeFocused();
  await save.click();
  await page
    .getByLabel(/^Type announcement title/)
    .fill(fictionalPublishedTitle);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Confirm published-post changes" }),
  ).toBeFocused();
  fixture.failAnnouncementSave = true;
  await page
    .getByRole("button", { name: "Confirm published-post changes" })
    .click();
  const retry = page.getByRole("button", {
    name: "Retry original announcement operation",
  });
  await expect(retry).toBeDisabled();
  expect(fixture.announcementWrites).toHaveLength(1);
  expect(fixture.announcementCommitted).toBe(1);
  await page
    .getByRole("button", { name: "Recheck saved announcement values" })
    .click();
  await expect(
    page.getByText("Inspect current saved announcement values", {
      exact: true,
    }),
  ).toBeVisible();
  expect(fixture.announcementWrites).toHaveLength(1);
  await retry.click();
  const receipt = page.getByText(/Announcement update confirmed by the server/);
  await expect(receipt).toBeVisible();
  await expect(receipt).toBeFocused();
  await expect(dialog).toHaveCount(0);
  expect(fixture.announcementWrites).toHaveLength(2);
  expect(fixture.announcementWrites[1]).toEqual(fixture.announcementWrites[0]);
  expect(fixture.announcementCommitted).toBe(1);
  expect(await accessibility(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("announcement-recovered.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
