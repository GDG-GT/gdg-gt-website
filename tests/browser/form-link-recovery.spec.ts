import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
import type { Page, TestInfo } from "@playwright/test";
import type {
  PrivateFormLink,
  LinkAction,
  LinkReceipt,
} from "../../src/ui/forms/form-link-api";
const linkId = "f1280000-0000-4000-8000-000000000002",
  versionId = "f1280000-0000-4000-8000-000000000003";
async function setup(page: Page, action: LinkAction, loss: "before" | "after") {
  const form = {
      ...fictionalBuilderForm,
      status: "Open",
      settings: { ...fictionalBuilderForm.settings, access: "invited" },
      actions: ["view", "edit", "publish", "manage_access", "view_responses"],
      versions: [
        {
          version: 1,
          versionId,
          title: fictionalBuilderForm.title,
          description: fictionalBuilderForm.description,
          fields: fictionalBuilderForm.fields,
          sections: fictionalBuilderForm.sections,
          settings: { ...fictionalBuilderForm.settings, access: "invited" },
          publishedAt: "2026-11-05T12:00:00Z",
        },
      ],
    },
    root = "/admin/forms/" + form.id,
    path = root + "/invitations";
  let rows: PrivateFormLink[] =
    action === "create"
      ? []
      : [
          {
            id: linkId,
            token_type: "invited",
            revision: 2,
            recipientHint: "fi…@example.test",
            responded: false,
            revoked_at: null,
            expires_at: "2099-11-05T12:00:00Z",
            last_sent_at: null,
            delivery_state: "sent",
          },
        ];
  const op = {
      lost: false,
      commits: 0,
      deny: false,
      stale: false,
      failRead: false,
      attempts: [] as { key: string; body: string }[],
    },
    receipts = new Map<string, LinkReceipt>();
  await page.route("**/api/v1/admin/forms/**", async (route) => {
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
                        ? "Fictional link authority revoked."
                        : "Fictional private-link inventory outage.",
                  },
                },
        });
    if (r.method() === "GET") {
      if (p === root) return reply({ form });
      if (
        p === root + "/collaborators" ||
        p === root + "/collaborator-candidates"
      )
        return reply({ items: [], total: 0, page: 1, pageSize: 30 });
      if (p === path)
        return reply(
          { items: rows, total: rows.length, page: 1, pageSize: 30 },
          op.failRead ? 503 : 200,
        );
      if (p === path + "/recovery") {
        if (op.deny) return reply(null, 404);
        const sourceId = u.searchParams.get("sourceId"),
          target = rows.find((row) => row.id === sourceId);
        return reply({
          formId: form.id,
          sourceId,
          action: u.searchParams.get("action"),
          committed: receipts.has(key),
          canRetry: !receipts.has(key) && !op.stale,
          formRevision: form.revision,
          publishedVersionId: versionId,
          accessType: "invited",
          archived: false,
          target: target
            ? {
                id: target.id,
                revision: op.stale ? target.revision + 1 : target.revision,
                type: target.token_type,
                responded: target.responded,
                revoked: !!target.revoked_at,
                expiresAt: target.expires_at,
                cooldownUntil: null,
              }
            : null,
          receipt: receipts.get(key) || null,
        });
      }
      return route.fallback();
    }
    if (p !== path && p !== path + "/" + linkId) return route.fallback();
    const body = JSON.parse(r.postData() || "{}");
    op.attempts.push({ key, body: JSON.stringify(body) });
    if (!op.lost && loss === "before") {
      op.lost = true;
      return route.abort("connectionfailed");
    }
    if (!receipts.has(key)) {
      expect(body.formRevision).toBe(form.revision);
      expect(body.publishedVersionId).toBe(versionId);
      if (action !== "create") expect(body.revision).toBe(2);
      const receipt = {
        formId: form.id,
        sourceId: action === "create" ? null : linkId,
        action,
        queued: action === "revoke" ? 0 : 1,
        existing: 0,
        total: 1,
      };
      receipts.set(key, receipt);
      op.commits++;
      if (action === "create")
        rows = [
          {
            id: linkId,
            token_type: "invited",
            revision: 1,
            recipientHint: "ap…@example.test",
            responded: false,
            revoked_at: null,
            expires_at: body.expiresAt,
            last_sent_at: null,
            delivery_state: "pending",
          },
        ];
      else
        rows = rows.map((row) => ({
          ...row,
          revision: 3,
          ...(action === "revoke"
            ? { revoked_at: "2026-11-05T12:00:00Z", delivery_state: "revoked" }
            : {
                expires_at: body.expiresAt,
                last_sent_at: "2026-11-05T12:00:00Z",
                delivery_state: "pending",
              }),
        }));
    }
    if (!op.lost && loss === "after") {
      op.lost = true;
      return route.abort("connectionfailed");
    }
    return reply(receipts.get(key));
  });
  return { form, root, op };
}
async function open(page: Page, info: TestInfo) {
  if (info.project.name.includes("mobile"))
    await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Access", exact: true }).click();
  return info.project.name.includes("mobile")
    ? page.getByRole("dialog", { name: "Form access", exact: true })
    : page.getByRole("tabpanel", { name: "Access", exact: true });
}
async function dispatch(
  page: Page,
  panel: ReturnType<Page["locator"]>,
  action: LinkAction,
) {
  if (action === "create") {
    await panel
      .getByLabel("Approved recipient emails", { exact: false })
      .fill("approved-fictional@example.test");
    await panel
      .getByRole("checkbox", { name: /I approve these recipients/ })
      .check();
    await panel
      .getByRole("button", { name: "Review private links", exact: true })
      .click();
  } else
    await panel
      .getByRole("button", {
        name: action === "resend" ? "Resend" : "Revoke",
        exact: true,
      })
      .click();
  const dialog = page.getByRole("dialog", {
    name:
      action === "create"
        ? "Queue private access links?"
        : action === "resend"
          ? "Replace access link?"
          : "Revoke access link?",
    exact: true,
  });
  await dialog
    .getByRole("button", {
      name:
        action === "create"
          ? "Queue approved private links"
          : action === "resend"
            ? "Replace access link"
            : "Revoke access link",
      exact: true,
    })
    .click();
  return panel.getByRole("region", {
    name: "Unconfirmed private link change",
    exact: true,
  });
}
for (const action of ["create", "resend", "revoke"] as const)
  for (const loss of ["before", "after"] as const)
    test(`private-link ${action} recovers ${loss}-acceptance loss with original audience/version/expiry`, async ({
      page,
      fixture,
    }, info) => {
      fixture.authenticated = true;
      fixture.formBuilder = true;
      const { root, op } = await setup(page, action, loss),
        errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.name));
      await page.goto(root + "/edit");
      const panel = await open(page, info),
        recovery = await dispatch(page, panel, action);
      await expect(recovery).toBeVisible();
      await expect(
        page.getByRole("tab", { name: "Settings", exact: true }),
      ).toBeDisabled();
      if (info.project.name.includes("mobile")) {
        await expect(
          panel.getByRole("button", { name: "Close", exact: true }),
        ).toBeDisabled();
        await page.keyboard.press("Escape");
        await expect(recovery).toBeVisible();
      }
      expect(await accessibility(page)).toEqual([]);
      await recovery.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath("private-link-" + action + "-" + loss + ".png"),
        animations: "disabled",
      });
      expect(op.attempts).toHaveLength(1);
      await recovery
        .getByRole("button", {
          name: "Check original private link outcome",
          exact: true,
        })
        .click();
      if (loss === "before") {
        await expect(
          recovery.getByText(/No committed receipt was found/),
        ).toBeVisible();
        await recovery
          .getByRole("button", {
            name: "Retry identical private link change",
            exact: true,
          })
          .click();
      }
      await expect(recovery).toHaveCount(0);
      await expect(
        panel.getByText(/Private-link request confirmed/),
      ).toBeVisible();
      expect(op.commits).toBe(1);
      expect(op.attempts).toHaveLength(loss === "before" ? 2 : 1);
      if (loss === "before") expect(op.attempts[1]).toEqual(op.attempts[0]);
      expect(errors).toEqual([]);
      expect(fixture.writes).toEqual([]);
      expect(fixture.unexpected).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
for (const denied of [false, true])
  test(`private-link recovery blocks ${denied ? "revoked authority and clears audience" : "a changed selected link"}`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    fixture.formBuilder = true;
    const { root, op } = await setup(page, "resend", "before");
    await page.goto(root + "/edit");
    const panel = await open(page, info),
      recovery = await dispatch(page, panel, "resend");
    await expect(recovery).toBeVisible();
    op.deny = denied;
    op.stale = !denied;
    await recovery
      .getByRole("button", {
        name: "Check original private link outcome",
        exact: true,
      })
      .click();
    if (denied) {
      await expect(
        panel.getByText("Access management is restricted", { exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByText("fi…@example.test", { exact: true }),
      ).toHaveCount(0);
      await expect(recovery).toHaveCount(0);
    } else {
      await expect(
        recovery.getByText(/target is no longer ready/),
      ).toBeVisible();
      await expect(
        recovery.getByRole("button", {
          name: "Retry identical private link change",
          exact: true,
        }),
      ).toBeDisabled();
    }
    expect(op.commits).toBe(0);
    expect(op.attempts).toHaveLength(1);
    expect(await accessibility(page)).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
test("private-link inventory outage retains approved audience and pauses confirmation", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  fixture.formBuilder = true;
  const { root, op } = await setup(page, "create", "before");
  await page.goto(root + "/edit");
  const panel = await open(page, info);
  await panel
    .getByLabel("Approved recipient emails", { exact: false })
    .fill("retained-fictional@example.test");
  op.failRead = true;
  await panel
    .getByRole("button", { name: "Refresh delivery status", exact: true })
    .click();
  await expect(
    panel.getByText("Fictional private-link inventory outage.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    panel.getByLabel("Approved recipient emails", { exact: false }),
  ).toHaveValue("retained-fictional@example.test");
  await panel
    .getByRole("checkbox", { name: /I approve these recipients/ })
    .check();
  await expect(
    panel.getByRole("button", { name: "Review private links", exact: true }),
  ).toBeDisabled();
  op.failRead = false;
  await panel
    .getByRole("button", { name: "Retry private links", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Review private links", exact: true }),
  ).toBeEnabled();
  expect(op.attempts).toHaveLength(0);
  expect(await accessibility(page)).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
