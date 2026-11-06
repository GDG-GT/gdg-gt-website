import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
test("library retains failed reads and proposed titles, pauses writes and clears denial", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  fixture.formLibrary = true;
  fixture.failFormRead = true;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin/forms");
  await expect(
    page.getByText("Fictional browser fixture request unavailable.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByText("Matching forms", { exact: true })).toHaveCount(
    0,
  );
  fixture.failFormRead = false;
  await page
    .getByRole("button", { name: "Recheck form library", exact: true })
    .click();
  const row = page.getByRole("link", {
    name: new RegExp(fictionalBuilderForm.title),
  });
  await expect(row).toBeVisible();
  await expect(page.locator("#form-library-read-status")).toBeFocused();
  fixture.failFormRead = true;
  await page
    .getByRole("button", { name: "Recheck form library", exact: true })
    .click();
  await expect(
    page.getByText("Fictional browser fixture request unavailable.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(row).toBeVisible();
  await expect(
    page.getByText(/Last successful form library read/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create form", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Actions for " + fictionalBuilderForm.title })
    .click();
  for (const name of ["Duplicate", "Archive form"])
    await expect(
      page.getByRole("menuitem", { name, exact: true }),
    ).toBeDisabled();
  await page.keyboard.press("Escape");
  expect(await accessibility(page)).toEqual([]);
  await page.locator("#form-library-read-status").focus();
  await page
    .getByRole("region", { name: "Form inventory table" })
    .evaluate((element) => {
      element.scrollLeft = 0;
    });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("form-library-paused.png"),
    fullPage: true,
    animations: "disabled",
  });
  fixture.failFormRead = false;
  await page
    .getByRole("button", { name: "Recheck form library", exact: true })
    .click();
  const create = page.getByRole("button", { name: "Create form", exact: true });
  await expect(create).toBeEnabled();
  await create.click();
  const title = page.getByLabel("Form title", { exact: false });
  await title.fill("Fictional retained library proposal");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  fixture.failFormRead = true;
  await create.click();
  await expect(
    page.getByText(/Your proposed title remains on this page/),
  ).toBeVisible();
  await expect(title).toHaveValue("Fictional retained library proposal");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Create form", exact: true }),
  ).toBeDisabled();
  expect(await accessibility(page)).toEqual([]);
  fixture.failFormRead = false;
  fixture.denyFormRead = true;
  await page
    .getByRole("button", { name: "Recheck form creation access" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Form library access needs to be rechecked",
    }),
  ).toBeVisible();
  await expect(title).toHaveCount(0);
  await expect(row).toHaveCount(0);
  fixture.denyFormRead = false;
  await page
    .getByRole("button", { name: "Recheck form library access" })
    .click();
  await expect(row).toBeVisible();
  await create.click();
  await expect(title).toHaveValue("");
  await page.keyboard.press("Escape");
  expect(fixture.writes).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
