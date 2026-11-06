import { test, expect, accessibility } from "./public-fixture";
import type { Page } from "@playwright/test";
const id = "f1340000-0000-4000-8000-000000000001",
  seed = {
    id,
    name: "Fictional inquiry sender",
    email: "fictional-inquiry@example.test",
    type: "general",
    message: "Fictional private inquiry for mutation recovery.",
    interests: [],
    status: "new",
    revision: 1,
    createdAt: "2026-11-06T12:00:00Z",
    resolvedAt: null,
    redactedAt: null,
    hold: false,
    holdReason: null,
    attachment: null,
  };
async function setup(page: Page, action: string, loss: "before" | "after") {
  const startupErrors: string[] = [];
  page.on("pageerror", (error) => startupErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.resourceType() === "script")
      startupErrors.push(
        new URL(request.url()).pathname + ": " + request.failure()?.errorText,
      );
  });
  const receipts = new Map<string, unknown>(),
    record = structuredClone(seed),
    state = {
      lost: false,
      commits: 0,
      reads: 0,
      denied: false,
      attempts: [] as { body: string; key: string | undefined }[],
    };
  await page.route("**/api/v1/admin/contact-submissions**", (route) => {
    const r = route.request(),
      url = new URL(r.url()),
      path = url.pathname,
      reply = (data: unknown) => route.fulfill({ json: { data } });
    if (path.endsWith("/recovery")) {
      state.reads++;
      const key = r.headers()["idempotency-key"],
        body = r.postDataJSON();
      expect(key).toBe(state.attempts[0].key);
      const original = { ...JSON.parse(state.attempts[0].body) };
      delete original.currentPassword;
      expect(body).toEqual(original);
      if (state.denied)
        return route.fulfill({
          status: 404,
          json: {
            error: {
              code: "NOT_FOUND",
              message: "Fictional original access unavailable",
            },
          },
        });
      const receipt = receipts.get(key) || null;
      return reply({
        committed: !!receipt,
        canRetry: !receipt,
        currentRevision: receipt ? 2 : 1,
        receipt,
      });
    }
    if (r.method() !== "GET") {
      state.attempts.push({
        body: r.postData()!,
        key: r.headers()["idempotency-key"],
      });
      if (!state.lost && loss === "before") {
        state.lost = true;
        return route.abort("connectionfailed");
      }
      const key = r.headers()["idempotency-key"];
      if (!receipts.has(key)) {
        state.commits++;
        record.revision = 2;
        record.status = action === "status" ? "in_progress" : "new";
        record.hold = action === "hold";
        receipts.set(key, { id, revision: 2, action });
      }
      if (!state.lost && loss === "after") {
        state.lost = true;
        return route.abort("connectionfailed");
      }
      return reply(receipts.get(key));
    }
    return reply({ items: [record], total: 1, page: 1 });
  });
  await page.goto("/admin/communications?tab=contact&contact=" + id);
  try {
    await expect(
      page.getByRole("heading", { name: record.name, exact: true }),
    ).toBeVisible();
  } catch (error) {
    console.info("Inquiry startup diagnostics: " + JSON.stringify(startupErrors));
    throw error;
  }
  expect(startupErrors).toEqual([]);
  if (action === "status") {
    await page
      .getByRole("combobox", { name: "Inquiry status", exact: true })
      .selectOption("in_progress");
    await page
      .getByRole("button", { name: "Save inquiry status", exact: true })
      .click();
  } else {
    await page
      .getByRole("button", { name: "Review retention hold", exact: true })
      .click();
    await page
      .getByLabel("Reason for retention hold *", { exact: true })
      .fill("Frozen original operational hold");
    await page
      .getByLabel("Current password *", { exact: true })
      .fill("Fictional original proof");
    await page
      .getByLabel("Type HOLD CONTACT to confirm *", { exact: true })
      .fill("HOLD CONTACT");
    await page
      .getByRole("button", { name: "Confirm hold change", exact: true })
      .click();
  }
  await expect(
    page.getByRole("region", { name: "Unconfirmed inquiry save", exact: true }),
  ).toBeVisible();
  return state;
}
for (const action of ["status", "hold"])
  for (const loss of ["before", "after"] as const)
    test(`inquiry ${action} ${loss} acceptance loss preserves original fields scope revision key`, async ({
      page,
      fixture,
    }, info) => {
      fixture.authenticated = true;
      const state = await setup(page, action, loss);
      await expect(
        page.getByRole("button", {
          name:
            action === "hold" ? "Confirm hold change" : "Save inquiry status",
          exact: true,
        }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Back to inbox", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", {
          name: "Retry identical inquiry save",
          exact: true,
        }),
      ).toBeDisabled();
      expect(await accessibility(page)).toEqual([]);
      if (loss === "after")
        await page.screenshot({
          path: info.outputPath("inquiry-original-" + action + ".png"),
          fullPage: true,
          animations: "disabled",
        });
      await page
        .getByRole("button", {
          name: "Check original inquiry outcome",
          exact: true,
        })
        .click();
      if (loss === "before") {
        if (action === "hold")
          await page
            .getByLabel("Current password for original inquiry retry *", {
              exact: true,
            })
            .fill("New explicit fictional proof");
        await page
          .getByRole("button", {
            name: "Retry identical inquiry save",
            exact: true,
          })
          .click();
      }
      await expect(
        page.getByRole("region", {
          name: "Unconfirmed inquiry save",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: seed.name, exact: true }),
      ).toBeVisible();
      expect(state.commits).toBe(1);
      expect(state.reads).toBe(1);
      expect(state.attempts).toHaveLength(loss === "before" ? 2 : 1);
      if (loss === "before") {
        const first = JSON.parse(state.attempts[0].body),
          last = JSON.parse(state.attempts[1].body);
        delete first.currentPassword;
        delete last.currentPassword;
        expect(last).toEqual(first);
        expect(state.attempts[1].key).toBe(state.attempts[0].key);
      }
      expect(await accessibility(page)).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(fixture.unexpected).toEqual([]);
    });
test("inquiry original outcome denial clears private proposal instead of creating another record", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page, "status", "before");
  state.denied = true;
  await page
    .getByRole("button", {
      name: "Check original inquiry outcome",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(/Private records and reviews have been cleared/),
  ).toBeVisible();
  await expect(
    page.getByLabel("Reason for retention hold *", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Unconfirmed inquiry save", exact: true }),
  ).toHaveCount(0);
  expect(state.commits).toBe(0);
  expect(state.attempts).toHaveLength(1);
  expect(await accessibility(page)).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
test("inquiry reviewed stopping clears uncertain fields and never sends a replacement", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page, "hold", "after");
  await page
    .getByText("Review stopping inquiry recovery", { exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Stop tracking this inquiry save",
      exact: true,
    })
    .click();
  await expect(page.getByText(/Inquiry recovery stopped/)).toBeVisible();
  await expect(
    page.getByLabel("Reason for retention hold *", { exact: true }),
  ).toHaveCount(0);
  expect(state.commits).toBe(1);
  expect(state.attempts).toHaveLength(1);
  expect(await accessibility(page)).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
