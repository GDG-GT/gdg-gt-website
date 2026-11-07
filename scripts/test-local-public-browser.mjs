import { chromium } from "playwright";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url),
  origin = "http://127.0.0.1:8080",
  output = new URL("../artifacts/browser/live-public/", import.meta.url),
  tests = [];
await mkdir(output, { recursive: true });
const axe = await readFile(require.resolve("axe-core/axe.min.js"), "utf8"),
  browser = await chromium.launch({ headless: true });
let completed = false;
try {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      locale: "en-US",
      timezoneId: "America/New_York",
      serviceWorkers: "block",
    });
    try {
      const page = await context.newPage(),
        writes = [],
        external = [];
      await page.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (url.origin !== origin) {
          external.push(url.origin);
          await route.abort("blockedbyclient");
          return;
        }
        if (
          url.pathname.startsWith("/api/") &&
          !["GET", "HEAD"].includes(request.method())
        ) {
          writes.push(request.method() + " " + url.pathname);
          await route.abort("blockedbyclient");
          return;
        }
        await route.continue();
      });
      for (const path of [
        "/",
        "/events",
        "/team",
        "/resources",
        "/sponsors",
        "/gallery",
        "/contact",
      ]) {
        const errors = [],
          capture = (error) => errors.push(error.message);
        page.on("pageerror", capture);
        await page.goto(origin + path, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(axe);
        const violations = await page.evaluate(async () =>
          (
            await window.axe.run(document, {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
              },
            })
          ).violations.map((item) => ({
            id: item.id,
            impact: item.impact,
            nodes: item.nodes.map((node) => node.target),
          })),
        );
        const layout = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          height: innerHeight,
          scrollHeight: document.documentElement.scrollHeight,
          headings: document.querySelectorAll("h1").length,
        }));
        const name =
          (path === "/" ? "home" : path.slice(1)) + "-" + viewport.width;
        await page.screenshot({
          path: new URL(name + "-viewport.png", output).pathname,
          animations: "disabled",
        });
        if (layout.scrollHeight > layout.height) {
          await page.screenshot({
            path: new URL(name + "-full.png", output).pathname,
            fullPage: true,
            animations: "disabled",
          });
          await page.evaluate(() => window.scrollTo(0, 500));
        }
        const scrolled = await page.evaluate(
            () =>
              scrollY > 0 ||
              document.documentElement.scrollHeight <= innerHeight,
          ),
          passed =
            !errors.length &&
            !violations.length &&
            !writes.length &&
            !external.length &&
            layout.headings === 1 &&
            layout.scrollWidth <= layout.width &&
            scrolled;
        tests.push({
          name: path + " at " + viewport.width + "×" + viewport.height,
          passed,
          layout,
          scrolled,
          pageErrors: errors,
          violations,
          blockedWrites: writes.length,
          externalRequests: external.length,
        });
        page.off("pageerror", capture);
        console.info((passed ? "PASS " : "FAIL ") + tests.at(-1).name);
        if (!passed)
          throw Error(
            "Live public browser check failed; see sanitized evidence.",
          );
      }
    } finally {
      await context.close();
    }
  }
  completed = true;
} finally {
  await browser.close();
  await writeFile(
    new URL("../.docs/phase0/local-public-browser.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        browser: "Pinned Playwright Chromium 1.64.1 on local macOS",
        note: "Actual loopback UI/API reads with fresh anonymous browser contexts and existing published inventories. All non-read API requests and external origins blocked. No data writes, credentials, provider sends or production changes. Reduced motion used; captures are unapproved review candidates, not golden baselines. Contrast-enabled axe checks do not replace manual accessibility/device/visual/hosted acceptance.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
