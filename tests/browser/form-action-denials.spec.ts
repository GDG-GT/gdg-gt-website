import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
for (const action of [
  "saved view",
  "availability",
  "response privacy",
] as const)
  test(`denied ${action} clears private URL filters and proposals`, async ({
    page,
    fixture,
  }) => {
    fixture.authenticated = true;
    const form = {
        ...fictionalBuilderForm,
        status: "Open",
        actions: ["view", "view_responses", "publish", "delete"],
        versions: [
          {
            ...fictionalBuilderForm,
            version: 1,
            publishedAt: "2026-11-05T12:00:00Z",
          },
        ],
      },
      root = "/admin/forms/" + form.id,
      row = {
        id: "fbbb0000-0000-4000-8000-000000000018",
        formId: form.id,
        version: 1,
        revision: 2,
        status: "complete",
        redacted: false,
        submittedAt: "2026-11-05T12:00:00Z",
        respondent: {
          name: "Fictional private name",
          email: "fictional-private@example.test",
          source: "self_reported",
        },
        answers: { [form.fields[0].id]: "Fictional private answer" },
      },
      errors: string[] = [];
    let writes = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/v1/admin/forms/**", async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname.replace("/api/v1", ""),
        method = request.method(),
        reply = (data: unknown) =>
          route.fulfill({ status: 200, json: { data } });
      if (method === "GET") {
        if (path === root) return reply({ form });
        if (path === root + "/responses")
          return reply({ items: [row], total: 1, page: 1, pageSize: 30 });
        if (path === root + "/views")
          return reply({ items: [], total: 0, page: 1, pageSize: 30 });
        if (path === root + "/privacy") return reply({ held: false });
        if (path === root + "/responses/" + row.id + "/history")
          return reply({ items: [] });
        return route.fallback();
      }
      const target =
        action === "saved view"
          ? root + "/views"
          : action === "availability"
            ? root + "/state"
            : root + "/responses/" + row.id;
      if (
        path !== target ||
        method !== (action === "response privacy" ? "DELETE" : "POST")
      )
        return route.fallback();
      writes++;
      return route.fulfill({
        status: 403,
        json: {
          error: {
            code: "FORBIDDEN",
            message: "Fictional current action access changed.",
          },
        },
      });
    });
    await page.goto(root + "/responses?q=FictionalPrivateQuery");
    await page
      .getByLabel("New view name", { exact: false })
      .fill("Fictional private proposal");
    if (action === "saved view") {
      await page
        .getByRole("button", { name: "Save view", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm new view", exact: true })
        .click();
    } else if (action === "availability") {
      await page
        .getByRole("button", { name: "Close form", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close form", exact: true })
        .click();
    } else {
      await page
        .getByRole("button", { name: "Open response " + row.id, exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("button", { name: "Delete response", exact: true })
        .click();
      await dialog
        .getByLabel("Confirm response action", { exact: false })
        .fill("DELETE");
      await dialog
        .getByRole("button", { name: "Confirm delete", exact: true })
        .click();
    }
    await expect(
      page.getByRole("heading", {
        name: "Response access needs to be rechecked",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(new URL(page.url()).search).toBe("");
    await expect(
      page.locator('input[value="Fictional private proposal"]'),
    ).toHaveCount(0);
    await expect(
      page.getByText("fictional-private@example.test", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Recheck response workspace access",
        exact: true,
      }),
    ).toBeEnabled();
    expect(writes).toBe(1);
    expect(await accessibility(page)).toEqual([]);
    expect(fixture.writes).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
