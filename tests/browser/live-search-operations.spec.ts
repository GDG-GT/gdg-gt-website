import { test, expect } from "./public-fixture";
import { newsletterFixture } from "./operations-records";

test("audit search updates without submitting and retains input focus", async ({ page, fixture }) => {
  fixture.authenticated = true;
  await page.goto("/admin/audit-log");
  for (const [label, key, value] of [["Search actions or record types", "q", "members"], ["Exact action", "action", "members.created"]]) {
    const input = page.getByRole("searchbox", { name: label, exact: false });
    const requested = page.waitForRequest(request => {
      const url = new URL(request.url());
      return url.pathname === "/api/v1/admin/audit" && url.searchParams.get(key) === value;
    });
    await input.fill(value);
    await requested;
    await expect(input).toBeFocused();
  }
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.writes).toEqual([]);
});

test("points member search fetches matches as typed", async ({ page, fixture }) => {
  fixture.authenticated = true;
  await page.route("**/api/v1/admin/rewards**", route => route.fulfill({ json: { data: {
    members: [], total: 0, rules: [], activities: [], perks: [], credentials: [], ledger: [], claims: [], walletAvailable: false,
  } } }));
  await page.goto("/admin/rewards");
  const input = page.getByRole("textbox", { name: "Find a community member", exact: true });
  const requested = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === "/api/v1/admin/rewards" && url.searchParams.get("q") === "anish";
  });
  await input.fill("anish");
  await requested;
  await expect(input).toBeFocused();
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.writes).toEqual([]);
});

test("newsletter recipient search updates without saving the campaign", async ({ page, fixture }) => {
  fixture.authenticated = true;
  const newsletters = newsletterFixture();
  await page.route("**/api/v1/admin/newsletter/**", route => route.request().method() === "GET"
    ? route.fulfill({ json: { data: newsletters.response(new URL(route.request().url()).pathname.replace("/api/v1", "")) } })
    : route.fallback());
  await page.goto("/admin/newsletter");
  await page.getByRole("combobox", { name: "Scope", exact: true }).selectOption("chapter");
  await page.getByRole("button", { name: "Write campaign", exact: true }).click();
  await page.getByRole("combobox", { name: "Audience", exact: true }).selectOption("custom");
  const input = page.getByRole("textbox", { name: "Find subscribers", exact: true });
  const requested = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === "/api/v1/admin/newsletter/subscribers" && url.searchParams.get("q") === "anish";
  });
  await input.fill("anish");
  await requested;
  await expect(input).toBeFocused();
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.writes).toEqual([]);
});
