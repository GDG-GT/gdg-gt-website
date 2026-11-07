import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { createTemplate } from "../shared/forms.ts";
const h = await localHttp(),
  outsider = await localHttp(),
  actor = randomUUID(),
  peer = randomUUID(),
  other = randomUUID(),
  accounts = [actor, peer, other],
  password = "Fictional-grant-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-grant-" + id + "@example.test",
  tests = [],
  forms = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-form-collaborator-recovery/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false;
const checked = (r) => {
  if (r.error)
    throw Error("Owned collaborator fixture database failure " + r.error.code);
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned collaborator fixture API failure " +
        r.status +
        " " +
        r.json?.error?.code,
    );
  return r.json.data;
};
const check = (ok, name) => {
  if (!ok) throw Error(name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
async function login(client, id) {
  data(
    await client.call("/auth/gate", {
      method: "POST",
      body: { code: h.credentials.gateCode },
    }),
  );
  data(
    await client.call("/auth/login", {
      method: "POST",
      body: { email: email(id), password },
    }),
  );
}
await mkdir(output, { recursive: true });
try {
  const hash = await hashSecret(password);
  checked(
    await h.db.from("admin_users").insert(
      accounts.map((id) => ({
        id,
        email: email(id),
        password_hash: hash,
        role: id === actor ? "admin" : "team_member",
        is_active: true,
        display_name:
          id === peer
            ? "Fictional grant target " + marker
            : "Fictional grant officer " + marker,
      })),
    ),
  );
  created = true;
  await login(h, actor);
  await login(outsider, other);
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const draft = createTemplate(
      "Fictional grant " + viewport.width + " " + marker,
      "blank",
    );
    draft.settings.access = "internal";
    draft.settings.receipts = false;
    const source = data(
      await h.call("/admin/forms", {
        method: "POST",
        body: {
          slug: draft.slug,
          definition: {
            title: draft.title,
            description: draft.description,
            fields: draft.fields,
            sections: draft.sections,
            settings: draft.settings,
          },
        },
      }),
    ).form;
    forms.push(source.id);
    const root = "/admin/forms/" + source.id,
      path = root + "/collaborators",
      label = " at " + viewport.width + "×" + viewport.height;
    check(
      (await outsider.call(path)).status === 404 &&
        (await h.call(path, { anonymous: true })).status === 401,
      "grant inventory conceals owned form from unrelated/anonymous readers" +
        label,
    );
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    try {
      for (const [p, body] of [
        ["/auth/gate", { code: h.credentials.gateCode }],
        ["/auth/login", { email: email(actor), password }],
      ]) {
        const r = await context.request.post(h.env.APP_ORIGIN + "/api/v1" + p, {
          headers: { Origin: h.env.APP_ORIGIN },
          data: body,
        });
        if (r.status() !== 200)
          throw Error("Owned browser authentication failed " + r.status());
      }
      const page = await context.newPage(),
        attempts = [],
        unexpected = [],
        errors = [];
      let loss = "";
      page.on("pageerror", (e) => errors.push(e.name));
      await page.route("**/*", async (route) => {
        const r = route.request(),
          u = new URL(r.url()),
          p = u.pathname.replace("/api/v1", "");
        if (u.origin !== h.env.APP_ORIGIN) {
          unexpected.push("external request");
          return route.abort("blockedbyclient");
        }
        if (
          u.pathname.startsWith("/api/v1/") &&
          !["GET", "HEAD"].includes(r.method())
        ) {
          if (["/auth/realtime-token", "/realtime/token"].includes(p))
            return route.fulfill({
              status: 503,
              json: {
                error: {
                  code: "UNAVAILABLE",
                  message: "Realtime paused for owned verification.",
                },
              },
            });
          if (p !== path || !["PATCH", "DELETE"].includes(r.method())) {
            unexpected.push("unexpected mutation");
            return route.abort("blockedbyclient");
          }
          attempts.push({
            key: r.headers()["idempotency-key"],
            body: r.postData(),
            method: r.method(),
          });
          if (loss) {
            const mode = loss;
            loss = "";
            if (mode === "after") {
              const response = await route.fetch();
              if (response.status() !== 200)
                throw Error("Owned grant dispatch failed " + response.status());
            }
            return route.abort("connectionfailed");
          }
        }
        return route.continue();
      });
      await page.goto(h.env.APP_ORIGIN + root + "/edit");
      if (viewport.width === 375)
        await page
          .getByRole("button", { name: "Settings", exact: true })
          .click();
      await page.getByRole("tab", { name: "Access", exact: true }).click();
      const panel =
        viewport.width === 375
          ? page.getByRole("dialog", { name: "Form access", exact: true })
          : page.getByRole("tabpanel", { name: "Access", exact: true });
      for (const position of ["after", "before"])
        for (const action of ["save", "remove"]) {
          if (action === "save") {
            await panel
              .getByLabel("Search eligible accounts", { exact: true })
              .fill("Fictional grant target " + marker);
            const choice = panel.getByRole("combobox", {
              name: "Chapter account",
            });
            await expect(
              choice.locator("option", {
                hasText: "Fictional grant target " + marker,
              }),
            ).toHaveCount(1);
            await choice.selectOption(peer);
            await panel
              .getByRole("checkbox", { name: "Edit draft", exact: true })
              .check();
          }
          const actionName =
            action === "save"
              ? "Save collaborator access"
              : "Remove collaborator";
          await panel
            .getByRole("button", { name: actionName, exact: true })
            .click();
          const dialog = page.getByRole("dialog").filter({
            has: page.getByRole("heading", {
              name: actionName + "?",
              exact: true,
            }),
          });
          await expect(
            dialog.getByRole("button", { name: actionName, exact: true }),
          ).toBeEnabled();
          const auditsBefore = checked(
              await h.db
                .from("admin_actions")
                .select("id")
                .eq("target_id", source.id)
                .in("action", [
                  "forms.collaborator_updated",
                  "forms.collaborator_removed",
                ]),
            ).length,
            start = attempts.length;
          loss = position;
          await dialog
            .getByRole("button", { name: actionName, exact: true })
            .click();
          const recovery = panel.getByRole("region", {
            name: "Unconfirmed collaborator change",
            exact: true,
          });
          await expect(recovery).toBeVisible();
          await expect(
            page.getByRole("tab", { name: "Settings", exact: true }),
          ).toBeDisabled();
          if (viewport.width === 375) {
            await expect(
              panel.getByRole("button", { name: "Close", exact: true }),
            ).toBeDisabled();
            await page.keyboard.press("Escape");
            await expect(panel).toBeVisible();
            await expect(recovery).toBeVisible();
          }

          const original = attempts.at(-1),
            body = JSON.parse(original.body);
          check(
            attempts.length === start + 1 &&
              body.userId === peer &&
              body.formRevision === source.revision &&
              Number.isInteger(body.grantRevision),
            "grant " +
              action +
              " " +
              position +
              " retains original target and reviewed versions" +
              label,
          );
          if (position === "after" && action === "save") {
            await page.addScriptTag({
              path: require.resolve("axe-core/axe.min.js"),
            });
            const violations = await page.evaluate(async () =>
              (
                await window.axe.run(document, {
                  runOnly: {
                    type: "tag",
                    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
                  },
                })
              ).violations.map((v) => v.id),
            );
            check(
              !violations.length,
              "uncertain populated grant review passes measured axe" +
                label +
                (violations.length ? JSON.stringify(violations) : ""),
            );
            await recovery.scrollIntoViewIfNeeded();
            await page.screenshot({
              path: new URL("grant-recovery-" + viewport.width + ".png", output)
                .pathname,
              animations: "disabled",
            });
          }
          await recovery
            .getByRole("button", {
              name: "Check original collaborator outcome",
              exact: true,
            })
            .click();
          if (position === "before") {
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
            panel.getByText(
              "Collaborator change confirmed. Current access is being refreshed.",
              { exact: true },
            ),
          ).toBeVisible();
          check(
            attempts.length === start + (position === "before" ? 2 : 1) &&
              attempts
                .slice(start)
                .every(
                  (a) => a.key === original.key && a.body === original.body,
                ),
            "grant " +
              action +
              " " +
              position +
              " reconciles read-only or retries identical request" +
              label,
          );
          const current = data(await h.call(path));
          check(
            current.total === (action === "save" ? 1 : 0) &&
              checked(
                await h.db
                  .from("admin_actions")
                  .select("id")
                  .eq("target_id", source.id)
                  .in("action", [
                    "forms.collaborator_updated",
                    "forms.collaborator_removed",
                  ]),
              ).length ===
                auditsBefore + 1,
            "grant " +
              action +
              " " +
              position +
              " commits one mutation and audit" +
              label,
          );
        }
      // Ten simultaneous requests share the reviewed body and key. Accepted deletion
      // must remain a receipt even after another legitimate generation is created.
      const fresh = {
          userId: peer,
          formRevision: source.revision,
          grantId: null,
          grantRevision: 0,
          actions: ["view"],
        },
        saveKey = randomUUID();
      const saved = await Promise.all(
        Array.from({ length: 10 }, () =>
          h.call(path, { method: "PATCH", body: fresh, key: saveKey }),
        ),
      );
      const grant = data(saved[0]).grant;
      check(
        saved.every((r) => r.status === 200) &&
          saved.every((r) => r.json.data.grant.id === grant.id) &&
          grant.revision === 1,
        "ten concurrent identical grant creations commit one generation/revision" +
          label,
      );
      const deletion = {
          userId: peer,
          formRevision: source.revision,
          grantId: grant.id,
          grantRevision: grant.revision,
        },
        removeKey = randomUUID(),
        removed = await Promise.all(
          Array.from({ length: 10 }, () =>
            h.call(path, { method: "DELETE", body: deletion, key: removeKey }),
          ),
        );
      check(
        removed.every((r) => r.status === 200),
        "ten concurrent identical removals return the original receipt" + label,
      );
      const replacement = data(
        await h.call(path, { method: "PATCH", body: fresh, key: randomUUID() }),
      );
      const replay = data(
        await h.call(path, {
          method: "DELETE",
          body: deletion,
          key: removeKey,
        }),
      );
      check(
        replacement.grant.id !== grant.id &&
          replay.grant.id === replacement.grant.id &&
          (
            await h.call(path, {
              method: "DELETE",
              body: deletion,
              key: randomUUID(),
            })
          ).status === 409,
        "accepted old deletion preserves a recreated grant and stale new deletion conflicts" +
          label,
      );
      check(
        (
          await outsider.call(path + `/recovery?action=remove&userId=${peer}`, {
            key: removeKey,
          })
        ).status === 404,
        "unrelated actor cannot inspect original grant receipt" + label,
      );
      if (viewport.width === 375)
        await panel.getByRole("button", { name: "Close", exact: true }).click();
      const final = data(await h.call(root)).form;
      check(
        final.revision === source.revision &&
          !final.versions.length &&
          !checked(
            await h.db
              .from("form_responses")
              .select("id")
              .eq("form_id", source.id),
          ).length &&
          !checked(
            await h.db
              .from("delivery_jobs")
              .select("id")
              .eq("payload->>formId", source.id),
          ).length,
        "grant recovery preserves unpublished draft and queues no responses/mail" +
          label,
      );
      check(
        !unexpected.length &&
          !errors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "grant recovery has no unexpected writes/egress/errors/page overflow" +
          label,
      );
    } finally {
      await context.unrouteAll({ behavior: "wait" });
      await context.close();
    }
  }
  completed = true;
} finally {
  await browser?.close();
  if (created) {
    for (const id of forms) {
      const f = data(await h.call("/admin/forms/" + id)).form;
      if (f.status !== "Archived")
        data(
          await h.call("/admin/forms/" + id, {
            method: "DELETE",
            body: { revision: f.revision },
          }),
        );
    }
    checked(
      await h.db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .in("id", accounts),
    );
    checked(
      await h.db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .in("admin_user_id", accounts)
        .is("revoked_at", null),
    );
  }
  await writeFile(
    new URL(
      "../.docs/phase0/local-form-collaborator-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: created,
        scope:
          "Dedicated loopback only; fresh fictional actors/private drafts. No publications, responses, delivery jobs/workers, provider sends, existing chapter or production changes. Owned forms archived/accounts disabled/sessions revoked.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
