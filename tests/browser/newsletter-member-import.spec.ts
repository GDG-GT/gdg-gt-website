import { test, expect, accessibility } from "./public-fixture";
import { newsletterFixture } from "./operations-records";

test("imports consented members once and makes the full audience available", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const candidates = Array.from({ length: 42 }, (_, i) => ({
    id: `f1510000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    name: `Fictional Member ${i + 1}`,
    email: `fictional-${i + 1}@example.test`,
    status: i === 0 ? "subscribed" : "new",
  }));
  const newsletters = newsletterFixture(),
    writes: { key: string; body: unknown }[] = [];
  let imported = false;
  await page.route("**/api/v1/admin/newsletter/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace("/api/v1", "");
    if (path === "/admin/newsletter/member-import") {
      if (req.method() === "GET")
        return route.fulfill({
          json: {
            data: {
              items: [
                ...candidates,
                {
                  id: "f1510000-0000-4000-8000-999999999999",
                  name: "Fictional Optout",
                  email: "optout@example.test",
                  status: "excluded",
                },
              ],
            },
          },
        });
      writes.push({
        key: req.headers()["idempotency-key"],
        body: req.postDataJSON(),
      });
      if (writes.length === 1)
        return route.fulfill({
          status: 503,
          json: {
            error: {
              code: "TEMPORARILY_UNAVAILABLE",
              message: "Fictional interrupted import response",
            },
          },
        });
      imported = true;
      return route.fulfill({
        json: {
          data: {
            selected: 42,
            created: 41,
            activated: 0,
            existing: 1,
            excluded: 0,
            emailsQueued: 0,
          },
        },
      });
    }
    if (req.method() !== "GET") return route.fallback();
    if (path === "/admin/newsletter/subscribers" && imported)
      return route.fulfill({
        json: {
          data: {
            items: candidates.map((c) => ({
              ...c,
              teamId: null,
              state: "active",
              revision: 1,
              deletedAt: null,
              actions: ["read", "update", "delete"],
              createdAt: "2026-11-10T00:00:00Z",
              updatedAt: "2026-11-10T00:00:00Z",
            })),
            total: 42,
            pageSize: 50,
            page: 1,
          },
        },
      });
    return route.fulfill({
      json: { data: newsletters.response(path + url.search) },
    });
  });
  await page.goto("/admin/newsletter");
  await page.getByRole("button", { name: "Subscribers", exact: true }).click();
  await page
    .getByRole("button", { name: "Add community members", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Select all 42 members" }).click();
  await expect(
    dialog.getByRole("checkbox", { name: /Fictional Optout/ }),
  ).toBeDisabled();
  await dialog
    .getByLabel("How was consent collected?", { exact: false })
    .fill("Chapter lead confirmed existing member newsletter consent");
  await dialog
    .getByRole("checkbox", {
      name: "These members have agreed to receive chapter newsletters.",
    })
    .check();
  expect(await accessibility(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("member-subscription-review.png"),
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Add 42 members", exact: true })
    .click();
  await expect(
    dialog.getByText("Fictional interrupted import response", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByLabel("How was consent collected?", { exact: false }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Retry import", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("41 members added. 1 already subscribed.", { exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
  expect((writes[0].body as { memberIds: string[] }).memberIds).toHaveLength(
    42,
  );
  await page.getByRole("button", { name: "Campaigns", exact: true }).click();
  await page
    .getByRole("button", { name: "Write campaign", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Audience", exact: true }).selectOption("custom");
  await expect(
    page.locator(".gt-newsletter-audience input[type=checkbox]"),
  ).toHaveCount(42);
  expect(fixture.writes).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
