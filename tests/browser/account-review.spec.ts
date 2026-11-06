import {
  test,
  expect,
  accessibility,
  fictionalManagedAccount,
} from "./public-fixture";
test("account review restores focus and reconciles an accepted-but-lost save", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  fixture.accountReview = true;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/admin/users");
  const row = page
    .getByRole("row")
    .filter({ hasText: fictionalManagedAccount.email });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const save = page.getByRole("button", { name: "Save account", exact: true });
  await expect(save).toBeEnabled();
  await page
    .getByLabel(/^Display name/)
    .fill("Fictional reviewed browser account");
  await page.getByLabel(/^Account role/).selectOption("blog_editor");
  await page
    .getByLabel(/^Confirm your own password/)
    .fill("Fictional browser password");
  await save.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(fictionalManagedAccount.email);
  await expect(dialog).toContainText("Team member → Blog editor");
  expect(fixture.accountWrites).toEqual([]);
  expect(await accessibility(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(save).toBeFocused();
  await save.click();
  fixture.failAccountSave = true;
  await page.getByRole("button", { name: "Confirm account change" }).click();
  const retry = page.getByRole("button", {
    name: "Retry original account operation",
  });
  await expect(retry).toBeDisabled();
  await expect(page.getByLabel(/^Current password for retry/)).toHaveValue("");
  expect(fixture.accountWrites).toHaveLength(1);
  expect(fixture.accountCommitted).toBe(1);
  await page
    .getByRole("button", { name: "Recheck saved account values" })
    .click();
  await expect(
    page.getByText("Inspect current saved account values", { exact: true }),
  ).toBeVisible();
  expect(fixture.accountWrites).toHaveLength(1);
  await page
    .getByLabel(/^Current password for retry/)
    .fill("Fictional browser password");
  await expect(retry).toBeEnabled();
  await retry.click();
  const receipt = page.getByText(/Account update confirmed by the server/);
  await expect(receipt).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(receipt.locator("..")).toBeFocused();
  expect(fixture.accountWrites).toHaveLength(2);
  expect(fixture.accountWrites[1]).toEqual(fixture.accountWrites[0]);
  expect(fixture.accountCommitted).toBe(1);
  expect(await accessibility(page)).toEqual([]);
  await page.screenshot({
    path: info.outputPath("account-recovery-review.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
