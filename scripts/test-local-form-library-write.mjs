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
  password = "Fictional-library-write-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-library-write-" + id + "@example.test",
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-form-library-write/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false;
const checked = (r) => {
  if (r.error)
    throw Error(
      "Owned library-write database operation failed " + r.error.code,
    );
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned library-write API failed " + r.status + " " + r.json?.error?.code,
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
    "Fictional library-write " + label + " " + marker,
    "interest",
  );
  f.settings.access = "internal";
  return data(
    await h.call("/admin/forms", {
      method: "POST",
      body: {
        slug: "fictional-library-write-" + label + "-" + marker,
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
        display_name: "Fictional library-write reviewer " + marker,
      })),
    ),
  );
  created = true;
  await login(h, actor);
  await login(other, outsider);
  const f = createTemplate(
    "Fictional library concurrent " + marker,
    "interest",
  );
  f.settings.access = "internal";
  const createBody = {
      slug: "fictional-library-concurrent-" + marker,
      template: "interest",
      definition: {
        title: f.title,
        description: f.description,
        fields: f.fields,
        sections: f.sections,
        settings: f.settings,
      },
    },
    createKey = randomUUID();
  const creations = await Promise.all(
    Array.from({ length: 10 }, () =>
      h.call("/admin/forms", {
        method: "POST",
        body: createBody,
        key: createKey,
      }),
    ),
  );
  const concurrent = data(creations[0]).form;
  check(
    creations.every(
      (r) => r.status === 200 && r.json.data.form.id === concurrent.id,
    ) &&
      checked(await h.db.from("forms").select("id").eq("owner_id", actor))
        .length === 1,
    "ten concurrent identical creation calls create one private form",
  );
  const root = "/admin/forms/" + concurrent.id,
    copyBody = {
      slug: concurrent.slug + "-copy",
      revision: concurrent.revision,
    },
    copyKey = randomUUID();
  const copies = await Promise.all(
    Array.from({ length: 10 }, () =>
      h.call(root + "/duplicate", {
        method: "POST",
        body: copyBody,
        key: copyKey,
      }),
    ),
  );
  const copied = data(copies[0]).form;
  check(
    copies.every(
      (r) => r.status === 200 && r.json.data.form.id === copied.id,
    ) &&
      copied.templateKey === "interest" &&
      checked(await h.db.from("forms").select("id").eq("owner_id", actor))
        .length === 2 &&
      checked(
        await h.db
          .from("admin_actions")
          .select("id")
          .eq("target_id", copied.id)
          .eq("action", "forms.create"),
      ).length === 1,
    "ten concurrent identical duplicates create one private copy with provenance and one audit",
  );
  check(
    (
      await h.call(root + "/duplicate", {
        method: "POST",
        body: { ...copyBody, slug: copyBody.slug + "-changed" },
        key: copyKey,
      })
    ).status === 409,
    "accepted copy key rejects a changed original intent",
  );
  check(
    (
      await other.call(
        "/admin/forms/recovery?action=duplicate&source=" + concurrent.id,
        { key: copyKey },
      )
    ).status === 404,
    "unrelated account cannot inspect the copy receipt",
  );
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const source = await create("source-" + viewport.width),
      sourceRoot = "/admin/forms/" + source.id,
      label = " at " + viewport.width + "×" + viewport.height;
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
          throw Error("Owned library write browser login failed " + r.status());
      }
      const page = await context.newPage(),
        writes = [],
        errors = [],
        forbidden = [];
      let permitted = "",
        drop = "none";
      page.on("pageerror", (e) => errors.push(e.name));
      await page.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          path = url.pathname;
        if (url.origin !== h.env.APP_ORIGIN) {
          forbidden.push("external request");
          await route.abort("blockedbyclient");
          return;
        }
        if (
          path.startsWith("/api/") &&
          !["GET", "HEAD"].includes(request.method())
        ) {
          if (
            ["/api/v1/auth/realtime-token", "/api/v1/realtime/token"].includes(
              path,
            )
          ) {
            await route.fulfill({
              status: 503,
              json: {
                error: {
                  code: "UNAVAILABLE",
                  message:
                    "Realtime paused for fictional library write verification.",
                },
              },
            });
            return;
          }
          const create =
              permitted === "create" &&
              path === "/api/v1/admin/forms" &&
              request.method() === "POST",
            duplicate =
              permitted === "duplicate" &&
              path === "/api/v1" + sourceRoot + "/duplicate" &&
              request.method() === "POST",
            archive =
              permitted === "archive" &&
              path === "/api/v1" + sourceRoot &&
              request.method() === "DELETE",
            restore =
              permitted === "restore" &&
              path === "/api/v1" + sourceRoot + "/restore" &&
              request.method() === "POST",
            state =
              permitted === "state" &&
              path === "/api/v1" + sourceRoot + "/state" &&
              request.method() === "POST";
          if (create || duplicate || archive || restore || state) {
            const body = request.postDataJSON();
            if (create && !body.definition?.title?.includes(marker))
              throw Error("Refusing non-owned form creation.");
            writes.push({
              action: permitted,
              key: request.headers()["idempotency-key"],
              body: JSON.stringify(body),
            });
            if (drop === "before") {
              drop = "none";
              await route.abort("connectionfailed");
              return;
            }
            let response;
            try {
              response = await route.fetch();
            } catch {
              throw Error("Owned library write transport interrupted.");
            }
            if (response.status() !== 200)
              throw Error("Owned library write failed " + response.status());
            if (drop === "after") {
              drop = "none";
              await route.abort("connectionfailed");
            } else await route.fulfill({ response });
            return;
          }
          forbidden.push("unexpected non-read request");
          await route.abort("blockedbyclient");
          return;
        }
        if (path === "/api/v1/admin/forms") {
          // The real inventory is narrowed to this invocation's fictional rows.
          url.searchParams.set("q", marker);
          let response;
          try {
            response = await route.fetch({ url: url.href });
          } catch {
            throw Error("Owned library inventory transport interrupted.");
          }
          await route.fulfill({ response });
          return;
        }
        await route.continue();
      });
      async function scenario(action, loss, state) {
        permitted = action;
        drop = loss;
        await page.goto(h.env.APP_ORIGIN + "/admin/forms");
        await expect(
          page.getByRole("button", {
            name: "Actions for " + source.title,
            exact: true,
          }),
        ).toBeVisible();
        const before =
            action === "create" ? null : data(await h.call(sourceRoot)).form,
          actionName =
            action === "state"
              ? state === "Closed"
                ? "close"
                : "reopen"
              : action,
          auditName =
            action === "create" || action === "duplicate"
              ? "forms.create"
              : "forms." + action,
          auditBefore =
            action === "create" || action === "duplicate"
              ? 0
              : checked(
                  await h.db
                    .from("admin_actions")
                    .select("id")
                    .eq("target_id", source.id)
                    .eq("action", auditName),
                ).length,
          start = writes.length,
          newTitle =
            "Fictional created " + viewport.width + " " + loss + " " + marker;
        if (action === "create") {
          await page
            .getByRole("button", { name: "Create form", exact: true })
            .click();
          await page.getByLabel("Form title", { exact: false }).fill(newTitle);
          await page
            .getByRole("dialog")
            .getByRole("button", { name: "Create form", exact: true })
            .click();
        } else {
          await page
            .getByRole("button", {
              name: "Actions for " + source.title,
              exact: true,
            })
            .click();
          const item =
            action === "duplicate"
              ? "Duplicate"
              : action === "archive"
                ? "Archive form"
                : action === "restore"
                  ? "Restore draft"
                  : state === "Closed"
                    ? "Close form"
                    : "Reopen form";
          await page.getByRole("menuitem", { name: item, exact: true }).click();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toContainText(source.title);
          if (action === "duplicate")
            await expect(dialog).toContainText(
              "Responses, published versions and collaborator access are not copied",
            );
          await dialog
            .getByRole("button", {
              name: action === "duplicate" ? "Duplicate form" : item,
              exact: true,
            })
            .click();
        }
        const region = page.getByRole("region", {
          name: "Unconfirmed form library change",
        });
        await expect(region).toBeVisible();
        await expect(
          page.getByRole("button", { name: /Retry this exact/ }),
        ).toHaveCount(0);
        if (action === "duplicate" && loss === "after") {
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
            "populated library copy recovery passes measured axe" +
              label +
              (violations.length ? ": " + JSON.stringify(violations) : ""),
          );
          await page.locator("#form-library-recovery-status").focus();
          await page
            .getByRole("region", { name: "Form inventory table" })
            .evaluate((element) => {
              element.scrollLeft = 0;
            });
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({
            path: new URL("library-recovery-" + viewport.width + ".png", output)
              .pathname,
            fullPage: true,
            animations: "disabled",
          });
        }
        await region
          .getByRole("button", { name: "Recheck original library change" })
          .click();
        if (loss === "before")
          await region
            .getByRole("button", {
              name: "Retry this exact " + actionName + " request",
              exact: true,
            })
            .click();
        await expect(region).toHaveCount(0);
        if (action === "create")
          await expect(
            page.getByLabel("Form title", { exact: true }),
          ).toHaveValue(newTitle);
        else {
          await expect(
            page.getByText(
              new RegExp("original " + actionName + " change confirmed"),
            ),
          ).toBeVisible();
          await expect(
            page.getByRole("button", {
              name: "Recheck form library",
              exact: true,
            }),
          ).toBeEnabled();
        }
        const attempts = writes.slice(start),
          original = attempts[0],
          query = new URLSearchParams({
            action,
            ...(action === "create" ? {} : { source: source.id }),
          }),
          receipt = data(
            await h.call("/admin/forms/recovery?" + query, {
              key: original.key,
            }),
          );
        check(
          attempts.length === (loss === "before" ? 2 : 1) &&
            attempts.every(
              (a) => a.key === original.key && a.body === original.body,
            ) &&
            receipt.committed,
          actionName +
            " " +
            loss +
            "-acceptance loss uses read-only reconciliation and an exact explicit retry only when needed" +
            label,
        );
        const saved = receipt.form,
          target = saved.id,
          audits = checked(
            await h.db
              .from("admin_actions")
              .select("id")
              .eq("target_id", target)
              .eq("action", auditName),
          ).length;
        check(
          audits === auditBefore + 1 &&
            (action === "create" || action === "duplicate"
              ? saved.revision === 1 &&
                saved.status === "Draft" &&
                saved.versions.length === 0
              : saved.revision === before.revision + 1 &&
                saved.status ===
                  (action === "archive"
                    ? "Archived"
                    : action === "restore"
                      ? "Draft"
                      : state)),
          actionName +
            " " +
            loss +
            "-acceptance recovery commits one intended result and audit" +
            label,
        );
      }
      await scenario("create", "after");
      await scenario("create", "before");
      await scenario("duplicate", "after");
      await scenario("duplicate", "before");
      await scenario("archive", "after");
      await scenario("restore", "before");
      await scenario("archive", "before");
      await scenario("restore", "after");
      const current = data(await h.call(sourceRoot)).form;
      data(
        await h.call(sourceRoot + "/publish", {
          method: "POST",
          body: { revision: current.revision },
        }),
      );
      await scenario("state", "after", "Closed");
      await scenario("state", "before", "Open");
      await scenario("state", "before", "Closed");
      await scenario("state", "after", "Open");
      check(
        data(await h.call(sourceRoot)).form.versions.length === 1,
        "availability retries retain one intended internal publication and never republish" +
          label,
      );
      check(
        !errors.length &&
          !forbidden.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "library mutation recovery has no extra write, script error, external request or viewport overflow" +
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
      "../.docs/phase0/local-form-library-write-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and Chromium desktop/mobile library mutation recovery with fresh owned fictional accounts/forms. Ten identical concurrent creates/copies; before/after-acceptance create, duplicate, archive, restore, close and reopen; immutable key/body explicit retry, current receipt reads, single audit/result, measured axe and unchanged publication count. Inventory reads are constrained to owned fixture-marker rows. Created forms stay private drafts; two intended source publications use internal access. Forms archived/accounts disabled/sessions revoked. No responses, worker/provider sends, existing chapter or production changes. Captures ignored and no credentials/key/body material retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
