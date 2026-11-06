import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { createTemplate } from "../shared/forms.ts";
const h = await localHttp(),
  ordinary = await localHttp(),
  actors = [randomUUID(), randomUUID()],
  outsider = randomUUID(),
  accounts = [...actors, outsider],
  password = "Fictional-purge-recovery-" + randomUUID(),
  marker = actors[0].slice(0, 8),
  email = (id) => "fictional-purge-recovery-" + id + "@example.test",
  tests = [],
  forms = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-form-deletion-recovery/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false;
const checked = (r) => {
  if (r.error)
    throw Error("Owned deletion fixture database failure " + r.error.code);
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned deletion fixture API failure " +
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
        role: id === outsider ? "admin" : "super_admin",
        is_active: true,
        display_name: "Fictional deletion operator " + marker,
      })),
    ),
  );
  created = true;
  await login(ordinary, outsider);
  browser = await chromium.launch();
  for (const [index, viewport] of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ].entries()) {
    const actor = actors[index];
    await login(h, actor);
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
            "Owned deletion browser authentication failed " + r.status(),
          );
      }
      for (const position of ["after", "before"]) {
        const draft = createTemplate(
          "Fictional purge " + viewport.width + " " + position + " " + marker,
          "blank",
        );
        draft.settings.access = "internal";
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
        data(
          await h.call("/admin/forms/" + source.id, {
            method: "DELETE",
            body: { revision: source.revision },
          }),
        );
        source = data(await h.call("/admin/forms/" + source.id)).form;
        const root = "/admin/forms/" + source.id,
          path = root + "/permanent-deletion",
          label =
            " " + position + " at " + viewport.width + "×" + viewport.height;
        check(
          (await ordinary.call(root + "/deletion-review")).status === 404 &&
            (await h.call(root + "/deletion-review", { anonymous: true }))
              .status === 401,
          "deletion eligibility is concealed from ordinary/anonymous readers" +
            label,
        );
        const page = await context.newPage(),
          attempts = [],
          unexpected = [],
          errors = [];
        let loss = position;
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
            r.method() === "GET" &&
            p === "/admin/forms"
          ) {
            u.searchParams.set("q", source.title);
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
                    message: "Realtime paused for owned deletion verification.",
                  },
                },
              });
            if (
              ![root + "/deletion-review", path].includes(p) ||
              r.method() !== "POST"
            ) {
              unexpected.push("unexpected mutation");
              return route.abort("blockedbyclient");
            }
            if (p === path) {
              const { currentPassword, ...document } = JSON.parse(
                r.postData() || "{}",
              );
              attempts.push({
                key: r.headers()["idempotency-key"],
                body: JSON.stringify(document),
                freshProof: currentPassword === password,
              });
              if (loss) {
                const where = loss;
                loss = "";
                if (where === "after") {
                  const response = await route.fetch();
                  if (response.status() !== 200)
                    throw Error(
                      "Owned permanent deletion failed " + response.status(),
                    );
                }
                return route.abort("connectionfailed");
              }
            }
          }
          return route.continue();
        });
        await page.goto(h.env.APP_ORIGIN + "/admin/forms");
        await page
          .getByRole("button", {
            name: "Actions for " + source.title,
            exact: true,
          })
          .click();
        await page
          .getByRole("menuitem", {
            name: "Review permanent deletion…",
            exact: true,
          })
          .click();
        const dialog = page.getByRole("dialog", {
          name: "Permanent form deletion",
          exact: true,
        });
        await expect(
          dialog.getByRole("button", {
            name: "Review permanent deletion",
            exact: true,
          }),
        ).toBeEnabled();
        await dialog
          .getByRole("button", {
            name: "Review permanent deletion",
            exact: true,
          })
          .click();
        await dialog
          .getByRole("checkbox", { name: /I have exported anything/ })
          .check();
        await dialog
          .getByLabel("Deletion confirmation", { exact: false })
          .fill("DELETE FORM " + source.id);
        await dialog
          .getByLabel("Current password", { exact: true })
          .fill(password);
        await dialog
          .getByRole("button", {
            name: "Permanently delete this form",
            exact: true,
          })
          .click();
        const recovery = dialog.getByRole("region", {
          name: "Unconfirmed permanent deletion change",
          exact: true,
        });
        await expect(recovery).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: "Close", exact: true }),
        ).toBeDisabled();
        check(
          attempts.length === 1 &&
            attempts[0].freshProof &&
            JSON.parse(attempts[0].body).revision === source.revision,
          "deletion retains original review/revision/key and clears proof after loss" +
            label,
        );
        if (position === "after") {
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
            "uncertain permanent deletion passes measured axe" +
              label +
              (violations.length ? JSON.stringify(violations) : ""),
          );
          await recovery.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: new URL(
              "deletion-recovery-" + viewport.width + ".png",
              output,
            ).pathname,
            animations: "disabled",
          });
        }
        const original = attempts[0];
        await recovery
          .getByRole("button", {
            name: "Check original permanent deletion outcome",
            exact: true,
          })
          .click();
        if (position === "before") {
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
            .fill(password);
          await recovery
            .getByRole("button", {
              name: "Retry identical permanent deletion change",
              exact: true,
            })
            .click();
        }
        await expect(dialog).toHaveCount(0);
        check(
          attempts.length === (position === "before" ? 2 : 1) &&
            attempts.every(
              (a) =>
                a.key === original.key &&
                a.body === original.body &&
                a.freshProof,
            ),
          "deletion reconciles accepted receipt or explicitly retries identical unexpired request with new proof" +
            label,
        );
        const tombstone = checked(
            await h.db
              .from("forms")
              .select(
                "id,title,draft_definition,draft_revision,permanently_deleted_at",
              )
              .eq("id", source.id)
              .single(),
          ),
          audit = checked(
            await h.db
              .from("admin_actions")
              .select("metadata")
              .eq("target_id", source.id)
              .eq("action", "forms.permanently_deleted"),
          );
        check(
          tombstone.permanently_deleted_at &&
            tombstone.title === "[Deleted form]" &&
            JSON.stringify(tombstone.draft_definition) === "{}" &&
            tombstone.draft_revision === source.revision + 1 &&
            audit.length === 1,
          "one owned erasure/audit leaves only the expected tombstone" + label,
        );
        const reviewId = JSON.parse(original.body).reviewId,
          browserReceipt = await context.request.get(
            h.env.APP_ORIGIN +
              "/api/v1" +
              path +
              "/recovery?reviewId=" +
              reviewId,
            {
              headers: {
                Origin: h.env.APP_ORIGIN,
                "Idempotency-Key": original.key,
              },
            },
          );
        if (browserReceipt.status() !== 200)
          throw Error(
            "Owned original-session recovery failed " + browserReceipt.status(),
          );
        const receipt = (await browserReceipt.json()).data;
        check(
          receipt.committed &&
            receipt.receipt.deleted &&
            !JSON.stringify(receipt).includes(source.title) &&
            !("state" in receipt) &&
            (
              await ordinary.call(path + "/recovery?reviewId=" + reviewId, {
                key: original.key,
              })
            ).status === 404,
          "read-only accepted receipt remains minimal/current-authority bound after erasure" +
            label,
        );
        check(
          (await h.call(root)).status === 404 &&
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
          "owned purge queues no responses/mail and normal form route stays unavailable" +
            label,
        );
        check(
          !unexpected.length &&
            !errors.length &&
            (await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            )),
          "permanent deletion recovery has no unexpected writes/egress/errors/overflow" +
            label,
        );
        await page.close();
      }
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
    new URL(
      "../.docs/phase0/local-form-deletion-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: created,
        scope:
          "Dedicated loopback only. Fresh owned fictional private draft forms are archived then irreversibly purged only through reviewed UI. No publications/responses/files/exports/jobs/workers/provider sends/existing chapter or production changes. Remaining owned drafts archived, accounts disabled, sessions revoked. No proof/capability/body/key retained in report.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
