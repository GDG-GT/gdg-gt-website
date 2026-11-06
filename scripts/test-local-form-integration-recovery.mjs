import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { createTemplate } from "../shared/forms.ts";
const h = await localHttp(),
  other = await localHttp(),
  actors = [randomUUID(), randomUUID()],
  outsider = randomUUID(),
  accounts = [...actors, outsider],
  password = "Fictional-integration-recovery-" + randomUUID(),
  marker = actors[0].slice(0, 8),
  email = (id) => "fictional-integration-recovery-" + id + "@example.test",
  forms = [],
  events = [],
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-form-integration-recovery/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false;
const checked = (r) => {
    if (r.error)
      throw Error("Owned integration fixture database failure " + r.error.code);
    return r.data;
  },
  data = (r) => {
    if (r.status !== 200)
      throw Error(
        "Owned integration fixture API failure " +
          r.status +
          " " +
          r.json?.error?.code,
      );
    return r.json.data;
  },
  check = (ok, name) => {
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
    await h.db
      .from("admin_users")
      .insert(
        accounts.map((id) => ({
          id,
          email: email(id),
          password_hash: hash,
          role: id === outsider ? "team_member" : "admin",
          is_active: true,
          display_name: "Fictional integration officer " + marker,
        })),
      ),
  );
  created = true;
  await login(other, outsider);
  browser = await chromium.launch();
  for (const [index, viewport] of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ].entries()) {
    const actor = actors[index];
    await login(h, actor);
    const draft = createTemplate(
      "Fictional integration target " + viewport.width + " " + marker,
      "blank",
    );
    draft.settings.access = "internal";
    draft.settings.receipts = false;
    let form = data(
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
    forms.push(form.id);
    form = data(
      await h.call("/admin/forms/" + form.id + "/publish", {
        method: "POST",
        body: { revision: form.revision },
      }),
    ).form;
    const event = data(
      await h.call("/admin/events", {
        method: "POST",
        body: {
          event: {
            title:
              "Fictional integration source " + viewport.width + " " + marker,
            slug: "fictional-integration-ui-" + viewport.width + "-" + marker,
            description: "Owned draft verification only",
            start_at: "2199-01-01T12:00:00Z",
            location: "Fictional local venue",
          },
        },
      }),
    ).event;
    events.push(event.id);
    const root = "/admin/form-integrations/event/" + event.id,
      label = " at " + viewport.width + "×" + viewport.height;
    check(
      (await other.call(root)).status === 404 &&
        (await h.call(root, { anonymous: true })).status === 401,
      "integration scope is concealed from unrelated and anonymous readers" +
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
          throw Error(
            "Owned integration browser authentication failed " + r.status(),
          );
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
          r.method() === "GET" &&
          p === root + "/candidates" &&
          !u.searchParams.get("q") &&
          !u.searchParams.get("selected")
        ) {
          u.searchParams.set("q", form.title);
          return route.continue({ url: u.toString() });
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
                  message:
                    "Realtime paused for owned integration verification.",
                },
              },
            });
          if (
            p !== root + "/primary" ||
            !["PUT", "DELETE"].includes(r.method())
          ) {
            unexpected.push("unexpected mutation");
            return route.abort("blockedbyclient");
          }
          attempts.push({
            key: r.headers()["idempotency-key"],
            body: r.postData(),
            method: r.method(),
          });
          if (loss) {
            const where = loss;
            loss = "";
            if (where === "after") {
              const response = await route.fetch();
              if (response.status() !== 200)
                throw Error(
                  "Owned integration dispatch failed " + response.status(),
                );
            }
            return route.abort("connectionfailed");
          }
        }
        return route.continue();
      });
      await page.goto(h.env.APP_ORIGIN + "/admin/events");
      await page
        .getByRole("row")
        .filter({ hasText: event.title })
        .getByRole("button", { name: "Edit", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Linked forms", exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: "Linked forms", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Linked forms",
        exact: true,
      });
      for (const position of ["after", "before"])
        for (const action of ["create", "replace", "remove"]) {
          if (action === "create") {
            await dialog
              .getByLabel("Find a published form", { exact: false })
              .fill(form.title);
            await dialog
              .getByRole("button", { name: "Search forms", exact: true })
              .click();
            await expect(
              dialog.getByRole("combobox", { name: "Published form" }),
            ).toBeEnabled();
            await dialog
              .getByRole("combobox", { name: "Published form" })
              .selectOption(form.id);
            await expect(
              dialog.getByRole("button", {
                name: "Review new link",
                exact: true,
              }),
            ).toBeEnabled();
            await dialog
              .getByRole("button", { name: "Review new link", exact: true })
              .click();
          } else if (action === "replace") {
            await dialog
              .getByRole("button", { name: "Edit link", exact: true })
              .click();
            await dialog
              .getByLabel("Link label", { exact: false })
              .fill("Reviewed reference " + position);
            await expect(
              dialog.getByRole("button", {
                name: "Review link changes",
                exact: true,
              }),
            ).toBeEnabled();
            await dialog
              .getByRole("button", { name: "Review link changes", exact: true })
              .click();
          } else
            await dialog
              .getByRole("button", { name: "Remove link", exact: true })
              .click();
          const confirm =
            action === "remove" ? "Confirm removal" : "Confirm form link";
          await expect(
            dialog.getByRole("button", { name: confirm, exact: true }),
          ).toBeEnabled();
          const count = attempts.length,
            before = data(await h.call(root)).items;
          loss = position;
          await dialog
            .getByRole("button", { name: confirm, exact: true })
            .click();
          const recovery = dialog.getByRole("region", {
            name: "Unconfirmed linked form change",
            exact: true,
          });
          await expect(recovery).toBeVisible();
          await expect(
            dialog.getByRole("button", { name: "Close", exact: true }),
          ).toBeDisabled();
          const original = attempts.at(-1),
            body = JSON.parse(original.body);
          check(
            attempts.length === count + 1 &&
              body.referenceId === (before[0]?.id || null) &&
              body.revision === (before[0]?.revision || 0) &&
              (action === "remove" ||
                (body.formRevision === form.revision &&
                  body.publishedVersionId === form.versions.at(-1).versionId)),
            "integration " +
              action +
              " " +
              position +
              " freezes original generation/revision/publication/body" +
              label,
          );
          if (action === "replace" && position === "after") {
            await page.addScriptTag({
              path: require.resolve("axe-core/axe.min.js"),
            });
            const violations = await page.evaluate(async () =>
              (
                await window.axe.run(document, {
                  runOnly: {
                    type: "tag",
                    values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
                  },
                })
              ).violations.map((v) => v.id),
            );
            check(
              !violations.length,
              "populated unconfirmed integration passes measured axe" +
                label +
                (violations.length ? JSON.stringify(violations) : ""),
            );
            await recovery.scrollIntoViewIfNeeded();
            await page.screenshot({
              path: new URL(
                "integration-recovery-" + viewport.width + ".png",
                output,
              ).pathname,
              animations: "disabled",
            });
          }
          await recovery
            .getByRole("button", {
              name: "Check original linked form outcome",
              exact: true,
            })
            .click();
          if (position === "before") {
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
            dialog.getByText(
              "Linked-form change confirmed. Current links are being refreshed.",
              { exact: true },
            ),
          ).toBeVisible();
          check(
            attempts.length === count + (position === "before" ? 2 : 1) &&
              attempts
                .slice(count)
                .every(
                  (a) => a.key === original.key && a.body === original.body,
                ),
            "integration " +
              action +
              " " +
              position +
              " reconciles read-only or explicitly retries original bytes/key" +
              label,
          );
          const current = data(await h.call(root)).items,
            recordId = action === "create" ? current[0].id : body.referenceId,
            actionName =
              action === "remove"
                ? "forms.integration_removed"
                : "forms.integration_linked";
          check(
            current.length === (action === "remove" ? 0 : 1) &&
              (action === "remove" ||
                current[0].revision ===
                  (action === "create" ? 1 : body.revision + 1)) &&
              checked(
                await h.db
                  .from("admin_actions")
                  .select("id")
                  .eq("target_id", recordId)
                  .eq("action", actionName),
              ).length === (action === "replace" ? 2 : 1),
            "integration " +
              action +
              " " +
              position +
              " produces one intended record change/audit" +
              label,
          );
        }
      const body = {
          revision: 0,
          referenceId: null,
          formId: form.id,
          formRevision: form.revision,
          publishedVersionId: form.versions.at(-1).versionId,
          versionPolicy: "latest_published",
          label: "Concurrent owned link",
        },
        key = randomUUID(),
        batch = await Promise.all(
          Array.from({ length: 10 }, () =>
            h.call(root + "/primary", { method: "PUT", body, key }),
          ),
        );
      const first = data(batch[0]),
        row = data(await h.call(root)).items[0];
      check(
        batch.every((r) => r.status === 200 && r.json.data.id === first.id) &&
          row.revision === 1,
        "ten simultaneous identical integration saves create one generation/revision" +
          label,
      );
      const remove = { referenceId: row.id, revision: row.revision },
        removeKey = randomUUID();
      data(
        await h.call(root + "/primary", {
          method: "DELETE",
          body: remove,
          key: removeKey,
        }),
      );
      const replacement = data(
        await h.call(root + "/primary", {
          method: "PUT",
          body,
          key: randomUUID(),
        }),
      );
      const replay = data(
        await h.call(root + "/primary", {
          method: "DELETE",
          body: remove,
          key: removeKey,
        }),
      );
      check(
        replacement.id !== row.id &&
          replay.id === row.id &&
          data(await h.call(root)).items[0].id === replacement.id &&
          (
            await h.call(root + "/primary", {
              method: "DELETE",
              body: remove,
              key: randomUUID(),
            })
          ).status === 409,
        "accepted old removal preserves a recreated link and a new stale removal conflicts" +
          label,
      );
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      check(
        data(await h.call("/admin/forms/" + form.id)).form.revision ===
          form.revision &&
          data(await h.call("/admin/events/" + event.id)).event.revision ===
            event.revision &&
          !checked(
            await h.db
              .from("form_responses")
              .select("id")
              .eq("form_id", form.id),
          ).length &&
          !checked(
            await h.db
              .from("delivery_jobs")
              .select("id")
              .eq("payload->>formId", form.id),
          ).length,
        "integration recovery preserves draft/publication/source state and creates no responses/mail" +
          label,
      );
      check(
        !unexpected.length &&
          !errors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "integration recovery has no unexpected writes/egress/errors/page overflow" +
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
    for (const id of events) {
      const e = data(await h.call("/admin/events/" + id)).event;
      if (e.publication_status !== "archived")
        data(
          await h.call("/admin/events/" + id, {
            method: "DELETE",
            body: { revision: e.revision, event: {} },
          }),
        );
    }
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
      "../.docs/phase0/local-form-integration-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: created,
        scope:
          "Dedicated loopback; fresh owned fictional internal publications/draft events/accounts only. No public event publication, responses, jobs/workers/provider sends/existing chapter or production changes. Owned sources/forms archived/accounts disabled/sessions revoked. No original body/key/proof/private definition retained in reports.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
