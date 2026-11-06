import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
test("archived builder stays read-only while exposing saved inspection", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  fixture.formLibraryWrites = true;
  fixture.libraryInitialState = "Archived";
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin/forms/" + fictionalBuilderForm.id + "/edit");
  await expect(
    page.getByRole("region", { name: "Archived form status" }),
  ).toBeVisible();
  await expect(page.getByLabel("Form title", { exact: true })).toBeDisabled();
  await expect(
    page.getByLabel("Form description", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Preview", exact: true }),
  ).toHaveAttribute("aria-disabled", "false");
  const mobile = info.project.name.includes("mobile");
  if (mobile)
    await page.getByRole("button", { name: "Settings", exact: true }).click();
  else await page.getByRole("tab", { name: "Settings", exact: true }).click();
  const settings = mobile ? page.getByRole("dialog") : page;
  await expect(
    settings.getByLabel("Access mode", { exact: false }),
  ).toBeDisabled();
  if (mobile) {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  expect(await accessibility(page)).toEqual([]);
  await page
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Published versions");
  await expect(
    page.getByLabel("Published snapshot", { exact: false }),
  ).toBeEnabled();
  expect(await accessibility(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("archived-builder.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(fixture.libraryAttempts).toEqual([]);
  expect(fixture.formAttempts).toEqual([]);
  expect(fixture.writes).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
