import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
test("form builder preserves paused drafts and reviews current saved recovery", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  fixture.formBuilder = true;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/admin/forms/" + fictionalBuilderForm.id + "/edit");
  const title = page.getByLabel("Form title", { exact: true }),
    accepted = "Fictional accepted browser draft";
  fixture.failFormSave = true;
  await title.fill(accepted);
  await expect(
    page.getByText(/Saved values changed or a save did not finish cleanly/),
  ).toBeVisible();
  await expect(title).toBeDisabled();
  expect(fixture.formWrites).toBe(1);
  await page
    .getByRole("button", { name: "Recheck saved form", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review loading saved draft" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "Unsaved field, setting and undo/redo changes will be discarded",
  );
  expect(await accessibility(page)).toEqual([]);
  await page.getByRole("button", { name: "Keep proposed draft" }).click();
  await expect(title).toHaveValue(accepted);
  await page
    .getByRole("button", { name: "Review loading saved draft" })
    .click();
  await page
    .getByRole("button", {
      name: "Load saved draft and discard proposed changes",
    })
    .click();
  await expect(title).toBeEnabled();
  await expect(title).toBeFocused();
  expect(fixture.formWrites).toBe(1);
  const proposed = "Fictional unsaved browser draft";
  await title.fill(proposed);
  fixture.failFormRead = true;
  await page
    .getByRole("button", { name: "Recheck saved form", exact: true })
    .click();
  await expect(
    page.getByText("Fictional browser fixture request unavailable.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(title).toHaveValue(proposed);
  await expect(title).toBeDisabled();
  await expect(
    page.getByText(/Last successful saved draft read/),
  ).toBeVisible();
  expect(await accessibility(page)).toEqual([]);
  expect(fixture.formWrites).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("builder-paused.png"),
    fullPage: true,
    animations: "disabled",
  });
  fixture.failFormRead = false;
  fixture.denyFormRead = true;
  await page
    .getByRole("button", { name: "Recheck saved form", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Form access needs to be rechecked" }),
  ).toBeVisible();
  await expect(title).toHaveCount(0);
  fixture.denyFormRead = false;
  await page.getByRole("button", { name: "Try loading form again" }).click();
  await expect(title).toHaveValue(accepted);
  await expect(title).toBeEnabled();
  expect(fixture.formWrites).toBe(1);
  expect(errors).toEqual([]);
});
