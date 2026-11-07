import { test, expect, fictionalBuilderForm } from "./public-fixture";
import { newsletterFixture } from "./operations-records";
import { captureSecondaryComposition as capture } from "./composition-capture";

const rowId = "fbbf0000-0000-4000-8000-000000000002";
const recordedAt = "2026-11-05T12:00:00Z";
const states = [
  "CMS copy editor",
  "CMS publication review",
  "newsletter campaign table",
  "private link delivery table",
  "response inventory keyboard",
] as const;

for (const state of states) {
  test(`remaining-table ${state} preserves readable content and keyboard scrolling`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    fixture.formBuilder = true;
    const settings = { ...fictionalBuilderForm.settings, access: "invited" };
    const form = {
      ...fictionalBuilderForm,
      status: "Open",
      settings,
      actions: ["view", "edit", "publish", "manage_access", "view_responses"],
      versions: [
        {
          ...fictionalBuilderForm,
          settings,
          version: 1,
          versionId: rowId,
          publishedAt: recordedAt,
        },
      ],
    };
    const root = "/admin/forms/" + form.id;
    const row = {
      id: rowId,
      revision: 1,
      is_active: false,
      deleted_at: null,
      updated_at: recordedAt,
      page_slug: "home",
      section_key: "hero",
      order_index: 0,
      content: {
        title: "Fictional approved heading",
        description:
          "Fictional chapter introduction for the saved public-copy review.",
      },
      actions: ["update", "publish", "delete"],
    };
    const newsletter = newsletterFixture();
    const errors: string[] = [],
      writes: string[] = [],
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
              message: "Read-only fictional table review",
            },
          },
        });
      }
      const reply = (data: unknown) => route.fulfill({ json: { data } });
      if (p === "/admin/site-content/pages/capabilities")
        return reply({ actions: ["create", "update", "publish", "delete"] });
      if (
        p === "/admin/site-content/pages" ||
        p === "/admin/site-content/pages/" + rowId
      )
        return reply({ items: [row], total: 1, page: 1, pageSize: 30 });
      if (p.startsWith("/admin/newsletter"))
        return reply(newsletter.response(p + url.search));
      if (p === root) return reply({ form });
      if (
        [
          "/collaborators",
          "/collaborator-candidates",
          "/views",
          "/exports",
        ].some((suffix) => p === root + suffix)
      )
        return reply({ items: [], total: 0, page: 1, pageSize: 30 });
      if (p === root + "/invitations")
        return reply({
          items: [
            {
              id: rowId,
              token_type: "invited",
              revision: 1,
              recipientHint: "fi…@example.test",
              responded: false,
              revoked_at: null,
              expires_at: "2099-11-05T12:00:00Z",
              last_sent_at: recordedAt,
              delivery_state: "sent",
            },
          ],
          total: 1,
          page: 1,
          pageSize: 30,
        });
      if (p === root + "/responses")
        return reply({
          items: [
            {
              id: rowId,
              formId: form.id,
              version: 1,
              revision: 1,
              submittedAt: recordedAt,
              status: "complete",
              respondent: {
                name: "Fictional table respondent",
                email: "fictional-table@example.test",
                source: "self_reported",
              },
              answers: { [form.fields[0].id]: "Fictional answer" },
            },
          ],
          total: 1,
          page: 1,
          pageSize: 30,
        });
      if (p.startsWith(root + "/")) {
        unexpected.push(p);
        return route.fulfill({
          status: 404,
          json: { error: { code: "NOT_FOUND" } },
        });
      }
      return route.fallback();
    });
    const cms = state.startsWith("CMS"),
      links = state === "private link delivery table";
    await page.goto(
      cms
        ? "/admin/content"
        : state === "newsletter campaign table"
          ? "/admin/newsletter"
          : root + (links ? "/edit" : "/responses"),
    );
    if (links) {
      if (info.project.name.includes("mobile"))
        await page
          .getByRole("button", { name: "Settings", exact: true })
          .click();
      await page.getByRole("tab", { name: "Access", exact: true }).click();
      await expect(
        page.getByText("fi…@example.test", { exact: true }),
      ).toBeVisible();
      if (info.project.name.includes("mobile")) {
        const dialog = page.getByRole("dialog", {
          name: "Form access",
          exact: true,
        });
        expect(
          await dialog.evaluate((node) => {
            const rect = node.getBoundingClientRect();
            return (
              rect.left >= 0 &&
              rect.right <= innerWidth &&
              node.scrollWidth <= node.clientWidth
            );
          }),
        ).toBe(true);
      }
    }
    const name = cms
      ? "Page copy records"
      : state === "newsletter campaign table"
        ? "Newsletter campaigns records"
        : links
          ? "Private link delivery records"
          : "Response inventory table";
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
    if (cms) {
      await page
        .getByRole("button", {
          name:
            (state === "CMS copy editor" ? "Edit " : "Publish ") +
            "home / hero",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", {
          name:
            state === "CMS copy editor"
              ? "Edit home / hero"
              : "Publish approved content?",
          exact: true,
        }),
      ).toBeVisible();
    }
    if (state === "response inventory keyboard") {
      const checkbox = region.getByRole("checkbox").last();
      await checkbox.focus();
      await checkbox.press("Space");
      await expect(checkbox).toBeChecked();
    }
    await capture(page, info, state);
    expect(errors).toEqual([]);
    expect(writes).toEqual([]);
    expect(unexpected).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
}
