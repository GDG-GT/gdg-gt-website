import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { createTemplate } from "../shared/forms.ts";
const h = await localHttp(),
  other = await localHttp(),
  actor = randomUUID(),
  secondActor = randomUUID(),
  outsider = randomUUID(),
  password = "Fictional-delivery-recovery-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-delivery-recovery-" + id + "@example.test",
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-form-delivery-recovery/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false;
const checked = (r) => {
  if (r.error)
    throw Error(
      "Owned delivery-recovery database operation failed " + r.error.code,
    );
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned delivery-recovery API failed " +
        r.status +
        " " +
        r.json?.error?.code,
    );
  return r.json.data;
};
const check = (value, name) => {
  if (!value) throw Error(name);
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
async function create(label) {
  const f = createTemplate(
    "Fictional delivery-recovery " + label + " " + marker,
    "interest",
  );
  f.settings.access = "internal";
  f.settings.receipts = false;
  f.fields = f.fields.slice(0, 2);
  f.fields[1].sensitive = true;
  return data(
    await h.call("/admin/forms", {
      method: "POST",
      body: {
        slug: "fictional-delivery-recovery-" + label + "-" + marker,
        definition: {
          title: f.title,
          description: f.description,
          fields: f.fields,
          sections: f.sections,
          settings: f.settings,
        },
      },
    }),
  ).form;
}
const recipientIds = Array.from({ length: 215 }, () => randomUUID()),
  selectedId = recipientIds.at(-1),
  recipientPrefix = "Fictional delivery candidate " + marker;
await mkdir(output, { recursive: true });
try {
  const hash = await hashSecret(password);
  checked(
    await h.db
      .from("admin_users")
      .insert(
        [actor, secondActor, outsider].map((id) => ({
          id,
          email: email(id),
          password_hash: hash,
          role: id === outsider ? "team_member" : "admin",
          is_active: true,
          display_name: "Fictional delivery officer " + marker,
        })),
      ),
  );
  created = true;
  checked(
    await h.db
      .from("admin_users")
      .insert(
        recipientIds.map((id, index) => ({
          id,
          email: email(id),
          password_hash: hash,
          role: "admin",
          is_active: true,
          display_name:
            recipientPrefix + " " + String(index + 1).padStart(3, "0"),
        })),
      ),
  );
  await login(other, outsider);
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const activeActor = viewport.width === 1440 ? actor : secondActor;
    await login(h, activeActor);
    const source = await create("delivery-" + viewport.width),
      root = "/admin/forms/" + source.id,
      path = root + "/delivery",
      label = " at " + viewport.width + "×" + viewport.height;
    check(
      (await other.call(path)).status === 404 &&
        (await h.call(path, { anonymous: true })).status === 401,
      "delivery policy conceals owned settings from unrelated/anonymous readers" +
        label,
    );
    const initial = data(await h.call(path));
    if (!initial.mailReady)
      throw Error(
        "The dedicated local mail mode is unavailable; no provider configuration was changed.",
      );
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    try {
      for (const [routePath, document] of [
        ["/auth/gate", { code: h.credentials.gateCode }],
        ["/auth/login", { email: email(activeActor), password }],
      ]) {
        const r = await context.request.post(
          h.env.APP_ORIGIN + "/api/v1" + routePath,
          { headers: { Origin: h.env.APP_ORIGIN }, data: document },
        );
        if (r.status() !== 200)
          throw Error("Owned delivery browser login failed " + r.status());
      }
      const page = await context.newPage(),
        attempts = [],
        unexpected = [],
        errors = [];
      let loss = "",
        failCandidates = false;
      page.on("pageerror", (error) => errors.push(error.name));
      await page.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          api = url.pathname.startsWith("/api/v1/"),
          routePath = url.pathname.replace("/api/v1", "");
        if (url.origin !== h.env.APP_ORIGIN) {
          unexpected.push("external request");
          return route.abort("blockedbyclient");
        }
        if (
          api &&
          request.method() === "GET" &&
          routePath === path + "/candidates"
        ) {
          if (failCandidates)
            return route.fulfill({
              status: 503,
              json: {
                error: {
                  code: "UNAVAILABLE",
                  message: "Fictional delivery-recipient interruption.",
                },
              },
            });
          // Restrict the live verification inventory to owned fictional fixtures.
          if (!url.searchParams.get("q")) {
            url.searchParams.set("q", recipientPrefix);
            return route.continue({ url: url.toString() });
          }
        }
        if (api && !["GET", "HEAD"].includes(request.method())) {
          if (["/auth/realtime-token", "/realtime/token"].includes(routePath))
            return route.fulfill({
              status: 503,
              json: {
                error: {
                  code: "UNAVAILABLE",
                  message: "Realtime paused for owned delivery verification.",
                },
              },
            });
          if (routePath !== path || request.method() !== "POST") {
            unexpected.push("unexpected mutation");
            return route.abort("blockedbyclient");
          }
          const { currentPassword, ...document } = JSON.parse(
            request.postData() || "{}",
          );
          attempts.push({
            key: request.headers()["idempotency-key"],
            body: JSON.stringify(document),
            hasFreshProof: currentPassword === password,
          });
          if (loss) {
            const position = loss;
            loss = "";
            if (position === "after") {
              const r = await route.fetch();
              if (r.status() !== 200)
                throw Error(
                  "Owned delivery before response loss failed " + r.status(),
                );
            }
            return route.abort("connectionfailed");
          }
        }
        return route.continue();
      });
      await page.goto(h.env.APP_ORIGIN + root + "/edit");
      async function openDelivery() {
        if (viewport.width === 375) {
          if (
            !(await page
              .getByRole("dialog", { name: "Form settings", exact: true })
              .isVisible())
          )
            await page
              .getByRole("button", { name: "Settings", exact: true })
              .click();
        } else
          await page
            .getByRole("tab", { name: "Settings", exact: true })
            .click();
        await expect(
          page.getByRole("button", {
            name: "Review chapter notifications",
            exact: true,
          }),
        ).toBeEnabled();
        await page
          .getByRole("button", {
            name: "Review chapter notifications",
            exact: true,
          })
          .click();
        return page.getByRole("dialog", {
          name: "Receipts & notifications",
          exact: true,
        });
      }
      let dialog = await openDelivery();
      for (const position of ["after", "before"])
        for (const enabled of [true, false]) {
          if (enabled) {
            checked(
              await h.db
                .from("admin_users")
                .update({ is_active: true })
                .eq("id", selectedId),
            );
            await dialog
              .getByRole("button", {
                name: "Choose notification recipients",
                exact: true,
              })
              .click();
            await dialog
              .getByLabel("Search eligible notification recipients", {
                exact: false,
              })
              .fill(recipientPrefix);
            for (let pageNumber = 2; pageNumber <= 8; pageNumber++) {
              await expect(
                dialog.getByRole("button", {
                  name: "Next recipients",
                  exact: true,
                }),
              ).toBeEnabled();
              await dialog
                .getByRole("button", { name: "Next recipients", exact: true })
                .click();
              await expect(
                dialog.getByText(
                  "Recipient page " + pageNumber + " of 8 · 215 matching",
                  { exact: true },
                ),
              ).toBeVisible();
            }
            const choice = dialog.getByRole("checkbox", {
              name: new RegExp(recipientPrefix + " 215"),
            });
            await expect(choice).toBeEnabled();
            await choice.check();
            if (position === "after")
              check(
                true,
                "paged recipient search reaches the 215th owned eligible account" +
                  label,
              );
            await dialog
              .getByLabel("Delivery confirmation", { exact: false })
              .fill("DELIVERY " + source.id);
            await dialog
              .getByLabel("Current password", { exact: true })
              .fill(password);
            if (position === "after") {
              const count = attempts.length;
              failCandidates = true;
              await dialog
                .getByRole("button", {
                  name: "Recheck delivery recipients",
                  exact: true,
                })
                .click();
              await expect(
                dialog.getByText("Fictional delivery-recipient interruption.", {
                  exact: true,
                }),
              ).toBeVisible();
              await expect(
                dialog.getByRole("button", {
                  name: "Confirm delivery review",
                  exact: true,
                }),
              ).toBeDisabled();
              check(
                attempts.length === count &&
                  (
                    await dialog
                      .getByRole("region", {
                        name: "Selected chapter recipients",
                      })
                      .textContent()
                  ).includes("215"),
                "candidate outage retains the proposed recipient and pauses its approval" +
                  label,
              );
              failCandidates = false;
              await dialog
                .getByRole("button", {
                  name: "Recheck delivery recipients",
                  exact: true,
                })
                .click();
              await expect(
                dialog.getByText("Fictional delivery-recipient interruption.", {
                  exact: true,
                }),
              ).toHaveCount(0);
            }
          } else {
            if (position === "after") {
              await dialog
                .getByRole("button", { name: "Close", exact: true })
                .click();
              checked(
                await h.db
                  .from("admin_users")
                  .update({ is_active: false })
                  .eq("id", selectedId),
              );
              dialog = await openDelivery();
              await expect(
                dialog.getByText(
                  /They stay in this proposal until you explicitly remove/,
                ),
              ).toBeVisible();
              await dialog
                .getByLabel("Delivery confirmation", { exact: false })
                .fill("DELIVERY " + source.id);
              await dialog
                .getByLabel("Current password", { exact: true })
                .fill(password);
              await expect(
                dialog.getByRole("button", {
                  name: "Confirm delivery review",
                  exact: true,
                }),
              ).toBeDisabled();
              check(
                (
                  await dialog
                    .getByRole("region", {
                      name: "Selected chapter recipients",
                    })
                    .textContent()
                ).includes("Unavailable chapter account"),
                "unavailable configured recipients stay visible and require explicit removal" +
                  label,
              );
            }
            await dialog
              .getByRole("region", { name: "Selected chapter recipients" })
              .getByRole("button", { name: /Remove notification recipient/ })
              .click();
          }
          await dialog
            .getByLabel("Delivery confirmation", { exact: false })
            .fill("DELIVERY " + source.id);
          await dialog
            .getByLabel("Current password", { exact: true })
            .fill(password);
          const before = data(await h.call(path)),
            auditsBefore = checked(
              await h.db
                .from("admin_actions")
                .select("id")
                .eq("target_id", source.id)
                .eq("action", "forms.delivery_reviewed"),
            ).length,
            start = attempts.length;
          loss = position;
          await dialog
            .getByRole("button", {
              name: "Confirm delivery review",
              exact: true,
            })
            .click();
          const recovery = dialog.getByRole("region", {
            name: "Unconfirmed delivery review",
            exact: true,
          });
          await expect(recovery).toBeVisible();
          const original = attempts.at(-1),
            document = JSON.parse(original.body);
          check(
            attempts.length === start + 1 &&
              document.formRevision === source.revision &&
              document.policyRevision === before.revision &&
              JSON.stringify(document.notificationUsers) ===
                JSON.stringify(enabled ? [selectedId] : []) &&
              original.hasFreshProof,
            "delivery " +
              (enabled ? "enable" : "disable") +
              " " +
              position +
              " freezes draft/policy/recipient intent without proof" +
              label,
          );
          await expect(
            dialog.getByLabel("Current password", { exact: true }),
          ).toHaveValue("");
          if (position === "after" && enabled) {
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
              ).violations.map((value) => value.id),
            );
            check(
              !violations.length,
              "populated uncertain delivery review passes measured axe" +
                label +
                (violations.length ? ": " + JSON.stringify(violations) : ""),
            );
            await recovery.scrollIntoViewIfNeeded();
            await page.screenshot({
              path: new URL(
                "delivery-recovery-" + viewport.width + ".png",
                output,
              ).pathname,
              fullPage: false,
              animations: "disabled",
            });
          }
          await recovery
            .getByRole("button", {
              name: "Check original delivery outcome",
              exact: true,
            })
            .click();
          if (position === "before") {
            await expect(
              recovery.getByText(/No committed receipt was found/),
            ).toBeVisible();
            await expect(
              recovery.getByRole("button", {
                name: "Retry identical delivery review",
                exact: true,
              }),
            ).toBeDisabled();
            await recovery
              .getByLabel("Current password for identical retry", {
                exact: false,
              })
              .fill(password);
            await recovery
              .getByRole("button", {
                name: "Retry identical delivery review",
                exact: true,
              })
              .click();
          }
          await expect(recovery).toHaveCount(0);
          await expect(
            dialog.getByText(
              new RegExp(
                "Delivery review confirmed at policy revision " +
                  (before.revision + 1),
              ),
            ),
          ).toBeVisible();
          check(
            attempts.length === start + (position === "before" ? 2 : 1) &&
              attempts
                .slice(start)
                .every(
                  (attempt) =>
                    attempt.key === original.key &&
                    attempt.body === original.body &&
                    attempt.hasFreshProof,
                ),
            "delivery " +
              (enabled ? "enable" : "disable") +
              " " +
              position +
              " reconciles read-only or explicitly retries with fresh proof" +
              label,
          );
          const current = data(await h.call(path));
          check(
            current.revision === before.revision + 1 &&
              JSON.stringify(current.notificationUsers) ===
                JSON.stringify(enabled ? [selectedId] : []) &&
              checked(
                await h.db
                  .from("admin_actions")
                  .select("id")
                  .eq("target_id", source.id)
                  .eq("action", "forms.delivery_reviewed"),
              ).length ===
                auditsBefore + 1,
            "delivery " +
              (enabled ? "enable" : "disable") +
              " " +
              position +
              " advances exactly one policy revision/audit" +
              label,
          );
        }
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      if (viewport.width === 375)
        await page
          .getByRole("dialog", { name: "Form settings", exact: true })
          .getByRole("button", { name: "Close", exact: true })
          .click();
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
        "delivery approval leaves draft/publication/response state unchanged and queues no delivery" +
          label,
      );
      check(
        !unexpected.length &&
          !errors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "delivery recovery has no unexpected writes, external requests, script errors or page overflow" +
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
    const forms = checked(
      await h.db
        .from("forms")
        .select("id")
        .in("owner_id", [actor, secondActor]),
    );
    for (const form of forms) {
      const current = data(await h.call("/admin/forms/" + form.id)).form;
      if (current.status !== "Archived")
        data(
          await h.call("/admin/forms/" + form.id, {
            method: "DELETE",
            body: { revision: current.revision },
          }),
        );
    }
    const owned = [actor, secondActor, outsider, ...recipientIds];
    for (let index = 0; index < owned.length; index += 50) {
      const batch = owned.slice(index, index + 50);
      checked(
        await h.db
          .from("admin_users")
          .update({ is_active: false, deleted_at: new Date().toISOString() })
          .in("id", batch),
      );
      checked(
        await h.db
          .from("admin_sessions")
          .update({ revoked_at: new Date().toISOString() })
          .in("admin_user_id", batch)
          .is("revoked_at", null),
      );
    }
  }
  await writeFile(
    new URL(
      "../.docs/phase0/local-form-delivery-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and desktop/mobile Chromium delivery review recovery. Two fresh fictional private drafts, 215 owned fictional recipient accounts, fresh officer per viewport. Candidate inventory scoped to fixture names. Beyond-200 selection, retained proposal on candidate outage, explicit unavailable-recipient removal, both enable/disable loss positions, original policy body/key, fresh retry proof, single audits and measured axe. No publication/responses/jobs/workers/provider sends/existing chapter or production changes. Forms archived/accounts disabled/sessions revoked. Captures unapproved; no proof/key/body material retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
