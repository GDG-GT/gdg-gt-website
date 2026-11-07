import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
const origin = "http://127.0.0.1:8080",
  tests = [],
  errors = [],
  writes = [],
  external = [],
  output = new URL("../artifacts/browser/live-hero/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
let completed = false;
const check = (condition, name) => {
  if (!condition) throw Error(name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const r = route.request(),
      url = new URL(r.url());
    if (url.origin !== origin) {
      external.push(url.origin);
      await route.abort("blockedbyclient");
      return;
    }
    if (
      url.pathname.startsWith("/api/") &&
      !["GET", "HEAD"].includes(r.method())
    ) {
      writes.push(url.pathname);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  await page.goto(origin, { waitUntil: "networkidle" });
  const canvas = page.locator(".gt-home-hero canvas");

  await canvas.waitFor({ state: "visible", timeout: 20000 });
  check(
    await canvas.isVisible(),
    "capable desktop loads real WebGL without interaction",
  );
  check(
    (await page.locator(".gt-hero-static-objects:visible").count()) === 0,
    "capable desktop never substitutes a different poster before the scene",
  );
  const frames = [];
  for (let i = 0; i < 3; i++) {
    const bytes = await canvas.screenshot({
      path: new URL("frame-" + i + ".png", output).pathname,
      timeout: 10000,
    });
    frames.push(createHash("sha256").update(bytes).digest("hex"));
    await page.waitForTimeout(250);
  }
  check(
    new Set(frames).size === 3,
    "three rendered canvas captures contain distinct moving frames",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await canvas.waitFor({ state: "detached" });
  check(
    await page.locator(".gt-hero-static-objects").isVisible(),
    "changing reduced-motion preference removes WebGL and restores the poster",
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  check(
    (await canvas.count()) === 0 &&
      (await page.locator(".gt-hero-static-objects").isVisible()),
    "narrow mobile viewport retains the lightweight fallback",
  );
  check(
    !errors.length && !writes.length && !external.length,
    "hero enhancement produces no page errors, data mutations or external requests",
  );
  completed = true;
} finally {
  await browser.close();
  await writeFile(
    new URL("../.docs/phase0/local-hero-browser.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        note: "Actual anonymous loopback browser rendering using pinned Playwright Chromium and software WebGL. Non-read APIs and external origins blocked. Functional moving-frame/fallback proof only, not hardware FPS, Web Vitals, visual approval or hosted acceptance. No data/provider/production changes.",
        tests,
        pageErrors: errors,
        blockedWrites: writes.length,
        externalRequests: external.length,
      },
      null,
      2,
    ) + "\n",
  );
}
