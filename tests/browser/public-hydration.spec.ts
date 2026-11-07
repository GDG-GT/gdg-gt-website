import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { test, expect, accessibility } from "./public-fixture";
import { renderSiteDocument } from "../../shared/site-document.mjs";
const source = pathToFileURL(path.resolve(".build/ssr/entry.mjs")).href;
const status = { revision: 1, is_live: true, message: "", redirect_url: "", button_text: "Chapter updates", auto_redirect: false };
for (const routePath of ["/", "/events", "/contact"]) test(`public ${routePath} preserves its server tree and unlocks forms only after hydration`, async ({ page, fixture }, info) => {
  const template = await readFile("dist/index.html", "utf8");
  const manifest = JSON.parse(await readFile("dist/.vite/manifest.json", "utf8"));
  const errors: string[] = [], reads: string[] = [], heroRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { const url = new URL(request.url()); if (["/api/v1/public/home", "/api/v1/site-status"].includes(url.pathname)) reads.push(url.pathname); if (url.pathname.includes("hero-atmosphere")) heroRequests.push(url.pathname); });
  const home = { settings: [], navigation: [], footer: [], social: [], metrics: [], sponsors: [], pages: [
    { page_slug: routePath === "/" ? "home" : routePath.slice(1), section_key: routePath === "/" ? "hero" : routePath === "/contact" ? "main" : "header", content: { title: "Fictional current published heading" } },
  ] };
  const renderer = await import(source);
  const result = await renderer.renderPublicPage(routePath, { home, status });
  const html = renderSiteDocument(template, { title: "Fictional public render", description: "Fictional public copy", index: true, canonical: "http://127.0.0.1:4173" + routePath, image: "/logo.png" }, { ...result, path: routePath });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/" + manifest["index.html"].file, async (route) => { await pending; await route.continue(); });
  await page.route((url) => url.pathname === routePath && !url.search, (route) => route.fulfill({ contentType: "text/html", body: html }));
  try {
    await page.goto(routePath, { waitUntil: "commit" });
    await expect(page.locator("h1")).toContainText("Fictional current published heading");
    const heading = await page.locator("h1").elementHandle();
    const hero = routePath === "/" ? await page.locator(".gt-hero-art").elementHandle() : null;
    if (routePath === "/") {
      const expected = "/assets/" + (info.project.name.includes("mobile") ? "hero-atmosphere-mobile.webp" : "hero-atmosphere.webp");
      await expect.poll(() => heroRequests.includes(expected)).toBe(true);
      expect(heroRequests.every((url) => url === expected)).toBe(true);
    }
    const form = page.locator("form.gt-newsletter");
    await expect.poll(() => form.evaluate((node: HTMLFormElement) => node.inert)).toBe(true);
    await page.getByLabel("Email address", { exact: true }).focus();
    await expect(page.getByLabel("Email address", { exact: true })).not.toBeFocused();
    release();
    await expect.poll(() => form.evaluate((node: HTMLFormElement) => node.inert)).toBe(false);
    expect(await heading!.evaluate((node) => node.isConnected && node === document.querySelector("h1"))).toBe(true);
    if (hero) {
      expect(await hero.evaluate((node) => node.isConnected && node === document.querySelector(".gt-hero-art"))).toBe(true);
      await expect(page.locator(".gt-hero-art")).toHaveJSProperty("complete", true);
      const currentSrc = await page.locator(".gt-hero-art").evaluate((node: HTMLImageElement) => node.currentSrc);
      expect(currentSrc).toContain(info.project.name.includes("mobile") ? "hero-atmosphere-mobile.webp" : "hero-atmosphere.webp");
    }
    await page.getByLabel("Email address", { exact: true }).fill("fictional-hydration@example.test");
    await expect(page.getByLabel("Email address", { exact: true })).toHaveValue("fictional-hydration@example.test");
    expect(await accessibility(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("hydrated-public.png"), fullPage: true, animations: "disabled" });
    expect(reads).toEqual([]); expect(errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
  } finally { release(); }
});

test("public framework download failure keeps forms inert and offers recovery", async ({ page, fixture }) => {
  const template = await readFile("dist/index.html", "utf8");
  const manifest = JSON.parse(await readFile("dist/.vite/manifest.json", "utf8"));
  const renderer = await import(source);
  const home = { settings: [], navigation: [], footer: [], social: [], metrics: [], sponsors: [], pages: [] };
  const rendered = await renderer.renderPublicPage("/", { home, status });
  const html = renderSiteDocument(template, { title: "Fictional recovery", description: "Fictional public copy", index: true, canonical: "http://127.0.0.1:4173/", image: "/logo.png" }, { ...rendered, path: "/" });
  await page.route("**/" + manifest["index.html"].file, (route) => route.abort("connectionfailed"));
  await page.route((url) => url.pathname === "/" && !url.search, (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("/");
  await expect(page.getByRole("alert")).toHaveText("Interactive controls could not load. Refresh this page to try again.");
  await expect(page.locator("h1")).toContainText("Developer");
  expect(await page.locator("form.gt-newsletter").evaluate((node: HTMLFormElement) => node.inert)).toBe(true);
  expect(fixture.writes).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
