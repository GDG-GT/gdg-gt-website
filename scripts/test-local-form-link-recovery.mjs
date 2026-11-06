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
  password = "Fictional-link-recovery-" + randomUUID(),
  marker = actors[0].slice(0, 8),
  email = (id) => "fictional-link-recovery-" + id + "@example.test",
  tests = [],
  forms = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-form-link-recovery/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false;
const checked = (r) => {
  if (r.error)
    throw Error("Owned link fixture database failure " + r.error.code);
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned link fixture API failure " + r.status + " " + r.json?.error?.code,
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
async function disableJobs(form) {
  checked(
    await h.db
      .from("delivery_jobs")
      .update({
        state: "completed",
        secret_payload: null,
        completed_at: new Date().toISOString(),
        lease_token: null,
        locked_until: null,
      })
      .eq("kind", "form_access")
      .eq("payload->>formId", form),
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
        role: id === outsider ? "team_member" : "admin",
        is_active: true,
        display_name: "Fictional link operator " + marker,
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
      "Fictional link recovery " + viewport.width + " " + marker,
      "blank",
    );
    draft.settings.access = "invited";
    draft.settings.receipts = false;
    let source = data(
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
    source = data(
      await h.call("/admin/forms/" + source.id + "/publish", {
        method: "POST",
        body: { revision: source.revision },
      }),
    ).form;
    const root = "/admin/forms/" + source.id,
      path = root + "/invitations",
      label = " at " + viewport.width + "×" + viewport.height;
    check(
      (await other.call(path)).status === 404 &&
        (await h.call(path, { anonymous: true })).status === 401,
      "private links stay concealed from unrelated and anonymous readers" +
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
          throw Error("Owned link browser authentication failed " + r.status());
      }
      const page = await context.newPage(),
        attempts = [],
        unexpected = [],
        errors = [];
      let loss = "",
        selectedId = null;
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
                  message: "Realtime paused for owned link verification.",
                },
              },
            });
          if (
            !(
              (p === path && r.method() === "POST") ||
              (p === path + "/" + selectedId && r.method() === "PATCH")
            )
          ) {
            unexpected.push("unexpected mutation");
            return route.abort("blockedbyclient");
          }
          attempts.push({
            key: r.headers()["idempotency-key"],
            body: r.postData(),
            method: r.method(),
            sourceId: selectedId,
          });
          const where = loss;
          loss = "";
          const response = await route.fetch();
          if (response.status() !== 200)
            throw Error("Owned link dispatch failed " + response.status());
          await disableJobs(source.id);
          if (where === "after") return route.abort("connectionfailed");
          if (where === "before")
            throw Error("Before-loss interception must not dispatch");
          return route.fulfill({ response });
        }
        return route.continue();
      });
      // A second route handles pre-dispatch loss before the forwarding rule above.
      await page.route(
        "**/api/v1/admin/forms/**/invitations**",
        async (route) => {
          const r = route.request();
          if (loss === "before" && !["GET", "HEAD"].includes(r.method())) {
            loss = "";
            attempts.push({
              key: r.headers()["idempotency-key"],
              body: r.postData(),
              method: r.method(),
              sourceId: selectedId,
            });
            return route.abort("connectionfailed");
          }
          return route.fallback();
        },
      );
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
      for (const position of ["after", "before"]) {
        const address =
            (position === "after" ? "aa" : "bb") +
            "-fictional-" +
            marker +
            "@example.test",
          hint = (position === "after" ? "aa" : "bb") + "…@example.test";
        for (const action of ["create", "resend", "revoke"]) {
          let row;
          if (action === "create") {
            await panel
              .getByLabel("Approved recipient emails", { exact: false })
              .fill(address);
            await panel
              .getByRole("checkbox", { name: /I approve these recipients/ })
              .check();
            await panel
              .getByRole("button", {
                name: "Review private links",
                exact: true,
              })
              .click();
          } else {
            const target = checked(
              await h.db
                .from("form_access_tokens")
                .select("id,revision,token_hash,expires_at")
                .eq("form_id", source.id)
                .is("revoked_at", null)
                .single(),
            );
            selectedId = target.id;
            row = panel.getByRole("row").filter({ hasText: hint });
            await row
              .getByRole("button", {
                name: action === "resend" ? "Resend" : "Revoke",
                exact: true,
              })
              .click();
          }
          const title =
              action === "create"
                ? "Queue private access links?"
                : action === "resend"
                  ? "Replace access link?"
                  : "Revoke access link?",
            dialog = page.getByRole("dialog", { name: title, exact: true }),
            confirm =
              action === "create"
                ? "Queue approved private links"
                : action === "resend"
                  ? "Replace access link"
                  : "Revoke access link";
          await expect(
            dialog.getByRole("button", { name: confirm, exact: true }),
          ).toBeEnabled();
          const before = attempts.length,
            auditsBefore = checked(
              await h.db
                .from("admin_actions")
                .select("id")
                .eq("target_id", source.id)
                .eq(
                  "action",
                  action === "create"
                    ? "forms.access_queued"
                    : "forms.access_" + action,
                ),
            ).length;
          loss = position;
          await dialog
            .getByRole("button", { name: confirm, exact: true })
            .click();
          const recovery = panel.getByRole("region", {
            name: "Unconfirmed private link change",
            exact: true,
          });
          await expect(recovery).toBeVisible();
          const original = attempts.at(-1),
            document = JSON.parse(original.body);
          check(
            attempts.length === before + 1 &&
              document.formRevision === source.revision &&
              document.publishedVersionId ===
                source.versions.at(-1).versionId &&
              (action !== "create" ||
                JSON.stringify(document.recipients) ===
                  JSON.stringify([address])),
            "link " +
              action +
              " " +
              position +
              " freezes original form/publication/audience/target/expiry" +
              label,
          );
          await expect(
            page.getByRole("tab", { name: "Settings", exact: true }),
          ).toBeDisabled();
          if (viewport.width === 375)
            await expect(
              panel.getByRole("button", { name: "Close", exact: true }),
            ).toBeDisabled();
          if (action === "create" && position === "after") {
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
              "uncertain populated private-link review passes measured axe" +
                label +
                (violations.length ? JSON.stringify(violations) : ""),
            );
            await recovery.scrollIntoViewIfNeeded();
            await page.screenshot({
              path: new URL("link-recovery-" + viewport.width + ".png", output)
                .pathname,
              animations: "disabled",
            });
          }
          await recovery
            .getByRole("button", {
              name: "Check original private link outcome",
              exact: true,
            })
            .click();
          if (position === "before") {
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
          check(
            attempts.length === before + (position === "before" ? 2 : 1) &&
              attempts
                .slice(before)
                .every(
                  (a) => a.key === original.key && a.body === original.body,
                ),
            "link " +
              action +
              " " +
              position +
              " reconciles read-only or explicitly retries identical request" +
              label,
          );
          check(
            checked(
              await h.db
                .from("admin_actions")
                .select("id")
                .eq("target_id", source.id)
                .eq(
                  "action",
                  action === "create"
                    ? "forms.access_queued"
                    : "forms.access_" + action,
                ),
            ).length ===
              auditsBefore + 1,
            "link " +
              action +
              " " +
              position +
              " produces one intended audit" +
              label,
          );
          const reply = await context.request.get(
            h.env.APP_ORIGIN +
              "/api/v1" +
              path +
              "/recovery?action=" +
              action +
              (action === "create" ? "" : "&sourceId=" + selectedId),
            {
              headers: {
                Origin: h.env.APP_ORIGIN,
                "Idempotency-Key": original.key,
              },
            },
          );
          if (reply.status() !== 200)
            throw Error("Owned link receipt unavailable " + reply.status());
          const inspected = (await reply.json()).data;
          check(
            inspected.committed &&
              !JSON.stringify(inspected).includes(address) &&
              !JSON.stringify(inspected).includes("tokenHash"),
            "link " +
              action +
              " " +
              position +
              " receipt inspection excludes private address/token" +
              label,
          );
        }
      }
      const body = {
          formRevision: source.revision,
          publishedVersionId: source.versions.at(-1).versionId,
          type: "invited",
          recipients: ["cc-fictional-" + marker + "@example.test"],
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          confirmed: true,
        },
        key = randomUUID(),
        r = await Promise.all(
          Array.from({ length: 10 }, () =>
            h.call(path, { method: "POST", body, key }),
          ),
        );
      await disableJobs(source.id);
      check(
        r.every((x) => x.status === 200 && x.json.data.queued === 1) &&
          checked(
            await h.db
              .from("delivery_jobs")
              .select("id")
              .eq("kind", "form_access")
              .eq("payload->>formId", source.id),
          ).length === 5,
        "ten simultaneous identical batches queue one new private link/job" +
          label,
      );
      const final = data(await h.call(root)).form;
      check(
        final.revision === source.revision &&
          final.versions.length === 1 &&
          !checked(
            await h.db
              .from("form_responses")
              .select("id")
              .eq("form_id", source.id),
          ).length,
        "link lifecycle preserves saved draft/publication and creates no responses" +
          label,
      );
      if (viewport.width === 375)
        await panel.getByRole("button", { name: "Close", exact: true }).click();
      check(
        !unexpected.length &&
          !errors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "private-link recovery has no unexpected writes/egress/errors/page overflow" +
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
      await disableJobs(id);
      checked(
        await h.db
          .from("form_access_tokens")
          .update({
            intended_email_encrypted: null,
            email_hash: null,
            revoked_at: new Date().toISOString(),
          })
          .eq("form_id", id),
      );
      const r = await h.call("/admin/forms/" + id);
      if (r.status === 200 && r.json.data.form.status !== "Archived")
        data(
          await h.call("/admin/forms/" + id, {
            method: "DELETE",
            body: { revision: r.json.data.form.revision },
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
    new URL("../.docs/phase0/local-form-link-recovery.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: created,
        scope:
          "Dedicated loopback; fresh owned fictional private publications/accounts/recipient addresses only. Jobs disabled and encrypted job payloads cleared before browser acknowledgements; no worker/provider sends, responses, existing chapter or production changes. Owned tokens revoked/recipient ciphertext cleared, forms archived, accounts disabled/sessions revoked. Reports contain no request body/key/recipient/capability/proof.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
