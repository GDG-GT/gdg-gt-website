import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
for (const action of ["delete", "redact"] as const)
  for (const loss of ["before", "after"] as const) {
    test(`response ${action} recovers ${loss}-acceptance loss without retaining private answers`, async ({
      page,
      fixture,
    }, info) => {
      fixture.authenticated = true;
      const form = {
          ...fictionalBuilderForm,
          status: "Open",
          actions: ["view", "view_responses", "delete"],
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
          id: "fbbb0000-0000-4000-8000-000000000016",
          formId: form.id,
          version: 1,
          revision: 2,
          status: "complete",
          redacted: false,
          submittedAt: "2026-11-05T12:00:00Z",
          respondent: {
            name: "Fictional Private Respondent",
            email: "fictional-private@example.test",
            source: "self_reported",
          },
          answers: { [form.fields[0].id]: "Fictional stored private answer" },
        },
        target = root + "/responses/" + row.id,
        state = {
          lost: false,
          commits: 0,
          attempts: [] as { key: string; body: string }[],
          metadata: {
            id: row.id,
            revision: 2,
            status: "complete",
            redacted: false,
            deleted: false,
          },
        },
        receipts = new Map<
          string,
          { body: string; id: string; formId: string; action: string }
        >(),
        errors: string[] = [];
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
            return reply({
              items: state.metadata.deleted
                ? []
                : [
                    {
                      ...row,
                      ...state.metadata,
                      ...(state.metadata.redacted
                        ? { respondent: undefined, answers: {} }
                        : {}),
                    },
                  ],
              total: state.metadata.deleted ? 0 : 1,
              page: 1,
              pageSize: 30,
            });
          if (path === root + "/views") return reply({ items: [] });
          if (path === root + "/privacy") return reply({ held: false });
          if (path === target + "/history") return reply({ items: [] });
          if (path === target + "/recovery") {
            const receipt = receipts.get(request.headers()["idempotency-key"]);
            return reply({
              committed: !!receipt,
              canRetry: !receipt,
              held: false,
              response: state.metadata,
              ...(receipt
                ? {
                    receipt: {
                      id: receipt.id,
                      formId: receipt.formId,
                      action: receipt.action,
                    },
                  }
                : {}),
            });
          }
          return route.fallback();
        }
        if (
          path !== target ||
          method !== (action === "delete" ? "DELETE" : "PATCH")
        )
          return route.fallback();
        const key = request.headers()["idempotency-key"],
          body = request.postData() || "";
        state.attempts.push({ key, body });
        if (!state.lost && loss === "before") {
          state.lost = true;
          return route.abort("connectionfailed");
        }
        const previous = receipts.get(key);
        if (previous && previous.body !== body)
          throw Error("Original response intent changed");
        if (!previous) {
          state.commits++;
          state.metadata = {
            ...state.metadata,
            status: action === "delete" ? "deleted" : "redacted",
            redacted: action === "redact",
            deleted: action === "delete",
          };
          receipts.set(key, { body, id: row.id, formId: form.id, action });
        }
        if (!state.lost && loss === "after") {
          state.lost = true;
          return route.abort("connectionfailed");
        }
        const receipt = receipts.get(key)!;
        return reply({
          committed: true,
          canRetry: false,
          receipt: {
            id: receipt.id,
            formId: receipt.formId,
            action: receipt.action,
          },
          response: state.metadata,
        });
      });
      await page.goto(root + "/responses");
      await page
        .getByRole("button", { name: "Open response " + row.id, exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByText("Fictional stored private answer", { exact: true }),
      ).toBeVisible();
      await dialog
        .getByRole("button", {
          name: action === "delete" ? "Delete response" : "Redact identity",
          exact: true,
        })
        .click();
      await expect(
        dialog.getByRole("button", { name: "Confirm " + action, exact: true }),
      ).toBeDisabled();
      await dialog
        .getByLabel("Confirm response action", { exact: false })
        .fill(action.toUpperCase());
      await dialog
        .getByRole("button", { name: "Confirm " + action, exact: true })
        .click();
      const recovery = dialog.getByRole("region", {
        name: "Unconfirmed response action",
        exact: true,
      });
      await expect(recovery).toBeVisible();
      await expect(
        dialog.getByText("Fictional stored private answer", { exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog.getByText("fictional-private@example.test", { exact: true }),
      ).toHaveCount(0);
      await expect(
        recovery.getByRole("button", {
          name: "Retry identical response action",
          exact: true,
        }),
      ).toBeDisabled();
      expect(state.attempts).toHaveLength(1);
      expect(state.attempts[0].body).not.toContain("fictional-private");
      expect(await accessibility(page)).toEqual([]);
      await recovery.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath("response-" + action + "-" + loss + ".png"),
        fullPage: false,
        animations: "disabled",
      });
      await recovery
        .getByRole("button", {
          name: "Check original response outcome",
          exact: true,
        })
        .click();
      if (loss === "before") {
        await expect(
          recovery.getByText(/No committed receipt was found/),
        ).toBeVisible();
        await recovery
          .getByRole("button", {
            name: "Retry identical response action",
            exact: true,
          })
          .click();
      }
      await expect(dialog).toHaveCount(0);
      expect(state.attempts).toHaveLength(loss === "before" ? 2 : 1);
      if (loss === "before")
        expect(state.attempts[1]).toEqual(state.attempts[0]);
      expect(state.commits).toBe(1);
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
