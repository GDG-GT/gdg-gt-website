import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
for (const action of ["create", "replace", "remove"] as const)
  for (const loss of ["before", "after"] as const) {
    test(`saved view ${action} recovers ${loss}-acceptance loss with original revision`, async ({
      page,
      fixture,
    }, info) => {
      fixture.authenticated = true;
      const form = {
          ...fictionalBuilderForm,
          actions: ["view", "view_responses"],
          versions: [],
        },
        root = "/admin/forms/" + form.id,
        base = root + "/views",
        id = "fbbb0000-0000-4000-8000-000000000017",
        name = "Fictional saved preferences",
        attempts: { key: string; body: string }[] = [],
        receipts = new Map<
          string,
          {
            id: string;
            formId: string;
            sourceId: string | null;
            action: string;
          }
        >(),
        errors: string[] = [];
      let row: {
          id: string;
          name: string;
          revision: number;
          filters: Record<string, string>;
          columns: string[];
        } | null =
          action === "create"
            ? null
            : { id, name, revision: 2, filters: {}, columns: [] },
        lost = false,
        commits = 0;
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/v1/admin/forms/**", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          path = url.pathname.replace("/api/v1", ""),
          method = request.method(),
          reply = (data: unknown) =>
            route.fulfill({ status: 200, json: { data } });
        if (method === "GET") {
          if (path === root) return reply({ form });
          if (path === root + "/responses")
            return reply({ items: [], total: 0, page: 1, pageSize: 30 });
          if (path === base)
            return reply({
              items: row ? [row] : [],
              total: row ? 1 : 0,
              page: 1,
              pageSize: 30,
            });
          if (
            path ===
            base + (action === "create" ? "" : "/" + id) + "/recovery"
          ) {
            const receipt = receipts.get(request.headers()["idempotency-key"]);
            return reply({
              committed: !!receipt,
              canRetry: !receipt,
              ...(receipt ? { receipt } : {}),
              view: row,
            });
          }
          return route.fallback();
        }
        if (
          path !== base + (action === "create" ? "" : "/" + id) ||
          method !==
            (action === "create"
              ? "POST"
              : action === "replace"
                ? "PATCH"
                : "DELETE")
        )
          return route.fallback();
        const key = request.headers()["idempotency-key"],
          body = request.postData() || "";
        attempts.push({ key, body });
        if (!lost && loss === "before") {
          lost = true;
          return route.abort("connectionfailed");
        }
        if (!receipts.has(key)) {
          const document = JSON.parse(body);
          row =
            action === "remove"
              ? null
              : {
                  id,
                  name: document.name,
                  filters: document.filters,
                  columns: document.columns,
                  revision: action === "create" ? 1 : 3,
                };
          commits++;
          receipts.set(key, {
            id,
            formId: form.id,
            sourceId: action === "create" ? null : id,
            action,
          });
        }
        if (!lost && loss === "after") {
          lost = true;
          return route.abort("connectionfailed");
        }
        return reply({
          committed: true,
          canRetry: false,
          receipt: receipts.get(key),
          view: row,
        });
      });
      await page.goto(root + "/responses");
      if (action === "create") {
        await page.getByLabel("New view name", { exact: false }).fill(name);
        await page
          .getByRole("button", { name: "Save view", exact: true })
          .click();
      } else {
        await page
          .getByRole("combobox", { name: /^Saved view/ })
          .selectOption(id);
        await page
          .getByRole("button", {
            name:
              action === "replace"
                ? "Replace selected view"
                : "Remove selected view",
            exact: true,
          })
          .click();
      }
      const dialog = page.getByRole("dialog");
      expect(attempts).toHaveLength(0);
      await dialog
        .getByRole("button", {
          name:
            action === "create"
              ? "Confirm new view"
              : action === "replace"
                ? "Confirm replacement"
                : "Confirm removal",
          exact: true,
        })
        .click();
      const recovery = dialog.getByRole("region", {
        name: "Unconfirmed saved view change",
        exact: true,
      });
      await expect(recovery).toBeVisible();
      expect(attempts).toHaveLength(1);
      expect(JSON.parse(attempts[0].body)).toEqual(
        action === "remove"
          ? { revision: 2 }
          : {
              name,
              filters: {},
              columns: [],
              ...(action === "replace" ? { revision: 2 } : {}),
            },
      );
      await expect(
        recovery.getByRole("button", {
          name: "Retry identical saved view change",
          exact: true,
        }),
      ).toBeDisabled();
      expect(await accessibility(page)).toEqual([]);
      await recovery.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath("saved-view-" + action + "-" + loss + ".png"),
        fullPage: false,
        animations: "disabled",
      });
      await recovery
        .getByRole("button", {
          name: "Check original saved view outcome",
          exact: true,
        })
        .click();
      if (loss === "before") {
        await expect(
          recovery.getByText(/No committed receipt was found/),
        ).toBeVisible();
        await recovery
          .getByRole("button", {
            name: "Retry identical saved view change",
            exact: true,
          })
          .click();
      }
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByText("Original saved view " + action + " confirmed.", {
          exact: true,
        }),
      ).toBeVisible();
      expect(attempts).toHaveLength(loss === "before" ? 2 : 1);
      if (loss === "before") expect(attempts[1]).toEqual(attempts[0]);
      expect(commits).toBe(1);
      expect(fixture.writes).toEqual([]);
      expect(fixture.unexpected).toEqual([]);
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }
test("saved view inventory pages and searches beyond the former 100-row ceiling", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const form = {
      ...fictionalBuilderForm,
      actions: ["view", "view_responses"],
      versions: [],
    },
    root = "/admin/forms/" + form.id;
  await page.route("**/api/v1/admin/forms/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace("/api/v1", ""),
      reply = (data: unknown) => route.fulfill({ status: 200, json: { data } });
    if (request.method() !== "GET") return route.fallback();
    if (path === root) return reply({ form });
    if (path === root + "/responses")
      return reply({ items: [], total: 0, page: 1, pageSize: 30 });
    if (path === root + "/views") {
      const n = Number(url.searchParams.get("page") || 1);
      return reply({
        items: Array.from({ length: n === 5 ? 5 : 30 }, (_, index) => ({
          id: "fictional-view-" + ((n - 1) * 30 + index + 1),
          name:
            "Fictional saved view " +
            String((n - 1) * 30 + index + 1).padStart(3, "0"),
          revision: 1,
          filters: {},
          columns: [],
        })),
        total: 125,
        page: n,
        pageSize: 30,
      });
    }
    return route.fallback();
  });
  await page.goto(root + "/responses");
  await expect(
    page.getByText("Saved views page 1 of 5 · 125 matching", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Search saved views", { exact: false })
    .fill("Fictional saved");
  for (let n = 2; n <= 5; n++) {
    await expect(
      page.getByRole("button", { name: "Next saved views", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Next saved views", exact: true })
      .click();
    await expect(
      page.getByText("Saved views page " + n + " of 5 · 125 matching", {
        exact: true,
      }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("option", { name: "Fictional saved view 125", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Next saved views", exact: true }),
  ).toBeDisabled();
  expect(await accessibility(page)).toEqual([]);
  expect(fixture.writes).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
