import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
for (const action of ["draft", "publish"] as const)
  for (const loss of ["before", "after"] as const)
    test(`${action} ${loss}-acceptance response loss uses explicit original-write recovery`, async ({
      page,
      fixture,
    }, info) => {
      fixture.authenticated = true;
      fixture.formBuilder = true;
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/admin/forms/" + fictionalBuilderForm.id + "/edit");
      const title = page.getByLabel("Form title", { exact: true });
      await expect(title).toBeEnabled();
      if (loss === "before") fixture.dropFormBefore = true;
      else fixture.failFormSave = true;
      if (action === "draft")
        await title.fill("Fictional original browser retry draft");
      else {
        await page
          .getByRole("button", { name: "Publish", exact: true })
          .click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Publish version", exact: true })
          .click();
      }
      const region = page.getByRole("region", {
        name: "Unconfirmed form write recovery",
      });
      await expect(region).toBeVisible();
      await expect(title).toBeDisabled();
      await expect(
        region.getByRole("button", { name: /Retry this exact/ }),
      ).toHaveCount(0);
      expect(fixture.formAttempts).toHaveLength(1);
      expect(await accessibility(page)).toEqual([]);
      await region
        .getByRole("button", {
          name: "Recheck original write outcome",
          exact: true,
        })
        .click();
      if (loss === "before") {
        await region
          .getByRole("button", {
            name:
              action === "draft"
                ? "Retry this exact draft save"
                : "Retry this exact publication",
            exact: true,
          })
          .click();
        expect(fixture.formAttempts).toHaveLength(2);
        expect(fixture.formAttempts[0]).toEqual(fixture.formAttempts[1]);
      }
      await expect(
        region.getByText(/The original change is confirmed/),
      ).toBeVisible();
      expect(fixture.formWrites).toBe(1);
      expect(fixture.formAttempts).toHaveLength(loss === "before" ? 2 : 1);
      await expect(
        page.getByRole("button", {
          name: "Review loading saved draft",
          exact: true,
        }),
      ).toBeEnabled();
      await page
        .getByRole("button", {
          name: "Review loading saved draft",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(
        "Unsaved field, setting and undo/redo changes will be discarded",
      );
      await expect(
        dialog.getByRole("button", {
          name: "Keep proposed draft and resume autosave",
          exact: true,
        }),
      ).toBeEnabled();
      await page.screenshot({
        path: info.outputPath("form-write-reviewed-recovery.png"),
        fullPage: true,
        animations: "disabled",
      });
      await dialog
        .getByRole("button", {
          name: "Load saved draft and discard proposed changes",
          exact: true,
        })
        .click();
      await expect(title).toBeEnabled();
      await expect(title).toBeFocused();
      await expect(region).toHaveCount(0);
      expect(errors).toEqual([]);
      expect(fixture.unexpected).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
