import {
  test,
  expect,
  accessibility,
  fictionalTeam,
  fictionalTeamInvite,
} from "./public-fixture";
test("reviewed invitation replay recovers a lost receipt once and restores focus", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  fixture.teamReview = true;
  fixture.invitationReview = true;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/admin/team/" + fictionalTeam.id + "?section=invitations");
  await page
    .getByRole("row")
    .filter({ hasText: fictionalTeamInvite.email })
    .getByRole("button", { name: "Resend", exact: true })
    .click();
  await page
    .getByLabel(/^Confirm your own password/)
    .fill("Fictional browser password");
  const save = page.getByRole("button", {
    name: "Confirm invitation change",
    exact: true,
  });
  await save.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(fictionalTeamInvite.email);
  await expect(dialog).toContainText("previous link stops working");
  expect(fixture.invitationWrites).toEqual([]);
  expect(await accessibility(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(save).toBeFocused();
  await save.click();
  fixture.failInvitationSave = true;
  await page
    .getByRole("button", { name: "Confirm reviewed invitation change" })
    .click();
  const retry = page.getByRole("button", {
    name: "Retry original invitation operation",
  });
  await expect(retry).toBeDisabled();
  await expect(page.getByLabel(/^Current password for retry/)).toHaveValue("");
  expect(fixture.invitationWrites).toHaveLength(1);
  expect(fixture.invitationCommitted).toBe(1);
  await page
    .getByRole("button", { name: "Recheck saved invitation values" })
    .click();
  await expect(
    page.getByText("Inspect current saved invitation values", { exact: true }),
  ).toBeVisible();
  expect(fixture.invitationWrites).toHaveLength(1);
  await page
    .getByLabel(/^Current password for retry/)
    .fill("Fictional browser password");
  await retry.click();
  const receipt = page.getByText(/Invitation change confirmed by the server/);
  await expect(receipt).toBeVisible();
  await expect(receipt).toBeFocused();
  await expect(dialog).toHaveCount(0);
  expect(fixture.invitationWrites).toHaveLength(2);
  expect(fixture.invitationWrites[1]).toEqual(fixture.invitationWrites[0]);
  expect(fixture.invitationCommitted).toBe(1);
  expect(await accessibility(page)).toEqual([]);
  await page.screenshot({
    path: info.outputPath("invitation-recovered.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
