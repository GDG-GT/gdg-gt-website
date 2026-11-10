import {
  test,
  expect,
  accessibility,
  fictionalMailEvent,
} from "./public-fixture";
import type { Page } from "@playwright/test";
import type {
  IntegrationCandidate,
  FormReference,
  IntegrationReceipt,
} from "../../src/ui/forms/form-integration-api";
const formId = "f1290000-0000-4000-8000-000000000002",
  referenceId = "f1290000-0000-4000-8000-000000000003",
  versionId = "f1290000-0000-4000-8000-000000000004";
const candidate: IntegrationCandidate = {
  id: formId,
  title: "Fictional published target " + "LongName".repeat(10),
  formRevision: 3,
  publishedVersionId: versionId,
  version: 1,
  access: "internal",
};
async function setup(
  page: Page,
  action: "create" | "replace" | "remove",
  loss: "before" | "after",
) {
  const resourceId = fictionalMailEvent.id,
    root = "/admin/form-integrations/event/" + resourceId;
  let rows: FormReference[] =
    action === "create"
      ? []
      : [
          {
            id: referenceId,
            slot: "primary",
            formId,
            label: "FictionalExisting" + "R".repeat(60),
            title: candidate.title,
            href: "/forms/fictional-linked-form",
            revision: 2,
            versionPolicy: "latest_published",
          },
        ];
  const receipts = new Map<string, IntegrationReceipt>(),
    op = {
      lost: false,
      commits: 0,
      deny: false,
      stale: false,
      failCandidates: false,
      targetUnavailable: false,
      readOnly: false,
      candidateCalls: 0,
      paged: false,
      attempts: [] as { key: string; body: string }[],
    };
  await page.route("**/api/v1/admin/form-integrations/**", async (route) => {
    const r = route.request(),
      u = new URL(r.url()),
      p = u.pathname.replace("/api/v1", ""),
      key = r.headers()["idempotency-key"],
      slot = p.endsWith("/recovery")
        ? p.split("/").at(-2)!
        : p.split("/").at(-1)!,
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
                        ? "Fictional integration authority revoked."
                        : "Fictional published-form inventory outage.",
                  },
                },
        });
    if (r.method() === "GET") {
      if (p === root)
        return reply({
          kind: "event",
          resourceId,
          canEdit: !op.readOnly,
          canLink: !op.readOnly,
          items: op.readOnly
            ? rows.map((row) => ({ ...row, title: null, href: null }))
            : rows,
        });
      if (p === root + "/candidates") {
        op.candidateCalls++;
        if (op.failCandidates && !u.searchParams.has("selected"))
          return reply(null, 503);
        const selected = u.searchParams.get("selected"),
          page = Number(u.searchParams.get("page") || 1),
          pageSize = Number(u.searchParams.get("pageSize") || 30),
          all = op.paged
            ? Array.from({ length: 65 }, (_, i) => ({
                ...candidate,
                id:
                  i === 64
                    ? formId
                    : "f1290000-0000-4000-8000-" +
                      String(1000 + i).padStart(12, "0"),
                title:
                  i === 64
                    ? candidate.title
                    : "Fictional candidate " + String(i).padStart(3, "0"),
              }))
            : [candidate],
          filtered = selected
            ? op.targetUnavailable
              ? []
              : all.filter((f) => f.id === selected)
            : all;
        return reply({
          kind: "event",
          resourceId,
          items: filtered.slice((page - 1) * pageSize, page * pageSize),
          total: filtered.length,
          page,
          pageSize,
        });
      }
      if (p.endsWith("/recovery")) {
        if (op.deny) return reply(null, 404);
        const action = u.searchParams.get("action"),
          sourceId = u.searchParams.get("sourceId"),
          targetId = u.searchParams.get("targetId"),
          row = rows.find((row) => row.slot === slot);
        return reply({
          kind: "event",
          resourceId,
          slot,
          sourceId,
          action,
          committed: receipts.has(key),
          canRetry: !receipts.has(key) && !op.stale,
          reference: row
            ? {
                id: op.stale ? "f1290000-0000-4000-8000-000000000099" : row.id,
                revision: row.revision,
              }
            : null,
          target: targetId
            ? {
                id: targetId,
                formRevision: candidate.formRevision,
                publishedVersionId: versionId,
              }
            : null,
          receipt: receipts.get(key) || null,
        });
      }
      return route.fallback();
    }
    const body = JSON.parse(r.postData() || "{}");
    op.attempts.push({ key, body: JSON.stringify(body) });
    if (!op.lost && loss === "before") {
      op.lost = true;
      return route.abort("connectionfailed");
    }
    if (!receipts.has(key)) {
      expect(body.revision).toBe(action === "create" ? 0 : 2);
      expect(body.referenceId).toBe(action === "create" ? null : referenceId);
      if (action !== "remove") {
        expect(body.formId).toBe(formId);
        expect(body.formRevision).toBe(3);
        expect(body.publishedVersionId).toBe(versionId);
      }
      const id = body.referenceId || referenceId;
      op.commits++;
      receipts.set(key, {
        kind: "event",
        resourceId,
        slot,
        sourceId: body.referenceId,
        action: action === "remove" ? "remove" : "save",
        id,
      });
      rows =
        action === "remove"
          ? rows.filter((r) => r.slot !== slot)
          : [
              {
                id,
                slot,
                formId,
                label: body.label,
                title: candidate.title,
                href: "/forms/fictional-linked-form",
                revision: body.revision + 1,
                versionPolicy: "latest_published",
              },
            ];
    }
    if (!op.lost && loss === "after") {
      op.lost = true;
      return route.abort("connectionfailed");
    }
    return reply(receipts.get(key));
  });
  return { root, op };
}
async function open(page: Page) {
  await page.goto("/admin/events");
  await page
    .getByRole("row")
    .filter({ hasText: fictionalMailEvent.title })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByRole("button", { name: "Linked forms", exact: true }).click();
  return page.getByRole("dialog", { name: "Linked forms", exact: true });
}
async function dispatch(
  dialog: ReturnType<Page["locator"]>,
  action: "create" | "replace" | "remove",
) {
  if (action === "create") {
    await dialog
      .getByRole("combobox", { name: "Published form" })
      .selectOption(formId);
    await dialog
      .getByRole("button", { name: "Review new link", exact: true })
      .click();
  } else if (action === "replace") {
    await dialog
      .getByRole("button", { name: "Edit link", exact: true })
      .click();
    await dialog
      .getByLabel("Link label", { exact: false })
      .fill("Reviewed link " + "E".repeat(55));
    await dialog
      .getByRole("button", { name: "Review link changes", exact: true })
      .click();
  } else
    await dialog
      .getByRole("button", { name: "Remove link", exact: true })
      .click();
  await dialog
    .getByRole("button", {
      name: action === "remove" ? "Confirm removal" : "Confirm form link",
      exact: true,
    })
    .click();
  return dialog.getByRole("region", {
    name: "Unconfirmed linked form change",
    exact: true,
  });
}
for (const action of ["create", "replace", "remove"] as const)
  for (const loss of ["before", "after"] as const)
    test(`first-party integration ${action} recovers ${loss}-acceptance loss with original target/generation`, async ({
      page,
      fixture,
    }, info) => {
      fixture.authenticated = true;
      fixture.eventMail = true;
      const { op } = await setup(page, action, loss),
        errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.name));
      const dialog = await open(page),
        recovery = await dispatch(dialog, action);
      await expect(recovery).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Close", exact: true }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(recovery).toBeVisible();
      expect(await accessibility(page)).toEqual([]);
      await recovery.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath("integration-" + action + "-" + loss + ".png"),
        animations: "disabled",
      });
      await recovery
        .getByRole("button", {
          name: "Check original linked form outcome",
          exact: true,
        })
        .click();
      if (loss === "before") {
        await expect(
          recovery.getByText(/No committed receipt was found/),
        ).toBeVisible();
        await recovery
          .getByRole("button", {
            name: "Retry identical linked form change",
            exact: true,
          })
          .click();
      }
      await expect(recovery).toHaveCount(0);
      await expect(
        dialog.getByText(/Linked-form change confirmed/),
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
  test(`first-party integration recovery blocks ${denied ? "revoked source and clears parent" : "a recreated link record"}`, async ({
    page,
    fixture,
  }) => {
    fixture.authenticated = true;
    fixture.eventMail = true;
    const { op } = await setup(page, "remove", "before"),
      dialog = await open(page),
      recovery = await dispatch(dialog, "remove");
    await expect(recovery).toBeVisible();
    op.deny = denied;
    op.stale = !denied;
    await recovery
      .getByRole("button", {
        name: "Check original linked form outcome",
        exact: true,
      })
      .click();
    if (denied) {
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name: "Event access needs to be rechecked",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Event title", { exact: false }),
      ).toHaveCount(0);
    } else {
      await expect(
        recovery.getByText(/target is no longer ready/),
      ).toBeVisible();
      await expect(
        recovery.getByRole("button", {
          name: "Retry identical linked form change",
          exact: true,
        }),
      ).toBeDisabled();
    }
    expect(op.commits).toBe(0);
    expect(op.attempts).toHaveLength(1);
    expect(fixture.unexpected).toEqual([]);
    expect(await accessibility(page)).toEqual([]);
  });
test("first-party candidate paging reaches the 65th authorized publication", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  fixture.eventMail = true;
  const { op } = await setup(page, "create", "before");
  op.paged = true;
  const dialog = await open(page);
  await dialog.getByRole("button", { name: "Next forms", exact: true }).click();
  await expect(
    dialog.getByText("Form page 2 · 65 matching", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Next forms", exact: true }).click();
  await expect(
    dialog.getByText("Form page 3 · 65 matching", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "Published form" })
    .selectOption(formId);
  await expect(
    dialog.getByRole("button", { name: "Review new link", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Previous forms", exact: true })
    .click();
  await expect(
    dialog.getByRole("combobox", { name: "Published form" }),
  ).toHaveValue(formId);
  expect(op.attempts).toHaveLength(0);
  expect(fixture.unexpected).toEqual([]);
  expect(await accessibility(page)).toEqual([]);
});
test("first-party candidate outage preserves link inventory and independent removal review", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  fixture.eventMail = true;
  const { op } = await setup(page, "replace", "before"),
    dialog = await open(page);
  op.failCandidates = true;
  await dialog.getByRole("textbox", { name: "Find a published form", exact: false }).fill("Fictional");
  await expect(
    dialog.getByText("Fictional published-form inventory outage.", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Remove link", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Confirm removal", exact: true }),
  ).toBeEnabled();
  expect(op.attempts).toHaveLength(0);
  expect(fixture.unexpected).toEqual([]);
  expect(await accessibility(page)).toEqual([]);
});
test("view-only event readers can inspect restricted links without candidate or mutation access", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  fixture.eventMail = true;
  const { op } = await setup(page, "replace", "before");
  op.readOnly = true;
  await page.route("**/api/v1/admin/events/" + fictionalMailEvent.id, (route) =>
    route.fulfill({
      json: { data: { event: { ...fictionalMailEvent, actions: ["read"] } } },
    }),
  );
  const dialog = await open(page);
  await expect(
    dialog.getByText("Form details restricted · latest published version", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Edit link", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  expect(op.candidateCalls).toBe(0);
  expect(op.attempts).toHaveLength(0);
  expect(fixture.unexpected).toEqual([]);
  expect(await accessibility(page)).toEqual([]);
});

test("independent empty target read clears cached private metadata and prevents linking", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  fixture.eventMail = true;
  const { op } = await setup(page, "replace", "before"),
    dialog = await open(page);
  await dialog.getByRole("button", { name: "Edit link", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Review link changes", exact: true }),
  ).toBeEnabled();
  op.targetUnavailable = true;
  await dialog
    .getByRole("button", { name: "Recheck linked form access", exact: true })
    .click();
  await expect(
    dialog.getByText(/The selected form is no longer available/),
  ).toBeVisible();
  await expect(
    dialog.getByRole("option", { name: candidate.title, exact: false }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText(candidate.title + " · latest published version", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("link", { name: "Open respondent page" }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText("FictionalExisting" + "R".repeat(60), { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("combobox", { name: "Published form" }),
  ).toHaveValue(formId);
  await expect(
    dialog.getByRole("button", { name: "Review link changes", exact: true }),
  ).toBeDisabled();
  expect(op.attempts).toHaveLength(0);
  expect(fixture.unexpected).toEqual([]);
  expect(await accessibility(page)).toEqual([]);
});
