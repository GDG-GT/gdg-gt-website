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
  password = "Fictional-history-read-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-history-read-" + id + "@example.test",
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-form-history-read/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false;
const checked = (r) => {
  if (r.error)
    throw Error("Owned history-read database operation failed " + r.error.code);
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned history-read API failed " + r.status + " " + r.json?.error?.code,
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
    "Fictional history-read " + label + " " + marker,
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
        slug: "fictional-history-read-" + label + "-" + marker,
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
        display_name: "Fictional history-read reviewer " + marker,
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
    let source = await create("history-" + viewport.width);
    const root = "/admin/forms/" + source.id,
      label = " at " + viewport.width + "×" + viewport.height;
    source = data(
      await h.call(root + "/publish", {
        method: "POST",
        body: { revision: source.revision },
      }),
    ).form;
    const published = data(await h.call("/forms/" + source.slug)).form,
      fields = source.fields,
      respondent = {
        name: "Fictional History Respondent",
        email: email(actor),
      },
      answers = {
        [fields[0].id]: "Original fictional historical answer",
        [fields[1].id]: email(actor),
      },
      committed = data(
        await h.call("/forms/" + source.slug + "/submissions", {
          method: "POST",
          key: randomUUID(),
          body: {
            versionId: published.versionId,
            respondent,
            answers,
            copyRequested: false,
            website: "",
          },
        }),
      );
    data(
      await h.call("/forms/" + source.slug + "/edits", {
        method: "POST",
        key: randomUUID(),
        body: {
          respondent,
          versionId: published.versionId,
          editToken: committed.editToken,
          revision: 0,
          answers: {
            ...answers,
            [fields[0].id]: "Updated fictional current answer",
          },
        },
      }),
    );
    const historyPath =
        root + "/responses/" + committed.responseId + "/history",
      original = data(await h.call(historyPath + "/0"));
    check(
      (await other.call(historyPath)).status === 404 &&
        (await h.call(historyPath, { anonymous: true })).status === 401,
      "history conceals owned response from anonymous and unrelated readers" +
        label,
    );
    check(
      original.fields[0].value === answers[fields[0].id] &&
        original.fields[1].masked &&
        original.fields[1].value === null,
      "original history keeps immutable questions and default sensitive masking" +
        label,
    );
    const baselineJobs = checked(
      await h.db
        .from("delivery_jobs")
        .select("id")
        .eq("payload->>formId", source.id),
    )
      .map((job) => job.id)
      .sort();
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
      let failList = false,
        failRevision = false,
        deny = false;
      page.on("pageerror", (e) => errors.push(e.name));
      await page.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (url.origin !== h.env.APP_ORIGIN) {
          forbidden.push("external request");
          await route.abort("blockedbyclient");
          return;
        }
        if (
          url.pathname.startsWith("/api/") &&
          !["GET", "HEAD"].includes(request.method())
        ) {
          if (
            ["/api/v1/auth/realtime-token", "/api/v1/realtime/token"].includes(
              url.pathname,
            )
          ) {
            await route.fulfill({
              status: 503,
              json: {
                error: {
                  code: "UNAVAILABLE",
                  message: "Realtime paused for history-read verification.",
                },
              },
            });
            return;
          }
          writes.push("unexpected mutation");
          await route.abort("blockedbyclient");
          return;
        }
        const path = url.pathname.replace("/api/v1", "");
        if (path === historyPath || path === historyPath + "/0") {
          const failure = deny
            ? 403
            : (path === historyPath ? failList : failRevision)
              ? 503
              : 0;
          if (failure) {
            await route.fulfill({
              status: failure,
              json: {
                error: {
                  code: failure === 403 ? "FORBIDDEN" : "UNAVAILABLE",
                  message: "Fictional history recovery interruption.",
                },
              },
            });
            return;
          }
        }
        await route.continue();
      });
      await page.goto(h.env.APP_ORIGIN + root + "/responses");
      await page
        .getByRole("button", {
          name: "Open response " + committed.responseId,
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog"),
        history = dialog.getByRole("region", {
          name: "Response revision history",
          exact: true,
        });
      await history
        .getByRole("button", { name: "Review revision history" })
        .click();
      failRevision = true;
      await history
        .getByRole("button", { name: "Revision 0", exact: true })
        .click();
      await expect(
        history.getByText("Fictional history recovery interruption.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        history.getByText("2 revisions · Form version 1"),
      ).toBeVisible();
      check(
        await history
          .getByRole("button", { name: "Revision 0", exact: true })
          .isEnabled(),
        "selected read failure leaves inventory usable" + label,
      );
      failRevision = false;
      await history
        .getByRole("button", { name: "Reload selected revision" })
        .click();
      await expect(
        history.getByText(answers[fields[0].id], { exact: true }),
      ).toBeVisible();
      await expect(
        history.getByText("Hidden by default", { exact: true }),
      ).toBeVisible();
      check(
        true,
        "selected revision retries independently and preserves original masked answers" +
          label,
      );
      failRevision = true;
      await history
        .getByRole("button", { name: "Reload selected revision" })
        .click();
      await expect(
        history.getByText(/Last successful selected revision read/),
      ).toBeVisible();
      await expect(
        history.getByText(answers[fields[0].id], { exact: true }),
      ).toBeVisible();
      check(
        true,
        "temporary selected reread retains matching timestamped snapshot" +
          label,
      );
      failRevision = false;
      await history
        .getByRole("button", { name: "Reload selected revision" })
        .click();
      await expect(
        history.getByText("Fictional history recovery interruption.", {
          exact: true,
        }),
      ).toHaveCount(0);
      await history.getByRole("checkbox").check();
      await expect(
        history.getByText(email(actor), { exact: true }),
      ).toBeVisible();
      await history.getByRole("checkbox").uncheck();
      await expect(
        history.getByText(email(actor), { exact: true }),
      ).toHaveCount(0);
      await expect(
        history.getByText("Hidden by default", { exact: true }),
      ).toBeVisible();
      check(
        true,
        "explicit sensitive reveal is audited and returning to masking clears revealed value" +
          label,
      );
      failList = true;
      await history
        .getByRole("button", { name: "Reload history", exact: true })
        .click();
      await expect(
        history.getByText(/Last successful history read/),
      ).toBeVisible();
      await expect(
        history.getByRole("button", { name: "Revision 0", exact: true }),
      ).toBeDisabled();
      await expect(
        history.getByText(answers[fields[0].id], { exact: true }),
      ).toBeVisible();
      check(
        true,
        "inventory failure retains matching history and selection with paused new choices" +
          label,
      );
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
            },
          })
        ).violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      );
      check(
        !violations.length,
        "populated paused response history passes measured axe" +
          label +
          (violations.length ? ": " + JSON.stringify(violations) : ""),
      );
      await dialog.evaluate((element) => (element.scrollTop = 0));
      await page.screenshot({
        path: new URL("history-paused-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
      failList = false;
      deny = true;
      await history
        .getByRole("button", { name: "Reload history", exact: true })
        .click();
      await expect(
        history.getByText(
          "Private history and selected answers have been cleared.",
        ),
      ).toBeVisible();
      await expect(
        history.getByText(answers[fields[0].id], { exact: true }),
      ).toHaveCount(0);
      await expect(
        history.getByRole("button", { name: "Revision 0", exact: true }),
      ).toHaveCount(0);
      deny = false;
      await history
        .getByRole("button", { name: "Recheck response history access" })
        .click();
      await expect(
        history.getByRole("button", { name: "Revision 0", exact: true }),
      ).toBeEnabled();
      await expect(
        history.getByText(answers[fields[0].id], { exact: true }),
      ).toHaveCount(0);
      check(
        true,
        "denial clears inventory and selected values until explicit access recheck" +
          label,
      );
      const current = data(await h.call(historyPath)),
        sourceAfter = data(await h.call(root)).form,
        jobs = checked(
          await h.db
            .from("delivery_jobs")
            .select("id")
            .eq("payload->>formId", source.id),
        ),
        audit = checked(
          await h.db
            .from("admin_actions")
            .select("action,metadata")
            .eq("target_id", committed.responseId),
        );
      check(
        current.total === 2 &&
          current.currentRevision === 1 &&
          sourceAfter.revision === source.revision &&
          sourceAfter.versions.length === 1 &&
          JSON.stringify(jobs.map((job) => job.id).sort()) ===
            JSON.stringify(baselineJobs),
        "read-only inspection creates no additional response revision, publication or delivery job" +
          label,
      );
      check(
        audit.some(
          (entry) => entry.action === "forms.sensitive_history_viewed",
        ) &&
          !JSON.stringify(audit).includes(answers[fields[0].id]) &&
          !JSON.stringify(audit).includes(email(actor)),
        "history audit contains identifiers rather than answers or identity" +
          label,
      );
      check(
        !writes.length &&
          !forbidden.length &&
          !errors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "history recovery has no unexpected write, script error, external request or overflow" +
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
      "../.docs/phase0/local-form-history-read-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and Chromium desktop/mobile response-history recovery. Two fresh owned fictional internal forms, one intended response and one respondent edit per form; no requested copy or chapter notification send. Browser mutations and external requests blocked; realtime paused. Read failures retain matching timestamped snapshots independently; denial clears history; sensitive reveal audits contain references only. No extra response revision, publication or delivery job from browser inspection. Submission queues one metadata notification job per fixture; all owned jobs disabled/secret payloads cleared without running a worker. Forms archived, accounts disabled and sessions revoked. No worker/provider send, existing chapter or production change. Captures ignored/unapproved.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
