import { test, expect } from "./public-fixture";
import {
  financeFixture,
  mediaFixture,
  projectFixture,
  linktreeFixture,
  newsletterFixture,
} from "./operations-records";
const cases = [
  {
    path: "/admin/forms",
    endpoint: "/admin/forms",
    search: "Search forms",
    loadingText: "Loading your forms…",
  },
  {
    path: "/admin/linktree",
    endpoint: "/admin/linktree/profiles",
    search: "Search link profiles",
  },
  {
    path: "/admin/newsletter",
    endpoint: "/admin/newsletter/campaigns",
    search: "Search campaigns",
    submit: "Search",
    loadingText: "Loading campaigns…",
  },
  {
    path: "/admin/users",
    endpoint: "/admin/users",
    search: "Search account emails",
  },
  { path: "/admin/teams", endpoint: "/admin/teams", search: "Search teams" },
  {
    path: "/admin/resources",
    endpoint: "/admin/content-records/resources",
    search: "Search content",
  },
  {
    path: "/admin/sponsors",
    endpoint: "/admin/content-records/sponsors",
    search: "Search content",
  },
  {
    path: "/admin/projects",
    endpoint: "/admin/projects",
    search: "Search private projects",
  },
  {
    path: "/admin/finances",
    endpoint: "/admin/finances",
    search: "Search finance requests",
  },
  {
    path: "/admin/media",
    endpoint: "/admin/media",
    search: "Search media names and descriptions",
    submit: "Search",
  },
];
for (const c of cases)
  test(`slow search keeps controls usable without an oversized block: ${c.path}`, async ({
    page,
    fixture,
  }) => {
    fixture.authenticated = true;
    fixture.accountReview = true;
    fixture.teamReview = true;
    fixture.formLibrary = true;
    let release!: () => void,
      pending = 0;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const finance = financeFixture(),
      media = mediaFixture(),
      project = projectFixture(),
      linktree = linktreeFixture(),
      newsletter = newsletterFixture();
    const routeBase =
      c.path === "/admin/linktree" || c.path === "/admin/newsletter"
        ? c.path
        : c.endpoint;
    await page.route("**/api/v1" + routeBase + "**", async (route) => {
      const r = route.request(),
        url = new URL(r.url()),
        path = url.pathname.replace("/api/v1", "");
      if (r.method() !== "GET") return route.fallback();
      if (path === c.endpoint && url.searchParams.get("q")) {
        pending++;
        await held;
      }
      if (c.path === "/admin/linktree")
        return route.fulfill({
          json: { data: linktree.response(path + url.search) },
        });
      if (c.path === "/admin/newsletter")
        return route.fulfill({
          json: { data: newsletter.response(path + url.search) },
        });
      if (c.path === "/admin/projects")
        return route.fulfill({
          json: { data: project.response(path + url.search) },
        });
      if (c.path === "/admin/finances")
        return route.fulfill({
          json: { data: finance.response(path + url.search) },
        });
      if (c.path === "/admin/media")
        return route.fulfill({
          json: { data: media.response(path + url.search) },
        });
      if (c.path === "/admin/resources" || c.path === "/admin/sponsors")
        return route.fulfill({
          json: {
            data: path.endsWith("/capabilities")
              ? { globalCreate: true, teams: [] }
              : { items: [], total: 0, pageSize: 30 },
          },
        });
      return route.fallback();
    });
    if (c.path === "/admin/finances") {
      await page.route("**/api/v1/admin/budgets**", async (route) => {
        if (route.request().method() !== "GET") return route.fallback();
        const url = new URL(route.request().url());
        return route.fulfill({
          json: {
            data: finance.response(
              url.pathname.replace("/api/v1", "") + url.search,
            ),
          },
        });
      });
    }
    try {
      await page.goto(c.path);
      const search = page.getByRole("searchbox", {
        name: c.search,
        exact: true,
      });
      await expect(search).toBeVisible();
      const placeholders = page.locator(".gt-admin-body .gt-skeleton");
      await expect(placeholders).toHaveCount(0);
      if (c.loadingText)
        await expect(
          page.getByText(c.loadingText, { exact: true }),
        ).toHaveCount(0);
      await search.scrollIntoViewIfNeeded();
      await search.focus();
      const before = await search.boundingBox();
      await search.fill("fictional");
      if (c.path === "/admin/newsletter") {
        await search.press("Enter");
      } else if (c.submit) {
        await page.getByRole("button", { name: c.submit, exact: true }).click();
        await search.focus();
      }
      await expect.poll(() => pending).toBeGreaterThan(0);
      if (c.loadingText)
        await expect(
          page.getByText(c.loadingText, { exact: true }),
        ).toBeVisible();
      else await expect(placeholders.first()).toBeAttached();
      const during = await search.boundingBox();
      expect(Math.abs(during!.y - before!.y)).toBeLessThanOrEqual(2);
      await expect(search).toBeFocused();
      await expect(search).toHaveValue("fictional");
      for (const placeholder of await placeholders.all())
        expect((await placeholder.boundingBox())!.height).toBeLessThanOrEqual(
          64,
        );
      release();
      if (c.loadingText)
        await expect(
          page.getByText(c.loadingText, { exact: true }),
        ).toHaveCount(0);
      await expect(placeholders).toHaveCount(0);
      await expect(search).toBeFocused();
      expect(fixture.writes).toEqual([]);
      expect(fixture.unexpected).toEqual([]);
    } finally {
      release();
    }
  });
