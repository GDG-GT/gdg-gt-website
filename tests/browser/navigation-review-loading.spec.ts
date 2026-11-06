import { test, expect, accessibility } from "./public-fixture";

test("ordinary public browsing does not request the navigation review library", async ({
  page,
  fixture,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (
      /\/NavigationReviewDialog-[^/]+\.js$/.test(
        new URL(request.url()).pathname,
      )
    )
      requests.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Events", exact: true })
    .click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(page.locator("h1")).toBeVisible();
  expect(requests).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

for (const failure of [false, true])
  test(`navigation review ${failure ? "load failure" : "delayed loading"} preserves unsaved work and keyboard cancellation focus`, async ({
    page,
    fixture,
  }, info) => {
    let release!: () => void,
      requested = false;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/assets/NavigationReviewDialog-*.js", async (route) => {
      requested = true;
      await held;
      if (failure) await route.abort("connectionfailed");
      else await route.continue();
    });
    try {
      await page.goto("/contact");
      const name = page.getByLabel("Full name", { exact: false });
      await name.fill("Fictional unsent chapter visitor");
      const leave = page
        .getByRole("contentinfo")
        .getByRole("link", { name: "Events", exact: true });
      // Keyboard activation preserves the invoking anchor as the focus origin;
      // WebKit pointer activation deliberately does not focus links.
      await leave.focus();
      await leave.press("Enter");
      const preparing = page.getByRole("dialog", {
        name: "Preparing navigation review",
        exact: true,
      });
      await expect(preparing).toBeVisible();
      await expect.poll(() => requested).toBe(true);
      await expect(page).toHaveURL(/\/contact$/);
      await expect(
        preparing.getByRole("button", { name: "Stay on this page" }),
      ).toBeFocused();
      // Native modality must also refuse a background programmatic focus move.
      await name.evaluate((node: HTMLInputElement) => node.focus());
      await expect(
        preparing.getByRole("button", { name: "Stay on this page" }),
      ).toBeFocused();
      expect(await accessibility(page)).toEqual([]);
      await page.screenshot({
        path: info.outputPath("navigation-review-loading.png"),
        animations: "disabled",
      });
      if (failure) {
        release();
        const fallback = page.getByRole("dialog", {
          name: "Navigation review could not load",
          exact: true,
        });
        await expect(fallback).toBeVisible();
        await expect(
          fallback.getByRole("button", { name: "Stay on this page" }),
        ).toBeFocused();
        await expect(
          page.getByRole("button", { name: "Discard and leave", exact: true }),
        ).toHaveCount(0);
        expect(await accessibility(page)).toEqual([]);
        await fallback
          .getByRole("button", { name: "Stay on this page" })
          .click();
        await expect(leave).toBeFocused();
      } else {
        await page.keyboard.press("Escape");
        await expect(preparing).toHaveCount(0);
        await expect(leave).toBeFocused();
        await expect(name).toHaveValue("Fictional unsent chapter visitor");
        release();
        await leave.press("Enter");
        const review = page.getByRole("alertdialog", {
          name: "Leave unsaved work?",
          exact: true,
        });
        await expect(review).toBeVisible();
        await expect(
          review.getByRole("button", { name: "Stay here", exact: true }),
        ).toBeFocused();
        expect(await accessibility(page)).toEqual([]);
        await review
          .getByRole("button", { name: "Stay here", exact: true })
          .click();
        await expect(leave).toBeFocused();
        await expect(name).toHaveValue("Fictional unsent chapter visitor");
        await leave.press("Enter");
        await review
          .getByRole("button", { name: "Discard and leave", exact: true })
          .click();
        await expect(page).toHaveURL(/\/events$/);
        await expect(page.locator("#main-content")).toBeFocused();
      }
      if (failure) {
        await expect(page).toHaveURL(/\/contact$/);
        await expect(name).toHaveValue("Fictional unsent chapter visitor");
        // React reports the deliberately refused module to the page error event.
        expect(
          errors.every((error) =>
            /dynamically imported module|importing a module script|Failed to fetch/i.test(
              error,
            ),
          ),
        ).toBe(true);
      } else expect(errors).toEqual([]);
      expect(fixture.writes).toEqual([]);
      expect(fixture.unexpected).toEqual([]);
    } finally {
      release();
    }
  });
