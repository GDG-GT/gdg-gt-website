import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
import type { Page, TestInfo } from "@playwright/test";
const peer = "f1250000-0000-4000-8000-000000000002",
  generation = "f1250000-0000-4000-8000-000000000003";
async function setup(
  page: Page,
  action: "save" | "remove",
  loss: "before" | "after",
) {
  const form = {
      ...fictionalBuilderForm,
      status: "Draft",
      settings: { ...fictionalBuilderForm.settings, access: "internal" },
      actions: ["view", "edit", "manage_access", "view_responses"],
      versions: [],
    },
    root = "/admin/forms/" + form.id,
    base = root + "/collaborators";
  let grant =
    action === "remove"
      ? { id: generation, revision: 2, actions: ["view"] }
      : null;
  const receipts = new Map<
      string,
      { formId: string; userId: string; action: string }
    >(),
    state = {
      commits: 0,
      lost: false,
      deny: false,
      stale: false,
      failCandidates: false,
      attempts: [] as { body: string; key: string }[],
    };
  const snapshot = (key: string) => ({
    committed: receipts.has(key),
    canRetry: !receipts.has(key),
    formId: form.id,
    userId: peer,
    formRevision: form.revision,
    canSave: true,
    canRemove: !!grant,
    allowedActions: form.actions,
    grant,
    receipt: receipts.get(key) || null,
  });
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
                        ? "Fictional access revoked."
                        : "Fictional candidate outage.",
                  },
                },
        });
    if (r.method() === "GET") {
      if (p === base + "/recovery") {
        if (state.deny) return reply(null, 404);
        if (state.stale)
          grant = {
            id: "f1250000-0000-4000-8000-000000000004",
            revision: 1,
            actions: ["view"],
          };
        return reply(snapshot(key));
      }
      if (p === root) return reply({ form });
      if (p === base)
        return reply({
          items: grant
            ? [
                {
                  admin_user_id: peer,
                  display_name: "Fictional collaborator",
                  actions: grant.actions,
                  grantId: grant.id,
                  grantRevision: grant.revision,
                  updated_at: "2026-11-05T12:00:00Z",
                },
              ]
            : [],
          total: grant ? 1 : 0,
          page: 1,
          pageSize: 30,
        });
      if (p === root + "/collaborator-candidates")
        return reply(
          {
            items: [
              {
                id: peer,
                display_name: "Fictional eligible account",
                role: "team_member",
                actions: grant?.actions || [],
                grantId: grant?.id || null,
                grantRevision: grant?.revision || 0,
              },
            ],
            total: 1,
            page: 1,
            pageSize: 30,
          },
          state.failCandidates ? 503 : 200,
        );
      if (p === root + "/invitations")
        return reply({ items: [], total: 0, page: 1, pageSize: 30 });
      return route.fallback();
    }
    if (p !== base || !["PATCH", "DELETE"].includes(r.method()))
      return route.fallback();
    const body = JSON.parse(r.postData() || "{}");
    state.attempts.push({ body: JSON.stringify(body), key });
    if (!state.lost && loss === "before") {
      state.lost = true;
      return route.abort("connectionfailed");
    }
    if (!receipts.has(key)) {
      expect(body.formRevision).toBe(form.revision);
      expect(body.userId).toBe(peer);
      expect(body.grantId).toBe(grant?.id || null);
      expect(body.grantRevision).toBe(grant?.revision || 0);
      grant =
        r.method() === "DELETE"
          ? null
          : {
              id: generation,
              revision: (grant?.revision || 0) + 1,
              actions: body.actions,
            };
      state.commits++;
      receipts.set(key, { formId: form.id, userId: peer, action });
    }
    if (!state.lost && loss === "after") {
      state.lost = true;
      return route.abort("connectionfailed");
    }
    return reply(snapshot(key));
  });
  return { form, root, state };
}
async function open(page: Page, info: TestInfo) {
  if (info.project.name.includes("mobile"))
    await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Access", exact: true }).click();
  return info.project.name.includes("mobile")
    ? page.getByRole("dialog", { name: "Form access", exact: true })
    : page.getByRole("tabpanel", { name: "Access", exact: true });
}
for (const action of ["save", "remove"] as const)
  for (const loss of ["before", "after"] as const)
    test(`collaborator ${action} recovers ${loss}-acceptance loss using original grant generation`, async ({
      page,
      fixture,
    }, info) => {
      fixture.authenticated = true;
      fixture.formBuilder = true;
      const { root, state } = await setup(page, action, loss),
        errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.name));
      await page.goto(root + "/edit");
      const panel = await open(page, info),
        name =
          action === "save"
            ? "Save collaborator access"
            : "Remove collaborator";
      if (action === "save") {
        await panel
          .getByRole("combobox", { name: "Chapter account" })
          .selectOption(peer);
        await panel
          .getByRole("checkbox", { name: "Edit draft", exact: true })
          .check();
      }
      await panel.getByRole("button", { name, exact: true }).click();
      const dialog = page.getByRole("dialog").filter({
        has: page.getByRole("heading", { name: name + "?", exact: true }),
      });
      await dialog.getByRole("button", { name, exact: true }).click();
      const recovery = panel.getByRole("region", {
        name: "Unconfirmed collaborator change",
      });
      await expect(recovery).toBeVisible();
      await expect(
        page.getByRole("tab", { name: "Settings", exact: true }),
      ).toBeDisabled();
      if (info.project.name.includes("mobile")) {
        await expect(
          panel.getByRole("button", { name: "Close", exact: true }),
        ).toBeDisabled();
        await page.keyboard.press("Escape");
        await expect(panel).toBeVisible();
        await expect(recovery).toBeVisible();
      }

      expect(state.attempts).toHaveLength(1);
      expect(await accessibility(page)).toEqual([]);
      await recovery.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath("grant-" + action + "-" + loss + ".png"),
        animations: "disabled",
      });
      await recovery
        .getByRole("button", {
          name: "Check original collaborator outcome",
          exact: true,
        })
        .click();
      if (loss === "before") {
        await expect(
          recovery.getByText(/No committed receipt was found/),
        ).toBeVisible();
        await recovery
          .getByRole("button", {
            name: "Retry identical collaborator change",
            exact: true,
          })
          .click();
      }
      await expect(recovery).toHaveCount(0);
      await expect(
        panel.getByText(/Collaborator change confirmed/),
      ).toBeVisible();
      expect(state.commits).toBe(1);
      expect(state.attempts).toHaveLength(loss === "before" ? 2 : 1);
      if (loss === "before")
        expect(state.attempts[1]).toEqual(state.attempts[0]);
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
  test(`collaborator recovery blocks ${denied ? "revoked access and clears private records" : "a deleted-and-recreated grant"}`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    fixture.formBuilder = true;
    const { root, state } = await setup(page, "remove", "before");
    await page.goto(root + "/edit");
    const panel = await open(page, info);
    await panel
      .getByRole("button", { name: "Remove collaborator", exact: true })
      .click();
    const dialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", {
        name: "Remove collaborator?",
        exact: true,
      }),
    });
    await dialog
      .getByRole("button", { name: "Remove collaborator", exact: true })
      .click();
    const recovery = panel.getByRole("region", {
      name: "Unconfirmed collaborator change",
    });
    await expect(recovery).toBeVisible();
    state.deny = denied;
    state.stale = !denied;
    await recovery
      .getByRole("button", {
        name: "Check original collaborator outcome",
        exact: true,
      })
      .click();
    if (denied) {
      await expect(
        panel.getByText("Access management is restricted", { exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByText("Fictional collaborator", { exact: true }),
      ).toHaveCount(0);
      await expect(recovery).toHaveCount(0);
    } else {
      await expect(
        recovery.getByText(/target is no longer ready/),
      ).toBeVisible();
      await expect(
        recovery.getByRole("button", {
          name: "Retry identical collaborator change",
          exact: true,
        }),
      ).toBeDisabled();
    }
    expect(state.commits).toBe(0);
    expect(state.attempts).toHaveLength(1);
    expect(await accessibility(page)).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
