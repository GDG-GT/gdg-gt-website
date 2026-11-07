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
  password = "Fictional-response-write-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-response-write-" + id + "@example.test",
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-form-response-write/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false;
const checked = (r) => {
  if (r.error)
    throw Error(
      "Owned response-write database operation failed " + r.error.code,
    );
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned response-write API failed " + r.status + " " + r.json?.error?.code,
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
    "Fictional response-write " + label + " " + marker,
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
        slug: "fictional-response-write-" + label + "-" + marker,
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
async function publish(source) {
  return data(
    await h.call("/admin/forms/" + source.id + "/publish", {
      method: "POST",
      body: { revision: source.revision },
    }),
  ).form;
}
async function submit(source, label) {
  const published = data(await h.call("/forms/" + source.slug)).form;
  const respondent = {
    name: "Fictional Privacy Respondent " + label,
    email: email(actor),
  };
  const answers = {
    [source.fields[0].id]: "Fictional private answer " + label,
    [source.fields[1].id]: email(actor),
  };
  const accepted = data(
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
        editToken: accepted.editToken,
        revision: 0,
        answers: {
          ...answers,
          [source.fields[0].id]: "Fictional edited answer " + label,
        },
      },
    }),
  );
  return data(
    await h.call("/admin/forms/" + source.id + "/responses"),
  ).items.find((r) => r.id === accepted.responseId);
}
function document(row, action) {
  return {
    revision: row.revision,
    status: row.status,
    redacted: row.redacted,
    confirmation: action.toUpperCase(),
    ...(action === "redact" ? { action } : {}),
  };
}
async function verifyErasure(formId, responseId, action, label) {
  const row = checked(
    await h.db
      .from("form_responses")
      .select(
        "deleted_at,redacted_at,respondent_name,respondent_email,respondent_source",
      )
      .eq("id", responseId)
      .single(),
  );
  const history = checked(
    await h.db
      .from("form_response_revisions")
      .select("answers")
      .eq("response_id", responseId),
  );
  const answers = checked(
    await h.db
      .from("form_answers")
      .select("value")
      .eq("response_id", responseId),
  );
  const audit = checked(
    await h.db
      .from("admin_actions")
      .select("action")
      .eq("target_id", responseId),
  );
  check(
    !row.respondent_name &&
      !row.respondent_email &&
      row.respondent_source === "redacted" &&
      (action === "delete"
        ? !!row.deleted_at && answers.length === 0 && history.length === 0
        : !!row.redacted_at &&
          !JSON.stringify([answers, history]).includes(email(actor))) &&
      audit.filter((r) => r.action === "forms.response_" + action).length === 1,
    action +
      " erases owned identity/history as intended with exactly one action audit" +
      label,
  );
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
          display_name: "Fictional response write reviewer " + marker,
        })),
      ),
  );
  created = true;
  await login(h, actor);
  await login(other, outsider);
  const concurrent = await publish(await create("concurrent"));
  for (const action of ["delete", "redact"]) {
    const row = await submit(concurrent, "concurrent-" + action),
      path = "/admin/forms/" + concurrent.id + "/responses/" + row.id,
      key = randomUUID(),
      body = document(row, action);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        h.call(path, {
          method: action === "delete" ? "DELETE" : "PATCH",
          body,
          key,
        }),
      ),
    );
    check(
      results.every((r) => data(r).committed && data(r).receipt.id === row.id),
      "ten concurrent identical " +
        action +
        " requests return one owned receipt",
    );
    await verifyErasure(
      concurrent.id,
      row.id,
      action,
      " during concurrent replay",
    );
    check(
      data(await h.call(path + "/recovery?action=" + action, { key }))
        .committed,
      "read-only " +
        action +
        " inspection recovers the accepted original outcome",
    );
  }
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const source = await publish(await create("privacy-" + viewport.width)),
      root = "/admin/forms/" + source.id,
      responsesPath = root + "/responses",
      label = " at " + viewport.width + "×" + viewport.height;
    const rows = [];
    for (const action of ["delete", "redact"])
      for (const position of ["after", "before"])
        rows.push({
          action,
          position,
          row: await submit(source, action + "-" + position),
        });
    const baselineJobs = checked(
      await h.db
        .from("delivery_jobs")
        .select("id")
        .eq("payload->>formId", source.id),
    )
      .map((j) => j.id)
      .sort();
    check(
      (await other.call(responsesPath)).status === 404 &&
        (await h.call(responsesPath, { anonymous: true })).status === 401,
      "private response reads conceal the owned form from unrelated/anonymous readers" +
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
          throw Error("Owned browser login failed " + r.status());
      }
      const page = await context.newPage(),
        attempts = [],
        unexpected = [],
        errors = [];
      let loss = "",
        target = "";
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
                  message: "Realtime paused for owned response verification.",
                },
              },
            });
          if (
            path !== target ||
            !["DELETE", "PATCH"].includes(request.method())
          ) {
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
                  "Owned privacy action before loss failed " + r.status(),
                );
            }
            return route.abort("connectionfailed");
          }
        }
        return route.continue();
      });
      await page.goto(h.env.APP_ORIGIN + root + "/responses");
      for (const { action, position, row } of rows) {
        await page
          .getByRole("button", { name: "Open response " + row.id, exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        await expect(
          dialog.getByText(
            "Fictional edited answer " + action + "-" + position,
            { exact: true },
          ),
        ).toBeVisible();
        await dialog
          .getByRole("button", {
            name: action === "delete" ? "Delete response" : "Redact identity",
            exact: true,
          })
          .click();
        await dialog
          .getByLabel("Confirm response action", { exact: false })
          .fill(action.toUpperCase());
        target = responsesPath + "/" + row.id;
        loss = position;
        await dialog
          .getByRole("button", { name: "Confirm " + action, exact: true })
          .click();
        const recovery = dialog.getByRole("region", {
          name: "Unconfirmed response action",
          exact: true,
        });
        await expect(recovery).toBeVisible();
        await expect(
          dialog.getByText(
            "Fictional edited answer " + action + "-" + position,
            { exact: true },
          ),
        ).toHaveCount(0);
        await expect(
          dialog.getByRole("heading", {
            name: "Response revision history",
            exact: true,
          }),
        ).toHaveCount(0);
        const original = attempts.at(-1),
          count = attempts.length;
        check(
          !JSON.stringify(original).includes(email(actor)),
          "unconfirmed " +
            action +
            " withholds answers/identity and retains only a metadata intent" +
            label +
            " " +
            position,
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
                  values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
                },
              })
            ).violations.map((v) => v.id),
          );
          check(
            !violations.length,
            "uncertain " +
              action +
              " passes measured axe" +
              label +
              (violations.length ? ": " + JSON.stringify(violations) : ""),
          );
          await recovery.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: new URL(
              action + "-recovery-" + viewport.width + ".png",
              output,
            ).pathname,
            fullPage: false,
            animations: "disabled",
          });
        }
        await recovery
          .getByRole("button", {
            name: "Check original response outcome",
            exact: true,
          })
          .click();
        if (position === "before") {
          await expect(
            recovery.getByText(/No committed receipt was found/),
          ).toBeVisible();
          await recovery
            .getByRole("button", {
              name: "Retry identical response action",
              exact: true,
            })
            .click();
        }
        await expect(dialog).toHaveCount(0);
        check(
          attempts.length === count + (position === "before" ? 1 : 0) &&
            (position !== "before" ||
              (attempts.at(-1).key === original.key &&
                attempts.at(-1).body === original.body)),
          action +
            " " +
            position +
            "-acceptance loss reconciles with no replacement body/key/write" +
            label,
        );
        await verifyErasure(source.id, row.id, action, label + " " + position);
      }
      check(
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
        "privacy inspection/retry adds no new delivery jobs" + label,
      );
      check(
        !unexpected.length &&
          !errors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "response recovery has no unexpected write, external request, script error or page overflow" +
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
      "../.docs/phase0/local-form-response-write-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and desktop/mobile Chromium response deletion/redaction recovery on fresh fictional internal forms. Ten concurrent identical requests per action; original keys/bodies after before/after-acceptance loss, metadata-only recovery, identity/history erasure, one audit, measured axe. Intended submissions/edits only; no workers, provider sends, existing chapter or production changes. Owned metadata delivery jobs disabled/secrets cleared, forms archived, accounts disabled/sessions revoked. Captures unapproved.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
