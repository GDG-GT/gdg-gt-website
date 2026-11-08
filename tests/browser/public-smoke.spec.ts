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
    const homeArtwork: string[] = [];
    page.on("request", (request) => {
      if (
        /\/hero-(?:atmosphere|campus)(?:-mobile)?\.webp$/.test(
          new URL(request.url()).pathname,
        )
      )
        homeArtwork.push(request.url());
    });
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
    if (path !== "/") expect(homeArtwork).toEqual([]);
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

test("home artwork still loads when its optional early hint fails", async ({
  page,
  fixture,
}) => {
  await page.route("**/assets/public-entry.js", (route) =>
    route.abort("connectionfailed"),
  );
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  for (const selector of [".gt-hero-art", ".gt-hero-static-objects"]) {
    await expect
      .poll(() =>
        page
          .locator(selector)
          .evaluate(
            (image: HTMLImageElement) =>
              image.complete && image.naturalWidth > 0,
          ),
      )
      .toBe(true);
  }
  expect(fixture.unexpected).toEqual([]);
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

test("capable desktop hero starts WebGL directly without a poster flash and restores reduced-motion fallback", async ({
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
  await page.addInitScript(() => {
    const observe = () => {
      const poster = document.querySelector(".gt-hero-static-objects");
      if (poster && getComputedStyle(poster).visibility !== "hidden" && poster.getBoundingClientRect().width > 0)
        document.documentElement.dataset.heroPosterFlashed = "true";
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });
  await page.goto("/");
  const canvas = page.locator(".gt-home-hero canvas");
  await expect(canvas).toBeVisible({ timeout: 20000 });
  // No pointer, keyboard or scroll interaction is needed to load the scene.
  await expect(page.locator(".gt-hero-static-objects:visible")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-hero-poster-flashed", "true");
  // Immediate startup can precede the public stylesheet/font settling. Sample
  // the final canvas region rather than a stale pre-layout page coordinate.
  await expect(page.locator(".gt-hero-objects")).toHaveCSS("position", "absolute");
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(async () => {
    const measured = await canvas.boundingBox();
    const container = await page.locator(".gt-hero-objects").boundingBox();
    return !!measured && !!container && Math.abs(measured.width - container.width) < 1 && Math.abs(measured.height - container.height) < 1;
  }).toBe(true);
  const bounds = (await canvas.boundingBox())!;
  const clip = {
    x: bounds.x + bounds.width * 0.65,
    y: Math.max(0, bounds.y),
    width: bounds.width * 0.35,
    height: Math.min(bounds.height, 350),
  };
  // Canvas visibility precedes shader compilation/first paint on software GPUs.
  // Require observed motion before sampling the three subsequent frames; the
  // original consecutive-frame assertions and all timeout limits remain intact.
  let warmup = await page.screenshot({ clip, timeout: 10000 });
  await expect
    .poll(async () => {
      await page.waitForTimeout(250);
      const next = await page.screenshot({ clip, timeout: 10000 });
      const moving = !warmup.equals(next);
      warmup = next;
      return moving;
    })
    .toBe(true);
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


test("desktop navigation and its bar share the page center", async ({ page }, info) => {
  test.skip(info.project.name.includes("mobile"), "Desktop centering; mobile uses the compact top menu.");
  await page.goto("/events");
  await page.evaluate(() => document.fonts.ready);
  const measured = await page.locator(".gt-nav").evaluate((nav) => {
    const bar = nav.getBoundingClientRect(), links = nav.querySelector(".gt-nav-links")!.getBoundingClientRect();
    return { barCenter: bar.x + bar.width / 2, linkCenter: links.x + links.width / 2, pageCenter: document.documentElement.clientWidth / 2 };
  });
  expect(Math.abs(measured.barCenter - measured.pageCenter)).toBeLessThanOrEqual(1);
  expect(Math.abs(measured.linkCenter - measured.barCenter)).toBeLessThanOrEqual(1);
});
