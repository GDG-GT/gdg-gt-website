import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
import { mediaFixture } from "./operations-records";
import { captureSecondaryComposition as capture } from "./composition-capture";
import { newField } from "../../shared/forms";

for (const state of [
  "form library keyboard",
  "media inventory keyboard",
  "editorial inventory keyboard",
  "answer grid keyboard",
] as const) {
  test(`inventory ${state} allows keyboard scrolling and native controls`, async ({
    page,
    fixture,
  }, info) => {
    const publicGrid = state === "answer grid keyboard";
    fixture.authenticated = !publicGrid;
    fixture.formLibrary = !publicGrid;
    const media = mediaFixture();
    const grid = {
      ...newField("likert", fictionalBuilderForm.sections[0].id),
      id: "fictional-grid-keyboard",
      label: "Fictional workshop feedback",
      options: ["Accessible demos", "Practical examples"],
      optionIds: ["fictional-grid-row-1", "fictional-grid-row-2"],
      columns: [
        "Strongly disagree",
        "Somewhat disagree",
        "Neither agree nor disagree",
        "Somewhat agree",
        "Strongly agree",
      ],
      columnIds: Array.from(
        { length: 5 },
        (_, index) => `fictional-grid-column-${index + 1}`,
      ),
      required: false,
    };
    const form = {
      ...fictionalBuilderForm,
      status: "Open",
      fields: [...fictionalBuilderForm.fields, grid],
    };
    const writes: string[] = [],
      errors: string[] = [],
      unexpected: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/**", (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        p = url.pathname.replace("/api/v1", "");
      if (["/auth/realtime-token", "/realtime/token"].includes(p))
        return route.fallback();
      if (request.method() !== "GET") {
        writes.push(request.method() + " " + p);
        return route.fulfill({
          status: 403,
          json: {
            error: {
              code: "FORBIDDEN",
              message: "Read-only fictional inventory review",
            },
          },
        });
      }
      const reply = (data: unknown) => route.fulfill({ json: { data } });
      if (p.startsWith("/admin/media"))
        return reply(media.response(p + url.search));
      if (p === "/admin/blog/capabilities")
        return reply({
          admin: true,
          editor: false,
          globalCreate: true,
          teams: [],
          editors: [],
        });
      if (p === "/admin/blog/categories")
        return reply({ items: [], total: 0, pageSize: 30 });
      if (p === "/admin/blog/posts")
        return reply({
          items: [
            {
              id: "fbbf0000-0000-4000-8000-000000000003",
              revision: 1,
              reference: "BLOG-FICTIONAL",
              title: "Fictional internal article",
              status: "draft",
              approval_status: "draft",
              actions: ["read", "update"],
              author_name: "Fictional writer",
            },
          ],
          total: 1,
          pageSize: 30,
        });
      if (p.startsWith("/admin/blog/")) {
        unexpected.push(p);
        return route.fulfill({
          status: 404,
          json: { error: { code: "NOT_FOUND" } },
        });
      }
      if (p === "/forms/" + form.slug)
        return reply({ form: { ...form, copyAvailable: true } });
      return route.fallback();
    });
    await page.goto(
      publicGrid
        ? "/forms/" + form.slug
        : state === "form library keyboard"
          ? "/admin/forms"
          : state === "media inventory keyboard"
            ? "/admin/media"
            : "/admin/blog",
    );
    const name = publicGrid
      ? grid.label + " answer grid"
      : state === "form library keyboard"
        ? "Form inventory table"
        : state === "media inventory keyboard"
          ? "Media inventory, scroll horizontally for all columns"
          : "Articles inventory";
    const region = page.getByRole("region", { name, exact: true });
    await expect(region).toBeVisible();
    await region.focus();
    await expect(region).toBeFocused();
    const overflowing = await region.evaluate(
      (node) => node.scrollWidth > node.clientWidth,
    );
    if (info.project.name.includes("mobile")) expect(overflowing).toBe(true);
    if (overflowing) {
      await region.press("End");
      await expect
        .poll(() => region.evaluate((node) => node.scrollLeft))
        .toBeGreaterThan(0);
      await region.press("Home");
      await expect
        .poll(() => region.evaluate((node) => node.scrollLeft))
        .toBe(0);
    }
    if (publicGrid) {
      const first = region.getByRole("radio", {
        name: "Accessible demos: Strongly disagree",
        exact: true,
      });
      const second = region.getByRole("radio", {
        name: "Accessible demos: Somewhat disagree",
        exact: true,
      });
      await first.focus();
      await first.press("Space");
      await expect(first).toBeChecked();
      await first.press("ArrowRight");
      await expect(second).toBeChecked();
      await expect(second).toBeFocused();
      await page.evaluate(() => document.fonts.ready);
      expect(await accessibility(page)).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      const path = info.outputPath("answer-grid-keyboard.png");
      await page.screenshot({ path, fullPage: true, animations: "disabled" });
      await info.attach(state, { path, contentType: "image/png" });
    } else await capture(page, info, state);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    expect(unexpected).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
}
