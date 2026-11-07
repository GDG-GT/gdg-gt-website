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
  password = "Fictional-export-recovery-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-export-recovery-" + id + "@example.test",
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-form-export-recovery/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false;
const checked = (r) => {
  if (r.error)
    throw Error(
      "Owned export-recovery database operation failed " + r.error.code,
    );
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned export-recovery API failed " +
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
    "Fictional export-recovery " + label + " " + marker,
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
        slug: "fictional-export-recovery-" + label + "-" + marker,
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
      [actor, outsider].map((id) => ({
        id,
        email: email(id),
        password_hash: hash,
        role: id === actor ? "admin" : "team_member",
        is_active: true,
        display_name: "Fictional export-recovery reviewer " + marker,
      })),
    ),
  );
  created = true;
  await login(h, actor);
  await login(other, outsider);
  const concurrent = await create("concurrent"),
    concurrentRoot = "/admin/forms/" + concurrent.id + "/exports",
    createKey = randomUUID(),
    cancelKey = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      h.call(concurrentRoot, {
        method: "POST",
        body: { format: "csv" },
        key: createKey,
      }),
    ),
  );
  const concurrentJob = data(results[0]).job;
  check(
    results.every((result) => data(result).job.id === concurrentJob.id) &&
      checked(
        await h.db
          .from("form_export_jobs")
          .select("id")
          .eq("form_id", concurrent.id),
      ).length === 1,
    "ten concurrent identical export creations produce one owned job",
  );
  const cancellations = await Promise.all(
    Array.from({ length: 10 }, () =>
      h.call(concurrentRoot + "/" + concurrentJob.id, {
        method: "DELETE",
        body: {},
        key: cancelKey,
      }),
    ),
  );
  const concurrentAudit = checked(
    await h.db
      .from("admin_actions")
      .select("action")
      .eq("target_id", concurrentJob.id),
  );
  check(
    cancellations.every((result) => data(result).job.state === "cancelled") &&
      concurrentAudit.filter((entry) => entry.action === "forms.export_queued")
        .length === 1 &&
      concurrentAudit.filter(
        (entry) => entry.action === "forms.export_cancelled",
      ).length === 1,
    "ten concurrent identical export removals preserve exactly one creation and cancellation audit",
  );
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const source = await create("exports-" + viewport.width),
      root = "/admin/forms/" + source.id,
      exportsPath = root + "/exports",
      label = " at " + viewport.width + "×" + viewport.height;
    check(
      (await other.call(exportsPath)).status === 404 &&
        (await h.call(exportsPath, { anonymous: true })).status === 401,
      "private export inventory conceals owned form from unrelated and anonymous readers" +
        label,
    );
    const baselineRevision = source.revision;
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
          throw Error("Owned archived browser login failed " + r.status());
      }
      const page = await context.newPage(),
        writes = [],
        errors = [],
        forbidden = [];
      let loss = "",
        loseAction = "",
        failRead = false,
        denyRead = false;
      const attempts = [];
      page.on("pageerror", (e) => errors.push(e.name));
      await page.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (url.origin !== h.env.APP_ORIGIN) {
          forbidden.push("external request");
          await route.abort("blockedbyclient");
          return;
        }
        const path = url.pathname.replace("/api/v1", ""),
          apiRequest = url.pathname.startsWith("/api/v1/");
        if (apiRequest && !["GET", "HEAD"].includes(request.method())) {
          if (["/auth/realtime-token", "/realtime/token"].includes(path)) {
            await route.fulfill({
              status: 503,
              json: {
                error: {
                  code: "UNAVAILABLE",
                  message: "Realtime paused for export verification.",
                },
              },
            });
            return;
          }
          const action =
            request.method() === "POST" && path === exportsPath
              ? "create"
              : request.method() === "DELETE" &&
                  new RegExp("^" + exportsPath + "/[a-f0-9-]{36}$").test(path)
                ? "cancel"
                : "";
          if (!action) {
            writes.push("unexpected mutation");
            await route.abort("blockedbyclient");
            return;
          }
          attempts.push({
            action,
            key: request.headers()["idempotency-key"],
            body: request.postData(),
          });
          if (loss && action === loseAction) {
            const position = loss;
            loss = "";
            if (position === "after") {
              const response = await route.fetch();
              if (response.status() !== 200)
                throw Error(
                  "Owned export write before response loss failed " +
                    response.status(),
                );
            }
            await route.abort("connectionfailed");
            return;
          }
          await route.continue();
          return;
        }
        if (
          apiRequest &&
          path === exportsPath &&
          request.method() === "GET" &&
          (failRead || denyRead)
        ) {
          await route.fulfill({
            status: denyRead ? 403 : 503,
            json: {
              error: {
                code: denyRead ? "FORBIDDEN" : "UNAVAILABLE",
                message: "Fictional export inventory interruption.",
              },
            },
          });
          return;
        }
        await route.continue();
      });
      await page.goto(h.env.APP_ORIGIN + root + "/responses");
      const panel = page.getByRole("region", {
        name: "Background response exports",
        exact: true,
      });
      await expect(
        panel.getByRole("button", { name: "Review export", exact: true }),
      ).toBeEnabled();
      for (const position of ["after", "before"]) {
        loss = position;
        loseAction = "create";
        await panel
          .getByRole("button", { name: "Review export", exact: true })
          .click();
        await panel
          .getByRole("button", { name: "Create export", exact: true })
          .click();
        await expect(
          panel.getByRole("region", {
            name: "Unconfirmed export change",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          panel.getByRole("button", {
            name: "Retry identical export change",
            exact: true,
          }),
        ).toBeDisabled();
        const original = attempts.at(-1),
          count = attempts.length;
        await panel
          .getByRole("button", {
            name: "Check original export outcome",
            exact: true,
          })
          .click();
        if (position === "before") {
          await expect(
            panel.getByText(/No committed receipt was found/),
          ).toBeVisible();
          await panel
            .getByRole("button", {
              name: "Retry identical export change",
              exact: true,
            })
            .click();
        }
        await expect(
          panel.getByText(/Original export request confirmed/),
        ).toBeVisible();
        if (position === "before")
          check(
            attempts.at(-1).key === original.key &&
              attempts.at(-1).body === original.body,
            "unaccepted export creation retries its identical original key/body" +
              label,
          );
        check(
          attempts.length === count + (position === "before" ? 1 : 0),
          "export creation " +
            position +
            "-acceptance loss reconciles without replacement writes" +
            label,
        );
        const owned = checked(
            await h.db
              .from("form_export_jobs")
              .select("id,state,response_count")
              .eq("form_id", source.id)
              .eq("requester_id", actor)
              .order("created_at", { ascending: false }),
          ),
          activeJob = owned.find((job) => job.state === "pending");
        check(
          !!activeJob &&
            owned.length === (position === "after" ? 1 : 2) &&
            activeJob.response_count === 0,
          "creation " +
            position +
            " loss leaves exactly one intended zero-response job" +
            label,
        );
        failRead = true;
        await panel
          .getByRole("button", { name: "Refresh exports", exact: true })
          .click();
        await expect(
          panel.getByText("Fictional export inventory interruption.", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          panel.getByText(/Last successful export inventory read/),
        ).toBeVisible();
        await expect(
          panel.getByRole("button", { name: "Review export", exact: true }),
        ).toBeDisabled();
        check(
          (await panel
            .getByText("CSV · 0 responses", { exact: true })
            .count()) > 0,
          "export inventory outage retains matching jobs with actions paused" +
            label,
        );
        failRead = false;
        await panel
          .getByRole("button", { name: "Refresh exports", exact: true })
          .click();
        await expect(
          panel.getByRole("button", { name: "Review export", exact: true }),
        ).toBeEnabled();
        loss = position;
        loseAction = "cancel";
        await panel
          .getByRole("button", {
            name: new RegExp("Remove export.*" + activeJob.id),
          })
          .click();
        await panel
          .getByRole("button", { name: "Confirm removal", exact: true })
          .click();
        await expect(
          panel.getByRole("region", {
            name: "Unconfirmed export change",
            exact: true,
          }),
        ).toBeVisible();
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
          ).violations.map((v) => ({
            id: v.id,
            targets: v.nodes.map((n) => n.target),
          })),
        );
        check(
          !violations.length,
          "populated uncertain export removal passes measured axe" +
            label +
            (violations.length ? ": " + JSON.stringify(violations) : ""),
        );
        if (position === "after") {
          await panel
            .getByRole("region", {
              name: "Unconfirmed export change",
              exact: true,
            })
            .scrollIntoViewIfNeeded();
          await page.screenshot({
            path: new URL("export-recovery-" + viewport.width + ".png", output)
              .pathname,
            fullPage: false,
            animations: "disabled",
          });
        }
        const cancelCount = attempts.length,
          originalCancel = attempts.at(-1);
        await panel
          .getByRole("button", {
            name: "Check original export outcome",
            exact: true,
          })
          .click();
        if (position === "before") {
          await expect(
            panel.getByText(/No committed receipt was found/),
          ).toBeVisible();
          await panel
            .getByRole("button", {
              name: "Retry identical export change",
              exact: true,
            })
            .click();
        }
        await expect(panel.getByText(/Export removal confirmed/)).toBeVisible();
        if (position === "before")
          check(
            attempts.at(-1).key === originalCancel.key &&
              attempts.at(-1).body === originalCancel.body,
            "unaccepted export removal retries its identical original key/body" +
              label,
          );
        check(
          attempts.length === cancelCount + (position === "before" ? 1 : 0),
          "export removal " +
            position +
            "-acceptance loss reconciles without repeat cancellation" +
            label,
        );
        const audit = checked(
          await h.db
            .from("admin_actions")
            .select("action,metadata")
            .eq("target_id", activeJob.id),
        );
        check(
          audit.filter((entry) => entry.action === "forms.export_queued")
            .length === 1 &&
            audit.filter((entry) => entry.action === "forms.export_cancelled")
              .length === 1,
          "creation/removal " +
            position +
            " loss each has exactly one accepted audit" +
            label,
        );
      }
      denyRead = true;
      await panel
        .getByRole("button", { name: "Refresh exports", exact: true })
        .click();
      await expect(
        panel.getByRole("button", {
          name: "Recheck export access",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        panel.getByText("CSV · 0 responses", { exact: true }),
      ).toHaveCount(0);
      denyRead = false;
      await panel
        .getByRole("button", { name: "Recheck export access", exact: true })
        .click();
      await expect(
        panel.getByRole("button", { name: "Review export", exact: true }),
      ).toBeEnabled();
      check(
        true,
        "export denial clears private inventory until explicit access recheck" +
          label,
      );
      const final = data(await h.call(root)).form,
        responses = checked(
          await h.db
            .from("form_responses")
            .select("id")
            .eq("form_id", source.id),
        ),
        owned = checked(
          await h.db
            .from("form_export_jobs")
            .select("state")
            .eq("form_id", source.id),
        );
      check(
        final.revision === baselineRevision &&
          !final.versions.length &&
          !responses.length &&
          owned.length === 2 &&
          owned.every((job) => job.state === "cancelled"),
        "export verification creates only two cancelled jobs, no publication, response or draft mutation" +
          label,
      );
      check(
        !writes.length &&
          !forbidden.length &&
          !errors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "export recovery has no unexpected write, external request, script error or overflow" +
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
      checked(
        await h.db
          .from("form_export_jobs")
          .update({
            state: "cancelled",
            private_object_key: null,
            lease_token: null,
            locked_until: null,
          })
          .eq("form_id", f.id),
      );
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
          .eq("payload->>formId", f.id)
          .neq("state", "completed"),
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
      "../.docs/phase0/local-form-export-write-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and desktop/mobile Chromium export intent recovery. Fresh fictional private draft forms with zero responses and no publication. Ten concurrent identical API creations/cancellations add one intended job with one audit per action. Each viewport creates and cancels two intended empty export jobs, covering before/after-acceptance loss, exact retries, one audit per action, retained inventory, denial clearing and measured axe. All other browser writes/external requests blocked, realtime paused. No export worker, file generation/download, provider send, existing chapter or production change. Owned jobs cancelled, forms archived/accounts disabled/sessions revoked; captures unapproved.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
