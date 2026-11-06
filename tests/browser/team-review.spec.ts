import { test, expect, accessibility, fictionalTeam } from "./public-fixture";

test("team consequence review returns focus and reconciles a lost save", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  fixture.teamReview = true;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/admin/team/" + fictionalTeam.id);
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await page.getByLabel(/^Team name/).fill("Fictional reviewed team");
  await page
    .getByLabel(/^Confirm your own password/)
    .fill("Fictional browser password");
  const save = page.getByRole("button", {
    name: "Save team change",
    exact: true,
  });
  await save.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "Fictional browser team → Fictional reviewed team",
  );
  expect(fixture.teamWrites).toEqual([]);
  expect(await accessibility(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(save).toBeFocused();
  await save.click();
  fixture.failTeamSave = true;
  await page
    .getByRole("button", { name: "Confirm team change", exact: true })
    .click();
  const retry = page.getByRole("button", {
    name: "Retry original team operation",
  });
  await expect(retry).toBeDisabled();
  await expect(page.getByLabel(/^Current password for retry/)).toHaveValue("");
  expect(fixture.teamWrites).toHaveLength(1);
  expect(fixture.teamCommitted).toBe(1);
  await page.getByRole("button", { name: "Recheck saved team values" }).click();
  await expect(
    page.getByText("Inspect current saved team and memberships", {
      exact: true,
    }),
  ).toBeVisible();
  expect(fixture.teamWrites).toHaveLength(1);
  await page
    .getByLabel(/^Current password for retry/)
    .fill("Fictional browser password");
  await retry.click();
  const receipt = page.getByText("Edit team details confirmed by the server.", {
    exact: true,
  });
  await expect(receipt).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(receipt.locator("..")).toBeFocused();
  expect(fixture.teamWrites).toHaveLength(2);
  expect(fixture.teamWrites[1]).toEqual(fixture.teamWrites[0]);
  expect(fixture.teamCommitted).toBe(1);
  expect(await accessibility(page)).toEqual([]);
  await page.screenshot({
    path: info.outputPath("team-reconciled.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

test("long team grant review remains contained and keyboard reachable", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  fixture.teamReview = true;
  await page.goto("/admin/team/" + fictionalTeam.id);
  await page.getByRole("button", { name: "Permissions", exact: true }).click();
  await page.getByRole("button", { name: "Review & change grants" }).click();
  await page
    .getByLabel(/^Type the complete team name/)
    .fill(fictionalTeam.name);
  await page
    .getByLabel(/^Confirm your own password/)
    .fill("Fictional browser password");
  const save = page.getByRole("button", {
    name: "Save team change",
    exact: true,
  });
  await save.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Current grants:");
  await expect(dialog).toContainText("Proposed grants:");
  await expect(dialog).toContainText("/admin/projects");
  expect(await accessibility(page)).toEqual([]);
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  await dialog.getByLabel(/^Confirm your password again/).focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Confirm team change", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Keep editing", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: info.outputPath("team-grants-review.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(save).toBeFocused();
  expect(fixture.teamWrites).toEqual([]);
  expect(fixture.teamCommitted).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
