import { readFile } from "node:fs/promises";
import { test, expect, fictionalBuilderForm } from "./public-fixture";
import { linktreeFixture } from "./operations-records";
const surfaces = ["/", "/events", "/team", "/gallery", "/resources", "/sponsors", "/contact", "/privacy", "/accessibility", "/offline", "/forms/" + fictionalBuilderForm.slug, "/l/fictional-hub", "/admin", "/admin/users", "/admin/forms"];
for (const surface of surfaces) test(`style split preserves the canonical cascade on ${surface}`, async ({ page, fixture }, info) => {
  fixture.authenticated = surface.startsWith("/admin");
  const css = (await Promise.all(["gt", "media", "newsletter", "contact-inbox"].map((name) => readFile("src/styles/" + name + ".css", "utf8")))).join("\n");
  if (surface.startsWith("/forms/")) await page.route("**/api/v1/forms/" + fictionalBuilderForm.slug, (route) => route.fulfill({ json: { data: { form: { ...fictionalBuilderForm, status: "Open", version: 1, versionId: "fbbb0000-0000-4000-8000-000000000019", copyAvailable: true } } } }));
  if (surface.startsWith("/l/")) await page.route("**/api/v1/linktree/fictional-hub**", (route) => route.fulfill({ json: { data: route.request().method() === "GET" ? { profile: { ...linktreeFixture().profile(), active: true, links: [] } } : { recorded: true } } }));
  await page.goto(surface);
  await expect(page.locator("h1").first()).toBeVisible();
  if (surface.startsWith("/forms/")) await expect(page.getByText(fictionalBuilderForm.title, { exact: true }).first()).toBeVisible();
  if (surface.startsWith("/l/")) await expect(page.getByText("Fictional first hub", { exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const settle = () => page.evaluate(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); await document.fonts.ready; await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  await settle();
  async function snapshot() {
    return page.evaluate(() => Array.from(document.body.querySelectorAll("*")).filter((node) => !["SCRIPT", "STYLE", "LINK"].includes(node.tagName)).map((node) => {
      const values: Record<string, string> = {};
      for (const pseudo of ["", "::before", "::after"]) {
        const style = getComputedStyle(node, pseudo || null);
        if (pseudo && ["none", "normal"].includes(style.content)) continue;
        // Closed details can defer used geometry. Resolve physical dimensions
        // first so logical aliases are compared from the same layout state.
        style.getPropertyValue("width"); style.getPropertyValue("height");
        for (const property of Array.from(style).filter((key) => !key.startsWith("--")).sort()) values[pseudo + ":" + property] = style.getPropertyValue(property);
      }
      return { node: node.tagName + "." + node.getAttribute("class"), values };
    }));
  }
  // Firefox resolves a closed details descendant's used grid tracks lazily.
  // Warm the identical computed-style walk before either comparison snapshot.
  await snapshot();
  await settle();
  const before = await snapshot();
  await page.addStyleTag({ content: css });
  await settle();
  const after = await snapshot(), differences: string[] = [];
  expect(after.length).toBe(before.length);
  for (let i = 0; i < before.length; i++) for (const property of new Set([...Object.keys(before[i].values), ...Object.keys(after[i].values)])) if (before[i].values[property] !== after[i].values[property]) differences.push(`${before[i].node} ${property}: ${before[i].values[property]} → ${after[i].values[property]}`);
  expect(differences.slice(0, 20)).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
  await info.attach("canonical-style-parity", { body: JSON.stringify({ surface, elements: before.length, differences: differences.length }), contentType: "application/json" });
});
