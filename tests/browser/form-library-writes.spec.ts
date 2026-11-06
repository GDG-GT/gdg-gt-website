import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
for (const action of [
  "create",
  "duplicate",
  "archive",
  "restore",
  "state",
] as const)
  for (const loss of ["before", "after"] as const)
    test(`library ${action} ${loss}-acceptance loss preserves one original change`, async ({
      page,
      fixture,
    }, info) => {
      fixture.authenticated = true;
      fixture.formLibraryWrites = true;
      fixture.loseLibraryWrite = loss;
      if (action === "restore") fixture.libraryInitialState = "Archived";
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/admin/forms");
      await expect(
        page.getByRole("button", {
          name: "Actions for " + fictionalBuilderForm.title,
          exact: true,
        }),
      ).toBeVisible();
      if (action === "create") {
        await page
          .getByRole("button", { name: "Create form", exact: true })
          .click();
        await page
          .getByLabel("Form title", { exact: false })
          .fill("Fictional original browser creation");
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Create form", exact: true })
          .click();
      } else {
        await page
          .getByRole("button", {
            name: "Actions for " + fictionalBuilderForm.title,
            exact: true,
          })
          .click();
        const name =
          action === "duplicate"
            ? "Duplicate"
            : action === "archive"
              ? "Archive form"
              : action === "restore"
                ? "Restore draft"
                : "Close form";
        await page.getByRole("menuitem", { name, exact: true }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toContainText(fictionalBuilderForm.title);
        await expect(dialog).toContainText("Saved revision 1");
        expect(await accessibility(page)).toEqual([]);
        await dialog
          .getByRole("button", {
            name: action === "duplicate" ? "Duplicate form" : name,
            exact: true,
          })
          .click();
      }
      const region = page.getByRole("region", {
        name: "Unconfirmed form library change",
      });
      await expect(region).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Retry this exact/ }),
      ).toHaveCount(0);
      expect(fixture.libraryAttempts).toHaveLength(1);
      expect(await accessibility(page)).toEqual([]);
      if (action === "duplicate") {
        await page.locator("#form-library-recovery-status").focus();
        await page
          .getByRole("region", { name: "Form inventory table" })
          .evaluate((element) => {
            element.scrollLeft = 0;
          });
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: info.outputPath("form-library-copy-recovery.png"),
          fullPage: true,
          animations: "disabled",
        });
      }
      await region
        .getByRole("button", { name: "Recheck original library change" })
        .click();
      if (loss === "before")
        await region.getByRole("button", { name: /Retry this exact/ }).click();
      await expect(region).toHaveCount(0);
      if (action === "create")
        await expect(
          page.getByLabel("Form title", { exact: true }),
        ).toHaveValue("Fictional original browser creation");
      else
        await expect(
          page.getByText(/original .* change confirmed/),
        ).toBeVisible();
      expect(fixture.libraryCommits).toBe(1);
      expect(fixture.libraryAttempts).toHaveLength(loss === "before" ? 2 : 1);
      if (loss === "before")
        expect(fixture.libraryAttempts[0]).toEqual(fixture.libraryAttempts[1]);
      expect(fixture.unexpected).toEqual([]);
      expect(fixture.writes).toEqual([]);
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
