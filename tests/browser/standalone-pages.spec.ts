import { test, expect, accessibility, fictionalBuilderForm } from "./public-fixture";
import { linktreeFixture } from "./operations-records";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/linktree/**", (route) =>
    route.fulfill({ json: { data: route.request().method() === "GET"
      ? { profile: { ...linktreeFixture().profile(), active: true, links: [] } }
      : { recorded: true } } }),
  );
  await page.route("**/api/v1/forms/" + fictionalBuilderForm.slug, (route) =>
    route.fulfill({ json: { data: { form: {
      ...fictionalBuilderForm, status: "Open", version: 1,
      versionId: "fbbb0000-0000-4000-8000-000000000019", copyAvailable: true,
    } } } }),
  );
});

for (const path of [
  "/links", "/l/fictional-hub", "/forms/" + fictionalBuilderForm.slug,
  "/account/setup", "/team/join", "/admin/invite/fictional-token",
  "/newsletter/confirm", "/newsletter/unsubscribe",
]) test(`standalone ${path} has no website navigation or footer`, async ({ page }, info) => {
  await page.goto(path);
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator(".gt-nav-wrap, footer, #newsletter-email, .gt-preview-badge")).toHaveCount(0);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main-content");
  expect(await accessibility(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const surface = page.locator(".gt-linktree-public, .gt-public-form-page, .gt-token-page");
  expect(await surface.evaluate((node) => parseFloat(getComputedStyle(node).paddingTop))).toBeLessThanOrEqual(56);
  await page.screenshot({ path: info.outputPath("standalone-page.png"), fullPage: true, animations: "disabled" });
});

test("standalone loading and read errors do not bring back website navigation", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/v1/forms/" + fictionalBuilderForm.slug, async (route) => {
    await pending;
    await route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Fictional read unavailable" } } });
  });
  try {
    await page.goto("/forms/" + fictionalBuilderForm.slug);
    await expect(page.locator(".gt-site-standalone")).toBeVisible();
    await expect(page.locator(".gt-nav-wrap, footer")).toHaveCount(0);
    release();
    await expect(page.getByRole("button", { name: /retry|try again/i })).toBeVisible();
    await expect(page.locator(".gt-nav-wrap, footer")).toHaveCount(0);
  } finally { release(); }
});

test("returning from a standalone page restores the website layout", async ({ page }) => {
  await page.goto("/account/setup");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator(".gt-nav-wrap, footer")).toHaveCount(0);
  await page.goto("/events");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
});
