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
  password = "Fictional-privacy-recovery-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-privacy-recovery-" + id + "@example.test",
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-form-privacy-recovery/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false;
const checked = (r) => {
  if (r.error)
    throw Error(
      "Owned privacy-recovery database operation failed " + r.error.code,
    );
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned privacy-recovery API failed " +
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
    "Fictional privacy-recovery " + label + " " + marker,
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
        slug: "fictional-privacy-recovery-" + label + "-" + marker,
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
await mkdir(output, { recursive: true });
try {
  const hash = await hashSecret(password);
  checked(
    await h.db.from("admin_users").insert(
      [actor, secondActor, outsider].map((id) => ({
        id,
        email: email(id),
        password_hash: hash,
        role: id === outsider ? "team_member" : "admin",
        is_active: true,
        display_name: "Fictional privacy reviewer " + marker,
      })),
    ),
  );
  created = true;
  await login(h, actor);
  await login(other, outsider);
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const activeActor = viewport.width === 1440 ? actor : secondActor;
    await login(h, activeActor);
    let source = await create("privacy-" + viewport.width);
    const root = "/admin/forms/" + source.id,
      label = " at " + viewport.width + "×" + viewport.height;
    source = data(
      await h.call(root + "/publish", {
        method: "POST",
        body: { revision: source.revision },
      }),
    ).form;
    const published = data(await h.call("/forms/" + source.slug)).form;
    const accepted = data(
      await h.call("/forms/" + source.slug + "/submissions", {
        method: "POST",
        key: randomUUID(),
        body: {
          versionId: published.versionId,
          respondent: {
            name: "Fictional privacy respondent",
            email: email(activeActor),
          },
          answers: {
            [source.fields[0].id]: "Fictional private retained answer",
            [source.fields[1].id]: email(activeActor),
          },
          copyRequested: false,
          website: "",
        },
      }),
    );
    const responseId = accepted.responseId,
      responsePath = root + "/responses/" + responseId,
      baseline = checked(
        await h.db
          .from("form_responses")
          .select("revision,retention_expires_at")
          .eq("id", responseId)
          .single(),
      );
    const baselineJobs = checked(
      await h.db
        .from("delivery_jobs")
        .select("id")
        .eq("payload->>formId", source.id),
    )
      .map((j) => j.id)
      .sort();
    check(
      (await other.call(root + "/privacy")).status === 404 &&
        (await h.call(root + "/privacy", { anonymous: true })).status === 401,
      "retention settings conceal private owned state from unrelated/anonymous readers" +
        label,
    );
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    try {
      for (const [path, body] of [
        ["/auth/gate", { code: h.credentials.gateCode }],
        ["/auth/login", { email: email(activeActor), password }],
      ]) {
        const r = await context.request.post(
          h.env.APP_ORIGIN + "/api/v1" + path,
          { headers: { Origin: h.env.APP_ORIGIN }, data: body },
        );
        if (r.status() !== 200)
          throw Error("Owned privacy browser login failed " + r.status());
      }
      const page = await context.newPage(),
        attempts = [],
        unexpected = [],
        errors = [];
      let loss = "",
        target = "",
        readFailure = false,
        readDenial = false;
      page.on("pageerror", (e) => errors.push(e.name));
      await page.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          api = url.pathname.startsWith("/api/v1/"),
          path = url.pathname.replace("/api/v1", "");
        if (url.origin !== h.env.APP_ORIGIN) {
          unexpected.push("external request");
          return route.abort("blockedbyclient");
        }
        if (
          api &&
          request.method() === "GET" &&
          path === target &&
          (readFailure || readDenial)
        )
          return route.fulfill({
            status: readDenial ? 403 : 503,
            json: {
              error: {
                code: readDenial ? "FORBIDDEN" : "UNAVAILABLE",
                message: "Fictional privacy read interruption.",
              },
            },
          });
        if (api && !["GET", "HEAD"].includes(request.method())) {
          if (["/auth/realtime-token", "/realtime/token"].includes(path))
            return route.fulfill({
              status: 503,
              json: {
                error: {
                  code: "UNAVAILABLE",
                  message: "Realtime paused for owned privacy verification.",
                },
              },
            });
          if (path !== target || request.method() !== "POST") {
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
                  "Owned privacy write before response loss failed " +
                    r.status(),
                );
            }
            return route.abort("connectionfailed");
          }
        }
        return route.continue();
      });
      await page.goto(h.env.APP_ORIGIN + root + "/responses");
      for (const individual of [false, true]) {
        target = (individual ? responsePath : root) + "/privacy";
        const targetId = individual ? responseId : source.id,
          kind = individual ? "individual" : "form";
        if (individual) {
          await expect(
            page.getByRole("button", {
              name: "Open response " + responseId,
              exact: true,
            }),
          ).toBeEnabled();
          await page
            .getByRole("button", {
              name: "Open response " + responseId,
              exact: true,
            })
            .click();
          await page
            .getByRole("button", {
              name: "Review response retention & hold",
              exact: true,
            })
            .click();
        } else {
          await expect(
            page.getByRole("button", {
              name: "Retention & holds",
              exact: true,
            }),
          ).toBeEnabled();
          await page
            .getByRole("button", { name: "Retention & holds", exact: true })
            .click();
        }
        const dialog = page.getByRole("dialog");
        for (const position of ["after", "before"])
          for (const held of [true, false]) {
            const before = data(await h.call(target)),
              revision = individual ? before.responseRevision : before.revision,
              auditsBefore = checked(
                await h.db
                  .from("admin_actions")
                  .select("id")
                  .eq("target_id", targetId)
                  .in("action", ["forms.hold_reviewed", "forms.hold_released"]),
              ).length;
            const reason =
              "Fictional " +
              kind +
              " " +
              (held ? "hold" : "release") +
              " " +
              position +
              " review";
            await dialog.getByRole("checkbox").setChecked(held);
            await dialog
              .getByLabel("Private operational reason", { exact: false })
              .fill(reason);
            await dialog
              .getByLabel("Hold confirmation", { exact: false })
              .fill("HOLD " + targetId);
            await dialog
              .getByLabel("Current password", { exact: true })
              .fill(password);
            const start = attempts.length;
            loss = position;
            await dialog
              .getByRole("button", {
                name: "Confirm privacy review",
                exact: true,
              })
              .click();
            const recovery = dialog.getByRole("region", {
              name: "Unconfirmed privacy review",
              exact: true,
            });
            await expect(recovery).toBeVisible();
            const original = attempts.at(-1);
            check(
              attempts.length === start + 1 &&
                JSON.parse(original.body).revision === revision &&
                JSON.parse(original.body).held === held &&
                original.hasFreshProof,
              kind +
                " " +
                (held ? "hold" : "release") +
                " " +
                position +
                " captures only the original policy intent/key" +
                label,
            );
            await expect(
              dialog.getByLabel("Current password", { exact: true }),
            ).toHaveValue("");
            if (position === "after" && held) {
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
                kind +
                  " uncertain privacy review passes measured axe" +
                  label +
                  (violations.length ? ": " + JSON.stringify(violations) : ""),
              );
              await recovery.scrollIntoViewIfNeeded();
              await page.screenshot({
                path: new URL(
                  kind + "-privacy-recovery-" + viewport.width + ".png",
                  output,
                ).pathname,
                fullPage: false,
                animations: "disabled",
              });
            }
            await recovery
              .getByRole("button", {
                name: "Check original privacy outcome",
                exact: true,
              })
              .click();
            if (position === "before") {
              await expect(
                recovery.getByText(/No committed receipt was found/),
              ).toBeVisible();
              await expect(
                recovery.getByRole("button", {
                  name: "Retry identical privacy review",
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
                  name: "Retry identical privacy review",
                  exact: true,
                })
                .click();
            }
            await expect(recovery).toHaveCount(0);
            await expect(
              dialog.getByText(
                new RegExp(
                  "Privacy review confirmed at policy revision " +
                    (revision + 1),
                ),
              ),
            ).toBeVisible();
            check(
              attempts.length === start + (position === "before" ? 2 : 1) &&
                attempts
                  .slice(start)
                  .every(
                    (a) =>
                      a.key === original.key &&
                      a.body === original.body &&
                      a.hasFreshProof,
                  ),
              kind +
                " " +
                (held ? "hold" : "release") +
                " " +
                position +
                " uses read-only acceptance or original intent plus fresh explicit proof" +
                label,
            );
            const current = data(await h.call(target));
            check(
              (individual ? current.responseRevision : current.revision) ===
                revision + 1 &&
                (individual ? current.responseHeld : current.held) === held &&
                checked(
                  await h.db
                    .from("admin_actions")
                    .select("id")
                    .eq("target_id", targetId)
                    .in("action", [
                      "forms.hold_reviewed",
                      "forms.hold_released",
                    ]),
                ).length ===
                  auditsBefore + 1,
              kind +
                " " +
                (held ? "hold" : "release") +
                " " +
                position +
                " advances one policy revision and audit" +
                label,
            );
            await expect(
              dialog.getByRole("button", {
                name: "Confirm privacy review",
                exact: true,
              }),
            ).toBeDisabled();
          }
        await dialog
          .getByRole("button", { name: "Close", exact: true })
          .click();
        if (individual)
          await page
            .getByRole("dialog")
            .getByRole("button", { name: "Close", exact: true })
            .click();
      }
      const final = checked(
        await h.db
          .from("form_responses")
          .select("revision,retention_expires_at")
          .eq("id", responseId)
          .single(),
      );
      check(
        final.revision === baseline.revision &&
          final.retention_expires_at === baseline.retention_expires_at &&
          JSON.stringify(
            checked(
              await h.db
                .from("delivery_jobs")
                .select("id")
                .eq("payload->>formId", source.id),
            )
              .map((j) => j.id)
              .sort(),
          ) === JSON.stringify(baselineJobs),
        "privacy recovery never rewrites original answer revision/deadline or queues extra delivery" +
          label,
      );
      check(
        !unexpected.length &&
          !errors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "privacy recovery has no unexpected writes, external requests, script errors or page overflow" +
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
    for (const f of forms) {
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
          .eq("payload->>formId", f.id),
      );
      const form = data(await h.call("/admin/forms/" + f.id)).form;
      if (form.status !== "Archived")
        data(
          await h.call("/admin/forms/" + f.id, {
            method: "DELETE",
            body: { revision: form.revision },
          }),
        );
    }
    checked(
      await h.db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .in("id", [actor, secondActor, outsider]),
    );
    checked(
      await h.db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .in("admin_user_id", [actor, secondActor, outsider])
        .is("revoked_at", null),
    );
  }
  await writeFile(
    new URL(
      "../.docs/phase0/local-form-privacy-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and desktop/mobile Chromium privacy hold/release recovery. Two fresh fictional internal forms published once, one intended response each and one fresh fictional officer per viewport. Both form/individual targets and before/after-acceptance loss retain original policy body/key, require newly entered proof only for explicit retries, produce one revision/audit and pass measured axe. Response deadlines/answer revisions/delivery jobs unchanged. No workers/provider sends/existing chapter or production changes. Owned metadata jobs disabled/secrets cleared/forms archived/accounts disabled/sessions revoked. Captures unapproved; no password/key/body material retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
