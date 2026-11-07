import { readFileSync } from "node:fs";
import { test, expect } from "./public-fixture";

const manifest = JSON.parse(readFileSync("dist/.vite/manifest.json", "utf8"));
const main = "/" + manifest["index.html"].file;
const publicPages = "/" + manifest["src/ui/PublicPages.tsx"].file;

for (const path of ["/events", "/contact", "/admin/forms"])
  test(`early public route hints preserve the startup boundary on ${path}`, async ({
    page,
    fixture,
  }) => {
    const requests: string[] = [],
      errors: string[] = [];
    page.on("request", (request) =>
      requests.push(new URL(request.url()).pathname),
    );
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      document.addEventListener(
        "load",
        (event) => {
          const target = event.target;
          if (
            target instanceof HTMLScriptElement &&
            new URL(target.src).pathname === "/assets/public-entry.js"
          )
            document.documentElement.dataset.fixtureEntryLoaded = "true";
        },
        true,
      );
    });
    await page.route("**" + main, async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      // Keep all network requests free to complete. A held interception stalls
      // unrelated resource completion in the WebKit automation transport.
      await route.fulfill({
        response,
        body:
          'document.documentElement.dataset.fixtureMainHeld="true";\n' +
          'await new Promise(resolve => window.addEventListener("gdg-fixture-release-main", resolve, {once:true}));\n' +
          source,
      });
    });
    try {
      await page.goto(path, { waitUntil: "commit" });
      await expect(page.locator("html")).toHaveAttribute(
        "data-fixture-main-held",
        "true",
      );
      await expect(page.locator("html")).toHaveAttribute(
        "data-fixture-entry-loaded",
        "true",
      );
      // The original main module body cannot execute yet. Only the independent helper
      // can start the emitted public graph at this point.
      await expect(page.locator("#root")).toBeEmpty();
      const hint = page.locator(
        `link[rel="modulepreload"][href="${publicPages}"]`,
      );
      if (path.startsWith("/admin")) {
        await expect(hint).toHaveCount(0);
        expect(requests).not.toContain(publicPages);
      } else {
        await expect(hint).toHaveCount(1);
        await expect.poll(() => requests.includes(publicPages)).toBe(true);
      }
      expect(
        requests.filter((url) =>
          /hero-(?:atmosphere|campus)|HeroObjects|PublicForm|FormBuilder/.test(
            url,
          ),
        ),
      ).toEqual([]);
    } finally {
      await page.evaluate(() =>
        window.dispatchEvent(new Event("gdg-fixture-release-main")),
      );
    }
    if (path.startsWith("/admin")) await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("h1")).toBeVisible();
    expect(errors).toEqual([]);
    expect(fixture.writes).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
