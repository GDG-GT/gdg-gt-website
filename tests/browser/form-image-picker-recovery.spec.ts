import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
import type { Page } from "@playwright/test";
const photo = {
  id: "f1300000-0000-4000-8000-000000000001",
  alt_text: "Fictional approved chapter image " + "LongDescription".repeat(8),
  description: "Fictional public media",
  width: 1200,
  height: 800,
};
async function setup(page: Page) {
  const state = { fail: false, empty: false, reads: 0 };
  await page.route("**/api/v1/gallery?*", (route) => {
    state.reads++;
    const n = Number(new URL(route.request().url()).searchParams.get("page"));
    return route.fulfill({
      status: state.fail ? 503 : 200,
      json: state.fail
        ? {
            error: {
              code: "UNAVAILABLE",
              message: "Fictional published image outage",
            },
          }
        : {
            data: {
              items: state.empty
                ? []
                : [{ ...photo, id: photo.id.slice(0, -1) + n }],
              page: n,
              pageSize: 30,
              total: state.empty ? 0 : 65,
            },
          },
    });
  });
  await page.goto("/admin/forms/" + fictionalBuilderForm.id + "/edit");
  await expect(page.getByLabel("Form title", { exact: true })).toBeEnabled();
  if ((page.viewportSize()?.width || 1440) < 1000)
    await page.getByRole("button", { name: "Settings", exact: true }).click();
  else await page.getByRole("tab", { name: "Settings", exact: true }).click();
  const picker = page
    .locator(".gt-form-image-picker")
    .filter({ has: page.getByRole("combobox", { name: /^Header image/ }) })
    .filter({ visible: true });
  await expect(picker.getByRole("combobox")).toBeEnabled();
  return { picker, state };
}
test("published form image list retains a stale snapshot, pauses selection and retries independently", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  fixture.formBuilder = true;
  const { picker, state } = await setup(page);
  state.fail = true;
  await picker
    .getByRole("button", { name: "Recheck published images", exact: true })
    .click();
  await expect(
    picker.getByText("Fictional published image outage", { exact: true }),
  ).toBeVisible();
  await expect(picker.getByRole("combobox")).toBeDisabled();
  await expect(
    picker.getByRole("option", { name: photo.alt_text, exact: true }),
  ).toHaveCount(1);
  await expect(picker.getByText(/Showing the last successful/)).toBeVisible();
  expect(await accessibility(page)).toEqual([]);
  await page.screenshot({
    path: info.outputPath("form-image-read-recovery.png"),
    fullPage: true,
    animations: "disabled",
  });
  state.fail = false;
  await picker
    .getByRole("button", { name: "Retry published images", exact: true })
    .click();
  await expect(picker.getByRole("combobox")).toBeEnabled();
  expect(fixture.formWrites).toBe(0);
  expect(fixture.unexpected).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("published form image paging recovers after a later-page outage and shrinking inventory", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  fixture.formBuilder = true;
  const { picker, state } = await setup(page);
  state.fail = true;
  await picker
    .getByRole("button", { name: "Next images", exact: true })
    .click();
  await expect(
    picker.getByText("Fictional published image outage", { exact: true }),
  ).toBeVisible();
  await expect(
    picker.getByRole("option", { name: photo.alt_text, exact: true }),
  ).toHaveCount(0);
  state.fail = false;
  await picker
    .getByRole("button", { name: "Return to first image page", exact: true })
    .click();
  await expect(
    picker.getByText("Page 1 · 65 matching", { exact: true }),
  ).toBeVisible();
  state.empty = true;
  await picker
    .getByRole("button", { name: "Next images", exact: true })
    .click();
  await expect(
    picker.getByText("Page 2 · 0 matching", { exact: true }),
  ).toBeVisible();
  state.empty = false;
  await picker
    .getByRole("button", { name: "Previous images", exact: true })
    .click();
  await expect(
    picker.getByText("Page 1 · 65 matching", { exact: true }),
  ).toBeVisible();
  expect(fixture.formWrites).toBe(0);
  expect(fixture.unexpected).toEqual([]);
  expect(await accessibility(page)).toEqual([]);
});
