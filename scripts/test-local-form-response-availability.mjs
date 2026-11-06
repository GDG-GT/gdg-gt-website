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
  outsider = randomUUID(),
  password = "Fictional-response-availability-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-response-availability-" + id + "@example.test",
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-form-response-availability/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false;
const checked = (r) => {
  if (r.error)
    throw Error(
      "Owned response-availability database operation failed " + r.error.code,
    );
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned response-availability API failed " +
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
    "Fictional response-availability " + label + " " + marker,
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
        slug: "fictional-response-availability-" + label + "-" + marker,
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
    await h.db
      .from("admin_users")
      .insert(
        [actor, outsider].map((id) => ({
          id,
          email: email(id),
          password_hash: hash,
          role: id === actor ? "admin" : "team_member",
          is_active: true,
          display_name: "Fictional availability reviewer " + marker,
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
    let source = await create("availability-" + viewport.width);
    const root = "/admin/forms/" + source.id,
      label = " at " + viewport.width + "×" + viewport.height;
    source = data(
      await h.call(root + "/publish", {
        method: "POST",
        body: { revision: source.revision },
      }),
    ).form;
    const initialRevision = source.revision,
      initialVersions = source.versions.map((v) => v.version);
    check(
      (await other.call(root + "/responses")).status === 404 &&
        (await h.call(root + "/responses", { anonymous: true })).status === 401,
      "response workspace remains private" + label,
    );
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    try {
      for (const [path, body] of [
        ["/auth/gate", { code: h.credentials.gateCode }],
        ["/auth/login", { email: email(actor), password }],
      ]) {
        const r = await context.request.post(
          h.env.APP_ORIGIN + "/api/v1" + path,
          { headers: { Origin: h.env.APP_ORIGIN }, data: body },
        );
        if (r.status() !== 200)
          throw Error("Owned availability login failed " + r.status());
      }
      const page = await context.newPage(),
        attempts = [],
        unexpected = [],
        errors = [];
      let loss = "";
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
        if (api && !["GET", "HEAD"].includes(request.method())) {
          if (["/auth/realtime-token", "/realtime/token"].includes(path))
            return route.fulfill({
              status: 503,
              json: {
                error: {
                  code: "UNAVAILABLE",
                  message:
                    "Realtime paused for owned availability verification.",
                },
              },
            });
          if (path !== root + "/state" || request.method() !== "POST") {
            unexpected.push("unexpected mutation");
            return route.abort("blockedbyclient");
          }
          attempts.push({
            key: request.headers()["idempotency-key"],
            body: request.postData(),
          });
          if (loss) {
            const position = loss;
            loss = "";
            if (position === "after") {
              const r = await route.fetch();
              if (r.status() !== 200)
                throw Error(
                  "Owned availability before loss failed " + r.status(),
                );
            }
            return route.abort("connectionfailed");
          }
        }
        return route.continue();
      });
      await page.goto(h.env.APP_ORIGIN + root + "/responses");
      for (const position of ["after", "before"])
        for (const state of ["Closed", "Open"]) {
          const labelAction = state === "Closed" ? "Close form" : "Reopen form",
            action = state === "Closed" ? "close" : "reopen",
            before = data(await h.call(root)).form;
          await expect(
            page.getByRole("button", { name: labelAction, exact: true }),
          ).toBeEnabled();
          await page
            .getByRole("button", { name: labelAction, exact: true })
            .click();
          const dialog = page.getByRole("dialog");
          await expect(
            dialog.getByRole("heading", {
              name: labelAction + "?",
              exact: true,
            }),
          ).toBeVisible();
          const count = attempts.length;
          loss = position;
          await dialog
            .getByRole("button", { name: labelAction, exact: true })
            .click();
          const recovery = dialog.getByRole("region", {
            name: "Unconfirmed form library change",
            exact: true,
          });
          await expect(recovery).toBeVisible();
          const original = attempts.at(-1);
          check(
            attempts.length === count + 1 &&
              JSON.parse(original.body).revision === before.revision &&
              JSON.parse(original.body).state === state,
            "reviewed " +
              action +
              " freezes the original revision/state before " +
              position +
              " loss" +
              label,
          );
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
            "uncertain " +
              action +
              " " +
              position +
              " passes measured axe" +
              label +
              (violations.length ? ": " + JSON.stringify(violations) : ""),
          );
          if (position === "after" && state === "Closed") {
            await recovery.scrollIntoViewIfNeeded();
            await page.screenshot({
              path: new URL("availability-" + viewport.width + ".png", output)
                .pathname,
              fullPage: false,
              animations: "disabled",
            });
          }
          await recovery
            .getByRole("button", {
              name: "Recheck original library change",
              exact: true,
            })
            .click();
          if (position === "before")
            await recovery
              .getByRole("button", {
                name: "Retry this exact " + action + " request",
                exact: true,
              })
              .click();
          await expect(dialog).toHaveCount(0);
          await expect(
            page.getByText(
              "Original availability change confirmed. Current saved state: " +
                state +
                ".",
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
            action +
              " " +
              position +
              " recovers read-only or retries exactly one original key/body" +
              label,
          );
          const saved = data(await h.call(root)).form;
          check(
            saved.status === state &&
              saved.revision === before.revision + 1 &&
              JSON.stringify(saved.versions.map((v) => v.version)) ===
                JSON.stringify(initialVersions),
            action +
              " " +
              position +
              " commits one state revision without publication" +
              label,
          );
        }
      const audit = checked(
        await h.db
          .from("admin_actions")
          .select("id")
          .eq("target_id", source.id)
          .eq("action", "forms.state"),
      );
      const responses = checked(
          await h.db
            .from("form_responses")
            .select("id")
            .eq("form_id", source.id),
        ),
        jobs = checked(
          await h.db
            .from("delivery_jobs")
            .select("id")
            .eq("payload->>formId", source.id),
        );
      check(
        audit.length === 4 &&
          data(await h.call(root)).form.revision === initialRevision + 4 &&
          !responses.length &&
          !jobs.length,
        "four reviewed availability changes create four audits and no responses/delivery jobs" +
          label,
      );
      check(
        !unexpected.length &&
          !errors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "availability recovery has no unexpected writes, external requests, script errors or page overflow" +
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
      await h.db.from("forms").select("id").eq("owner_id", actor),
    );
    for (const f of forms) {
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
        .in("id", [actor, outsider]),
    );
    checked(
      await h.db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .in("admin_user_id", [actor, outsider])
        .is("revoked_at", null),
    );
  }
  await writeFile(
    new URL(
      "../.docs/phase0/local-form-response-availability.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and desktop/mobile Chromium response-workspace close/reopen recovery. Two fresh fictional internal forms each published once, four intended availability changes each. Before/after-acceptance loss, original revision/state/key/body, read-only accepted reconciliation, exact explicit retries, single state revision/audit and measured axe. Zero responses/delivery jobs/workers/provider sends/existing chapter or production changes. Owned forms archived/accounts disabled/sessions revoked. Captures unapproved.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
