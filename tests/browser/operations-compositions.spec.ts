import { test, expect, accessibility } from "./public-fixture";
import {
  financeFixture,
  mediaFixture,
  projectFixture,
  linktreeFixture,
  newsletterFixture,
} from "./operations-records";
const finance = financeFixture(),
  media = mediaFixture(),
  project = projectFixture(),
  linktree = linktreeFixture(),
  newsletter = newsletterFixture();
const surfaces = [
  {
    name: "finance requests",
    route: "/admin/finances",
    text: finance.record.description,
  },
  {
    name: "finance detail",
    route: "/admin/finances?request=" + finance.id,
    text: finance.record.description,
  },
  {
    name: "finance budgets",
    route: "/admin/finances?tab=budgets",
    text: finance.budget.name,
  },
  { name: "media library", route: "/admin/media", text: media.file.name },
  {
    name: "private projects",
    route: "/admin/projects?project=" + project.id,
    text: project.project.description,
  },
  {
    name: "linktree management",
    route: "/admin/linktree?profile=" + linktree.id,
    text: linktree.profile().displayName,
  },
  {
    name: "newsletter campaigns",
    route: "/admin/newsletter",
    text: newsletter.record.subject!,
  },
];
for (const surface of surfaces)
  test(`populated ${surface.name} supports reading scrolling and accessible controls`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    const writes: string[] = [],
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(
      "**/api/v1/admin/{finances,budgets,media,projects,linktree,newsletter}**",
      (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          path = url.pathname.slice("/api/v1".length) + url.search;
        if (request.method() !== "GET") {
          writes.push(request.method() + " " + url.pathname);
          return route.fulfill({
            status: 403,
            json: {
              error: {
                code: "FORBIDDEN",
                message: "Fictional composition writes disabled",
              },
            },
          });
        }
        const response =
          path.startsWith("/admin/finances") ||
          path.startsWith("/admin/budgets")
            ? finance.response(path)
            : path.startsWith("/admin/media")
              ? media.response(path)
              : path.startsWith("/admin/projects")
                ? project.response(path)
                : path.startsWith("/admin/linktree")
                  ? linktree.response(path)
                  : newsletter.response(path);
        return route.fulfill({ json: { data: response } });
      },
    );
    await page.goto(surface.route);
    await expect(
      page.getByText(surface.text, { exact: true }).first(),
    ).toBeVisible();
    await expect(page.locator("#workspace-content h1")).toHaveCount(1);
    expect(await accessibility(page)).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(
        "populated-" + surface.name.replaceAll(" ", "-") + ".png",
      ),
      fullPage: true,
      animations: "disabled",
    });
    await info.attach(surface.name, {
      path: info.outputPath(
        "populated-" + surface.name.replaceAll(" ", "-") + ".png",
      ),
      contentType: "image/png",
    });
    const tall = await page.evaluate(
      () => document.documentElement.scrollHeight > innerHeight,
    );
    if (tall) {
      await page.evaluate(() => window.scrollTo(0, 500));
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    }
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
