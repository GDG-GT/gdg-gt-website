import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
import type { Page } from "@playwright/test";
const reviewId = "f1260000-0000-4000-8000-000000000002",
  expires = "2026-11-05T12:05:00Z";
async function setup(page: Page, loss: "before" | "after") {
  const form = {
      ...fictionalBuilderForm,
      status: "Archived",
      actions: ["view", "edit", "delete", "manage_access", "view_responses"],
      versions: [],
    },
    root = "/admin/forms/" + form.id,
    path = root + "/permanent-deletion";
  const state = {
    formId: form.id,
    revision: form.revision,
    archived: true,
    purged: false,
    formHeld: false,
    heldResponses: 0,
    unexpiredResponses: 0,
    retainedResponses: 2,
    activeReferences: 0,
    drafts: 1,
    filesAwaitingCleanup: 0,
    exportsAwaitingCleanup: 0,
    activeExports: 0,
    publishedVersions: 0,
  };
  const op = {
      lost: false,
      commits: 0,
      deny: false,
      changed: false,
      failRead: false,
      failReview: false,
      attempts: [] as { key: string; body: string; proof: string }[],
    },
    receipts = new Set<string>();
  await page.route("**/api/v1/admin/forms**", async (route) => {
    const r = route.request(),
      u = new URL(r.url()),
      p = u.pathname.replace("/api/v1", ""),
      key = r.headers()["idempotency-key"],
      reply = (data: unknown, status = 200) =>
        route.fulfill({
          status,
          json:
            status === 200
              ? { data }
              : {
                  error: {
                    code: status === 404 ? "NOT_FOUND" : "UNAVAILABLE",
                    message:
                      status === 404
                        ? "Fictional deletion access revoked."
                        : "Fictional eligibility interruption.",
                  },
                },
        });
    if (r.method() === "GET") {
      if (p === "/admin/forms")
        return reply({
          items: state.purged ? [] : [form],
          total: state.purged ? 0 : 1,
          canCreate: true,
          page: 1,
          pageSize: 30,
        });
      if (p === root + "/deletion-review")
        return reply(state, op.failRead ? 503 : 200);
      if (p === path + "/recovery")
        return op.deny
          ? reply(null, 404)
          : reply({
              formId: form.id,
              reviewId,
              committed: receipts.has(key),
              canRetry: !receipts.has(key) && !op.changed,
              revision: op.changed ? state.revision + 1 : state.revision,
              reviewExpiresAt: receipts.has(key) ? null : expires,
              receipt: receipts.has(key)
                ? { formId: form.id, reviewId, deleted: true }
                : null,
            });
      return route.fallback();
    }
    if (p === root + "/deletion-review" && r.method() === "POST")
      return op.failReview
        ? reply(null, 503)
        : reply({
            reviewId,
            reviewToken: "fictional-private-review-capability",
            expiresAt: expires,
            state: { ...state },
          });
    if (p !== path || r.method() !== "POST") return route.fallback();
    const { currentPassword, ...body } = JSON.parse(r.postData() || "{}");
    op.attempts.push({
      key,
      body: JSON.stringify(body),
      proof: currentPassword,
    });
    if (!op.lost && loss === "before") {
      op.lost = true;
      return route.abort("connectionfailed");
    }
    if (!receipts.has(key)) {
      expect(body.revision).toBe(form.revision);
      expect(body.reviewId).toBe(reviewId);
      expect(body.exportWarningAcknowledged).toBe(true);
      expect(body.confirmation).toBe("DELETE FORM " + form.id);
      op.commits++;
      state.revision++;
      state.purged = true;
      receipts.add(key);
    }
    if (!op.lost && loss === "after") {
      op.lost = true;
      return route.abort("connectionfailed");
    }
    return reply({ formId: form.id, reviewId, deleted: true });
  });
  return { form, root, op };
}
async function open(page: Page, title: string) {
  await page
    .getByRole("button", { name: "Actions for " + title, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete form…", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Permanent form deletion",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Review permanent deletion", exact: true })
    .click();
  return dialog;
}
for (const loss of ["before", "after"] as const)
  test(`permanent deletion recovers ${loss}-acceptance loss without repeating irreversible work`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    const { form, op } = await setup(page, loss),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.name));
    await page.goto("/admin/forms");
    const dialog = await open(page, form.title);
    await dialog
      .getByRole("checkbox", { name: /I have exported anything/ })
      .check();
    await dialog
      .getByLabel("Deletion confirmation", { exact: false })
      .fill(form.title);
    await dialog
      .getByLabel("Current password", { exact: true })
      .fill("fictional-original-proof");
    await dialog
      .getByRole("button", {
        name: "Permanently delete this form",
        exact: true,
      })
      .click();
    const recovery = dialog.getByRole("region", {
      name: "Unconfirmed permanent deletion change",
    });
    await expect(recovery).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Close", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(recovery).toBeVisible();
    expect(await accessibility(page)).toEqual([]);
    await recovery.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath("permanent-deletion-" + loss + ".png"),
      animations: "disabled",
    });
    await recovery
      .getByRole("button", {
        name: "Check original permanent deletion outcome",
        exact: true,
      })
      .click();
    if (loss === "before") {
      await expect(
        recovery.getByText(/No committed receipt was found/),
      ).toBeVisible();
      await expect(
        recovery.getByRole("button", {
          name: "Retry identical permanent deletion change",
          exact: true,
        }),
      ).toBeDisabled();
      await recovery
        .getByLabel("Current password for identical deletion retry", {
          exact: false,
        })
        .fill("fictional-fresh-proof");
      await recovery
        .getByRole("button", {
          name: "Retry identical permanent deletion change",
          exact: true,
        })
        .click();
    }
    await expect(dialog).toHaveCount(0);
    expect(op.commits).toBe(1);
    expect(op.attempts).toHaveLength(loss === "before" ? 2 : 1);
    if (loss === "before") {
      expect(op.attempts[1].key).toBe(op.attempts[0].key);
      expect(op.attempts[1].body).toBe(op.attempts[0].body);
      expect(op.attempts[1].proof).toBe("fictional-fresh-proof");
    }
    expect(fixture.writes).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
for (const denied of [false, true])
  test(`permanent deletion recovery blocks ${denied ? "revoked authority and clears counters" : "changed eligibility"}`, async ({
    page,
    fixture,
  }) => {
    fixture.authenticated = true;
    const { form, op } = await setup(page, "before");
    await page.goto("/admin/forms");
    const dialog = await open(page, form.title);
    await dialog
      .getByRole("checkbox", { name: /I have exported anything/ })
      .check();
    await dialog
      .getByLabel("Deletion confirmation", { exact: false })
      .fill(form.title);
    await dialog
      .getByLabel("Current password", { exact: true })
      .fill("fictional-proof");
    await dialog
      .getByRole("button", {
        name: "Permanently delete this form",
        exact: true,
      })
      .click();
    const recovery = dialog.getByRole("region", {
      name: "Unconfirmed permanent deletion change",
    });
    await expect(recovery).toBeVisible();
    op.deny = denied;
    op.changed = !denied;
    await recovery
      .getByRole("button", {
        name: "Check original permanent deletion outcome",
        exact: true,
      })
      .click();
    if (denied) {
      await expect(
        dialog.getByText("Deletion access restricted", { exact: true }),
      ).toBeVisible();
      await expect(dialog.getByText(form.title, { exact: true })).toHaveCount(
        0,
      );
      await expect(recovery).toHaveCount(0);
    } else {
      await expect(
        recovery.getByText(/review expired or the form changed/),
      ).toBeVisible();
      await expect(
        recovery.getByRole("button", {
          name: "Retry identical permanent deletion change",
          exact: true,
        }),
      ).toBeDisabled();
    }
    expect(op.commits).toBe(0);
    expect(op.attempts).toHaveLength(1);
    expect(await accessibility(page)).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
test("deletion capability outage requires explicit eligibility recheck before another review", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const { form, op } = await setup(page, "before");
  op.failReview = true;
  await page.goto("/admin/forms");
  await page
    .getByRole("button", { name: "Actions for " + form.title, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete form…", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Permanent form deletion",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Review permanent deletion", exact: true })
    .click();
  await expect(
    dialog.getByText(/No permanent deletion was requested/),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: "Review permanent deletion",
      exact: true,
    }),
  ).toBeDisabled();
  op.failReview = false;
  await dialog
    .getByRole("button", { name: "Recheck eligibility", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Review permanent deletion",
      exact: true,
    }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Review permanent deletion", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Current password", { exact: true }),
  ).toBeVisible();
  expect(op.commits).toBe(0);
  expect(op.attempts).toHaveLength(0);
  expect(await accessibility(page)).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
