import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
import type { Page } from "@playwright/test";
async function exportsFixture(
  page: Page,
  action: "create" | "cancel" | "download",
  loss: "before" | "after",
) {
  const root = "/admin/forms/" + fictionalBuilderForm.id,
    base = root + "/exports",
    jobId = "fbbb0000-0000-4000-8000-000000000015",
    initial = {
      id: jobId,
      format: "csv",
      state: action === "download" ? "ready" : "pending",
      count: 0,
      sensitive: false,
      bytes: action === "download" ? 100 : null,
      errorCode: null,
      createdAt: "2026-11-05T12:00:00Z",
      expiresAt: "2099-11-07T12:00:00Z",
    },
    form = {
      ...fictionalBuilderForm,
      actions: ["view", "view_responses", "export_responses"],
      versions: [],
    },
    state = {
      failRead: false,
      denyRead: false,
      attempts: [] as { action: string; key: string; body: string }[],
      commits: 0,
      downloads: 0,
      lost: false,
      jobs: action === "create" ? ([] as (typeof initial)[]) : [{ ...initial }],
    },
    receipts = new Map<
      string,
      {
        id: string;
        formId: string;
        sourceId: string | null;
        action: string;
        body: string;
      }
    >();
  await page.route("**/api/v1/admin/forms/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace("/api/v1", ""),
      method = request.method();
    const reply = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        json:
          status === 200
            ? { data }
            : {
                error: {
                  code: status === 403 ? "FORBIDDEN" : "UNAVAILABLE",
                  message: "Fictional export inventory interruption.",
                },
              },
      });
    if (method === "GET") {
      if (path === root) return reply({ form });
      if (path === root + "/views") return reply({ items: [] });
      if (path === root + "/responses")
        return reply({ items: [], total: 0, page: 1, pageSize: 30 });
      if (path === base)
        return reply(
          { items: state.jobs },
          state.denyRead ? 403 : state.failRead ? 503 : 200,
        );
      if (path === base + "/recovery") {
        const kind = url.searchParams.get("action"),
          receipt = receipts.get(request.headers()["idempotency-key"]);
        return reply({
          committed: !!receipt,
          canRetry:
            !receipt &&
            (kind === "create" || state.jobs[0]?.state === "pending"),
          job: receipt || kind === "cancel" ? state.jobs[0] : null,
          ...(receipt
            ? {
                receipt: {
                  id: receipt.id,
                  formId: receipt.formId,
                  sourceId: receipt.sourceId,
                  action: receipt.action,
                },
              }
            : {}),
        });
      }
      return route.fallback();
    }
    if (
      path === base + "/" + jobId + "/download" &&
      method === "POST" &&
      action === "download"
    ) {
      state.downloads++;
      return reply({
        url: "https://storage.example.test/form-exports/fictional.csv?signature=fictional",
        expiresIn: 60,
      });
    }
    const kind =
      path === base && method === "POST"
        ? "create"
        : path === base + "/" + jobId && method === "DELETE"
          ? "cancel"
          : "";
    if (!kind || action !== kind) return route.fallback();
    const key = request.headers()["idempotency-key"],
      body = request.postData() || "";
    if (!key) throw Error("Explicit fictional export intent required");
    state.attempts.push({ action: kind, key, body });
    const loseThis = !state.lost;
    if (loseThis && loss === "before") {
      state.lost = true;
      await route.abort("connectionfailed");
      return;
    }
    const previous = receipts.get(key);
    if (previous && previous.body !== body)
      throw Error("Fictional export body changed under original key");
    if (!previous) {
      state.jobs = [
        { ...initial, state: kind === "create" ? "pending" : "cancelled" },
      ];
      state.commits++;
      receipts.set(key, {
        id: jobId,
        formId: form.id,
        sourceId: kind === "cancel" ? jobId : null,
        action: kind,
        body,
      });
    }
    if (loseThis && loss === "after") {
      state.lost = true;
      await route.abort("connectionfailed");
      return;
    }
    return reply({
      job: state.jobs[0],
      ...(kind === "cancel" ? { cancelled: true } : {}),
    });
  });
  return { root, base, state };
}
for (const action of ["create", "cancel"] as const)
  for (const loss of ["before", "after"] as const) {
    test(`export ${action} recovers ${loss}-acceptance response loss with original intent`, async ({
      page,
      fixture,
    }, info) => {
      fixture.authenticated = true;
      const { root, state } = await exportsFixture(page, action, loss),
        errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(root + "/responses");
      const panel = page.getByRole("region", {
        name: "Background response exports",
        exact: true,
      });
      await expect(
        panel.getByRole("button", { name: "Review export", exact: true }),
      ).toBeEnabled();
      if (action === "create") {
        await panel
          .getByRole("button", { name: "Review export", exact: true })
          .click();
        await panel
          .getByRole("button", { name: "Create export", exact: true })
          .click();
      } else {
        await panel.getByRole("button", { name: /Remove export/ }).click();
        await panel
          .getByRole("button", { name: "Confirm removal", exact: true })
          .click();
      }
      await expect(
        panel.getByRole("region", {
          name: "Unconfirmed export change",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        panel.getByRole("button", { name: "Review export", exact: true }),
      ).toBeDisabled();
      await expect(
        panel.getByRole("button", {
          name: "Retry identical export change",
          exact: true,
        }),
      ).toBeDisabled();
      expect(state.attempts).toHaveLength(1);
      expect(state.commits).toBe(loss === "after" ? 1 : 0);
      expect(await accessibility(page)).toEqual([]);
      await panel
        .getByRole("region", { name: "Unconfirmed export change", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath("export-uncertain.png"),
        fullPage: false,
        animations: "disabled",
      });
      await panel
        .getByRole("button", {
          name: "Check original export outcome",
          exact: true,
        })
        .click();
      if (loss === "before") {
        await expect(
          panel.getByText(/No committed receipt was found/),
        ).toBeVisible();
        await panel
          .getByRole("button", {
            name: "Retry identical export change",
            exact: true,
          })
          .click();
      }
      await expect(
        panel.getByText(
          action === "create"
            ? /Original export request confirmed/
            : /Export removal confirmed/,
        ),
      ).toBeVisible();
      expect(state.attempts).toHaveLength(loss === "before" ? 2 : 1);
      expect(state.commits).toBe(1);
      if (loss === "before")
        expect(state.attempts[1]).toEqual(state.attempts[0]);
      await expect(
        panel.getByRole("button", { name: "Review export", exact: true }),
      ).toBeEnabled();
      state.failRead = true;
      await panel
        .getByRole("button", { name: "Refresh exports", exact: true })
        .click();
      await expect(
        panel.getByText("Fictional export inventory interruption.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        panel.getByText(/Last successful export inventory read/),
      ).toBeVisible();
      await expect(
        panel.getByText("CSV · 0 responses", { exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByRole("button", { name: "Review export", exact: true }),
      ).toBeDisabled();
      state.failRead = false;
      state.denyRead = true;
      await panel
        .getByRole("button", { name: "Refresh exports", exact: true })
        .click();
      await expect(
        panel.getByRole("button", {
          name: "Recheck export access",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        panel.getByText("CSV · 0 responses", { exact: true }),
      ).toHaveCount(0);
      state.denyRead = false;
      await panel
        .getByRole("button", { name: "Recheck export access", exact: true })
        .click();
      await expect(
        panel.getByRole("button", { name: "Review export", exact: true }),
      ).toBeEnabled();
      expect(await accessibility(page)).toEqual([]);
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
test("ready export downloads expire before activation without opening a file", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const { root, state } = await exportsFixture(page, "download", "before");
  await page.goto(root + "/responses");
  const panel = page.getByRole("region", {
    name: "Background response exports",
    exact: true,
  });
  await panel.getByRole("button", { name: /Authorize download/ }).click();
  const link = panel.getByRole("link", { name: "Download CSV", exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("export-download.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page.clock.setFixedTime(new Date("2026-11-05T12:02:00Z"));
  await link.dispatchEvent("click");
  await expect(link).toHaveCount(0);
  await expect(
    panel.getByText(/download authorization expired or the connection changed/),
  ).toBeVisible();
  expect(state.downloads).toBe(1);
  expect(state.attempts).toEqual([]);
  expect(page.context().pages()).toHaveLength(1);
  expect(await accessibility(page)).toEqual([]);
  expect(fixture.writes).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
