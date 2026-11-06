import { test, expect, accessibility } from "./public-fixture";
const pages = [
  "/",
  "/events",
  "/team",
  "/resources",
  "/sponsors",
  "/gallery",
  "/contact",
];
for (const path of pages) {
  test(`public ${path} remains readable, scrollable and accessible`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(path);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await accessibility(page)).toEqual([]);
    const tall = await page.evaluate(
      () => document.documentElement.scrollHeight > innerHeight,
    );
    await page.screenshot({
      path: info.outputPath("review-viewport.png"),
      animations: "disabled",
    });
    if (tall) {
      await page.screenshot({
        path: info.outputPath("review-full-page.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page.evaluate(() => window.scrollTo(0, 500));
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
    await expect(
      page.getByText(
        /officers can use|access code in the footer|shift\+enter to open admin/i,
      ),
    ).toHaveCount(0);
  });
}
test("mobile navigation stays at the top and returns keyboard focus on escape", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.includes("mobile"),
    "Mobile navigation is intentionally hidden at desktop widths",
  );
  await page.goto("/events");
  const opener = page.getByRole("button", { name: "Open navigation" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const navigation = page.getByRole("navigation", {
    name: "Mobile navigation",
  });
  await expect(navigation).toBeVisible();
  const box = await navigation.boundingBox();
  expect(box?.y).toBeLessThan(150);
  expect(box!.height).toBeLessThan(page.viewportSize()!.height * 0.8);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(navigation).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await navigation
    .getByRole("link", { name: "Resources", exact: true })
    .click();
  await expect(page).toHaveURL(/\/resources$/);
  await expect(navigation).toHaveCount(0);
});
test("event read failure offers an explicit retry without a mutation", async ({
  page,
  fixture,
}) => {
  fixture.failEvents = true;
  await page.goto("/events");
  await expect(
    page
      .getByText("Fictional browser fixture request unavailable.", {
        exact: false,
      })
      .first(),
  ).toBeVisible();
  fixture.failEvents = false;
  await page
    .getByRole("button", { name: /try again|retry/i })
    .last()
    .click();
  await expect(
    page.getByText("Fictional browser fixture request unavailable.", {
      exact: false,
    }),
  ).toHaveCount(0);
  await expect(page.locator("h1")).toBeVisible();
});
test("unrecognized public routes keep a usable return path", async ({
  page,
}) => {
  await page.goto("/fictional-browser-missing-page");
  await expect(
    page.getByRole("heading", { name: "A little off the beaten path." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/\/$/);
});
test("anonymous administration never renders a private form inventory", async ({
  page,
}) => {
  await page.goto("/admin/forms");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Forms", exact: true }),
  ).toHaveCount(0);
});
test("reduced motion keeps an accessible static hero without WebGL downloads", async ({
  page,
}) => {
  const enhancements: string[] = [],
    heroImages: string[] = [];
  page.on("request", (request) => {
    if (/HeroObjects|three-vendor|three\.core/.test(request.url()))
      enhancements.push(request.url());
    if (/\/hero-(?:atmosphere|campus)(?:-mobile)?\.webp$/.test(request.url()))
      heroImages.push(new URL(request.url()).pathname);
  });
  await page.goto("/");
  await page.mouse.move(300, 250);
  await expect(page.locator(".gt-hero-static-objects")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".gt-hero-static-objects")
        .evaluate(
          (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
        ),
    )
    .toBe(true);
  const suffix = page.viewportSize()!.width <= 480 ? "-mobile" : "";
  expect(heroImages.sort()).toEqual([
    `/assets/hero-atmosphere${suffix}.webp`,
    `/assets/hero-campus${suffix}.webp`,
  ]);
  await expect(page.locator(".gt-home-hero canvas")).toHaveCount(0);
  expect(enhancements).toEqual([]);
});

test("capable desktop hero renders moving WebGL frames and restores reduced-motion fallback", async ({
  page,
  browserName,
}, info) => {
  // Software-WebGL capture is a functional check, separate from hardware FPS
  // and Web Vitals. Capture a fixed region without locator stability waits.
  test.setTimeout(60000);
  test.skip(
    browserName !== "chromium" || info.project.name.includes("mobile"),
    "Functional software-WebGL check uses the capable desktop Chromium profile",
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", {
      configurable: true,
      get: () => 8,
    });
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      get: () => 8,
    });
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator(".gt-hero-static-objects")).toBeVisible();
  await page.mouse.move(400, 300);
  const canvas = page.locator(".gt-home-hero canvas");
  await expect(canvas).toBeVisible({ timeout: 20000 });
  const bounds = (await canvas.boundingBox())!;
  const clip = {
    x: bounds.x + bounds.width * 0.65,
    y: Math.max(0, bounds.y),
    width: bounds.width * 0.35,
    height: Math.min(bounds.height, 350),
  };
  const frames = [];
  for (let i = 0; i < 3; i++) {
    frames.push(await page.screenshot({ clip, timeout: 10000 }));
    await page.waitForTimeout(250);
  }
  expect(frames[0].equals(frames[1])).toBe(false);
  expect(frames[1].equals(frames[2])).toBe(false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(canvas).toHaveCount(0);
  await expect(page.locator(".gt-hero-static-objects")).toBeVisible();
});
