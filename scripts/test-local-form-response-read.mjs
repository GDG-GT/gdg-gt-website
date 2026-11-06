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
  password = "Fictional-response-read-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-response-read-" + id + "@example.test",
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-form-response-read/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false;
const checked = (r) => {
  if (r.error)
    throw Error(
      "Owned response-read database operation failed " + r.error.code,
    );
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned response-read API failed " + r.status + " " + r.json?.error?.code,
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
    "Fictional response-read " + label + " " + marker,
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
        slug: "fictional-response-read-" + label + "-" + marker,
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
        display_name: "Fictional response-read reviewer " + marker,
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
    const responsesPath = root + "/responses",
      baselineJobs = checked(
        await h.db
          .from("delivery_jobs")
          .select("id")
          .eq("payload->>formId", source.id),
      )
        .map((job) => job.id)
        .sort();
    data(
      await h.call(root + "/views", {
        method: "POST",
        body: {
          name: "Fictional saved response view " + marker,
          filters: { status: "complete" },
          columns: [],
        },
      }),
    );
    check(
      (await other.call(responsesPath)).status === 404 &&
        (await h.call(responsesPath, { anonymous: true })).status === 401,
      "response inventory conceals owned form from anonymous and unrelated readers" +
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
      let failed = "responses",
        denied = "";
      const reads = [];
      const readName = (path) =>
        path === root
          ? "form"
          : path === root + "/responses"
            ? "responses"
            : path === root + "/analytics"
              ? "summary"
              : path === root + "/views"
                ? "views"
                : path === root + "/privacy"
                  ? "holds"
                  : "";
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
                  message: "Realtime paused for response-read verification.",
                },
              },
            });
            return;
          }
          writes.push("unexpected mutation");
          await route.abort("blockedbyclient");
          return;
        }
        const path = url.pathname.replace("/api/v1", ""),
          name = url.pathname.startsWith("/api/v1/") ? readName(path) : "";
        if (name && request.method() === "GET") {
          reads.push(name);
          if (name === failed || name === denied) {
            await route.fulfill({
              status: name === denied ? 403 : 503,
              json: {
                error: {
                  code: name === denied ? "FORBIDDEN" : "UNAVAILABLE",
                  message: "Fictional " + name + " recovery interruption.",
                },
              },
            });
            return;
          }
        }
        await route.continue();
      });
      await page.goto(h.env.APP_ORIGIN + root + "/responses?q=Fictional");
      await expect(
        page.getByText("Fictional responses recovery interruption.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: "1 matching responses",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("option", {
          name: "Fictional saved response view " + marker,
          exact: true,
        }),
      ).toHaveCount(1);
      check(
        true,
        "initial response outage differs from empty inventory while saved views load independently" +
          label,
      );
      failed = "";
      const before = [...reads];
      await page
        .getByRole("button", { name: "Reload responses", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "1 matching responses",
          exact: true,
        }),
      ).toBeVisible();
      check(
        JSON.stringify(reads.slice(before.length)) ===
          JSON.stringify(["responses"]),
        "response retry reads only its own current inventory" + label,
      );
      const proposed = page.getByLabel("New view name", { exact: false });
      await proposed.fill("Fictional proposed private view " + marker);
      failed = "views";
      await page
        .getByRole("button", { name: "Reload saved views", exact: true })
        .click();
      await expect(
        page.getByText("Fictional views recovery interruption.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(proposed).toHaveValue(
        "Fictional proposed private view " + marker,
      );
      await expect(
        page.getByRole("button", { name: "Save view", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByText(/Last successful saved views read/),
      ).toBeVisible();
      check(
        true,
        "saved-view failure retains timestamped options and proposed name with writes paused" +
          label,
      );
      failed = "responses";
      await page
        .getByRole("button", { name: "Reload responses", exact: true })
        .click();
      await expect(
        page.getByText("Fictional responses recovery interruption.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: "1 matching responses",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Open response " + committed.responseId,
          exact: true,
        }),
      ).toBeDisabled();
      await expect(
        page.getByText(/Last successful responses read/),
      ).toBeVisible();
      check(
        true,
        "temporary inventory failure retains matching rows and pauses new response actions" +
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
        "populated paused response workspace passes measured axe" +
          label +
          (violations.length ? ": " + JSON.stringify(violations) : ""),
      );
      await page
        .getByRole("region", { name: "Response inventory table", exact: true })
        .evaluate((element) => (element.scrollLeft = 0));
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: new URL("response-paused-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
      failed = "";
      await page
        .getByRole("button", { name: "Reload saved views", exact: true })
        .click();
      await expect(
        page.getByText("Fictional views recovery interruption.", {
          exact: true,
        }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Reload responses", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Open response " + committed.responseId,
          exact: true,
        }),
      ).toBeEnabled();
      failed = "holds";
      await page
        .getByRole("button", { name: "Reload hold status", exact: true })
        .click();
      await expect(
        page.getByText("Fictional holds recovery interruption.", {
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: "Open response " + committed.responseId,
          exact: true,
        })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Delete response", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Redact identity", exact: true }),
      ).toHaveCount(0);
      check(
        true,
        "failed hold read independently prevents destructive actions on the selected response" +
          label,
      );
      await page.keyboard.press("Escape");
      failed = "";
      await page
        .getByRole("button", { name: "Reload hold status", exact: true })
        .click();
      await expect(
        page.getByText("Fictional holds recovery interruption.", {
          exact: true,
        }),
      ).toHaveCount(0);
      await page.getByRole("tab", { name: "Summary", exact: true }).click();
      await expect(
        page.getByRole("heading", {
          name: "1 matching responses",
          exact: true,
        }),
      ).toBeVisible();
      failed = "summary";
      await page
        .getByRole("button", { name: "Reload summary", exact: true })
        .click();
      await expect(
        page.getByText("Fictional summary recovery interruption.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: "1 matching responses",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByText(/Last successful summary read/),
      ).toBeVisible();
      check(
        true,
        "summary failure retains its own matching timestamped aggregate" +
          label,
      );
      failed = "";
      denied = "summary";
      await page
        .getByRole("button", { name: "Reload summary", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Response access needs to be rechecked",
          exact: true,
        }),
      ).toBeVisible();
      await expect(proposed).toHaveCount(0);
      check(
        !new URL(page.url()).search,
        "denial clears response data, proposed preferences and private URL filters" +
          label,
      );
      denied = "";
      await page
        .getByRole("button", {
          name: "Recheck response workspace access",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "1 matching responses",
          exact: true,
        }),
      ).toBeVisible();
      await expect(proposed).toHaveValue("");
      check(
        true,
        "explicit access recheck restores authorized reads without restoring private proposals" +
          label,
      );
      const after = data(await h.call(root)).form,
        responses = data(await h.call(responsesPath)),
        jobs = checked(
          await h.db
            .from("delivery_jobs")
            .select("id")
            .eq("payload->>formId", source.id),
        ),
        saved = data(await h.call(root + "/views")).items;
      check(
        after.revision === source.revision &&
          after.versions.length === 1 &&
          responses.total === 1 &&
          saved.length === 1 &&
          JSON.stringify(jobs.map((job) => job.id).sort()) ===
            JSON.stringify(baselineJobs),
        "browser read recovery leaves response count, versions, preferences and delivery jobs unchanged" +
          label,
      );
      check(
        !writes.length &&
          !forbidden.length &&
          !errors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "response recovery has no unexpected mutation, script error, external request or overflow" +
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
      "../.docs/phase0/local-form-response-read-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and Chromium desktop/mobile independent response inventory, summary, saved-view and hold-status reads. Two fresh fictional internal forms; one intended response/edit and one saved preference per form. Read-only browser operations retain timestamped matching data/proposals on transient errors, pause relevant actions and clear private state/filters on denial. All browser mutations/external requests blocked, realtime paused. No extra responses, versions, saved preferences or jobs from inspection. Metadata notification jobs disabled/secret payloads cleared, forms archived/accounts disabled/sessions revoked. No worker/provider send, existing chapter or production change; captures unapproved.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
