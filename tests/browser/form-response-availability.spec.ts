import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
for (const state of ["Open", "Closed"] as const)
  for (const loss of ["before", "after"] as const) {
    test(`response workspace ${state} availability recovers ${loss}-acceptance loss`, async ({
      page,
      fixture,
    }, info) => {
      fixture.authenticated = true;
      let form = {
        ...fictionalBuilderForm,
        status: state as string,
        actions: ["view", "view_responses", "publish"],
        versions: [
          {
            ...fictionalBuilderForm,
            version: 1,
            publishedAt: "2026-11-05T12:00:00Z",
          },
        ],
      };
      const root = "/admin/forms/" + form.id,
        attempts: { key: string; body: string }[] = [],
        receipts = new Map<string, typeof form>(),
        errors: string[] = [];
      let lost = false,
        commits = 0;
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/v1/admin/forms/**", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          path = url.pathname.replace("/api/v1", ""),
          method = request.method();
        const reply = (data: unknown) =>
          route.fulfill({ status: 200, json: { data } });
        if (method === "GET") {
          if (path === root) return reply({ form });
          if (path === root + "/responses")
            return reply({ items: [], total: 0, page: 1, pageSize: 30 });
          if (path === root + "/views") return reply({ items: [] });
          if (path === "/admin/forms/recovery") {
            const saved = receipts.get(request.headers()["idempotency-key"]);
            return reply({
              committed: !!saved,
              canCreate: false,
              form: saved || form,
            });
          }
          return route.fallback();
        }
        if (path !== root + "/state" || method !== "POST")
          return route.fallback();
        const key = request.headers()["idempotency-key"],
          body = request.postData() || "";
        attempts.push({ key, body });
        if (!lost && loss === "before") {
          lost = true;
          return route.abort("connectionfailed");
        }
        if (!receipts.has(key)) {
          const intent = JSON.parse(body);
          expect(intent.revision).toBe(form.revision);
          form = {
            ...form,
            revision: form.revision! + 1,
            status: intent.state,
          };
          receipts.set(key, structuredClone(form));
          commits++;
        }
        if (!lost && loss === "after") {
          lost = true;
          return route.abort("connectionfailed");
        }
        return reply({ form: receipts.get(key) });
      });
      await page.goto(root + "/responses");
      const label = state === "Open" ? "Close form" : "Reopen form",
        action = state === "Open" ? "close" : "reopen",
        next = state === "Open" ? "Closed" : "Open";
      await page.getByRole("button", { name: label, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("heading", { name: label + "?", exact: true }),
      ).toBeVisible();
      expect(attempts).toHaveLength(0);
      await dialog.getByRole("button", { name: label, exact: true }).click();
      const recovery = dialog.getByRole("region", {
        name: "Unconfirmed form library change",
        exact: true,
      });
      await expect(recovery).toBeVisible();
      expect(attempts).toHaveLength(1);
      expect(JSON.parse(attempts[0].body)).toEqual({
        revision: fictionalBuilderForm.revision,
        state: next,
      });
      expect(await accessibility(page)).toEqual([]);
      await recovery.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath("availability-" + action + "-" + loss + ".png"),
        fullPage: false,
        animations: "disabled",
      });
      await recovery
        .getByRole("button", {
          name: "Recheck original library change",
          exact: true,
        })
        .click();
      if (loss === "before")
        await recovery
          .getByRole("button", {
            name: "Retry this exact " + action + " request",
            exact: true,
          })
          .click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByText(
          "Original availability change confirmed. Current saved state: " +
            next +
            ".",
          { exact: true },
        ),
      ).toBeVisible();
      expect(attempts).toHaveLength(loss === "before" ? 2 : 1);
      if (loss === "before") expect(attempts[1]).toEqual(attempts[0]);
      expect(commits).toBe(1);
      expect(form.versions).toHaveLength(1);
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
