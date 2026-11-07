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
  password = "Fictional-saved-view-recovery-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-saved-view-recovery-" + id + "@example.test",
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-form-saved-view-recovery/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false;
const checked = (r) => {
  if (r.error)
    throw Error(
      "Owned saved-view-recovery database operation failed " + r.error.code,
    );
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned saved-view-recovery API failed " +
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
    "Fictional saved-view-recovery " + label + " " + marker,
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
        slug: "fictional-saved-view-recovery-" + label + "-" + marker,
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
        display_name: "Fictional saved view reviewer " + marker,
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
    const source = await create("views-" + viewport.width),
      root = "/admin/forms/" + source.id,
      viewsPath = root + "/views",
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
          throw Error("Owned view login failed " + r.status());
      }
      check(
        (await other.call(viewsPath)).status === 404 &&
          (await h.call(viewsPath, { anonymous: true })).status === 401,
        "saved view inventory conceals owned preferences from unrelated/anonymous accounts" +
          label,
      );
      const page = await context.newPage(),
        attempts = [],
        unexpected = [],
        errors = [];
      let loss = "",
        target = "",
        targetMethod = "";
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
                  message: "Realtime paused for owned saved view verification.",
                },
              },
            });
          if (path !== target || request.method() !== targetMethod) {
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
                  "Owned saved view before loss failed " + r.status(),
                );
            }
            return route.abort("connectionfailed");
          }
        }
        return route.continue();
      });
      await page.goto(h.env.APP_ORIGIN + root + "/responses");
      for (const position of ["after", "before"]) {
        const name = "Fictional owned view " + position + " " + marker;
        let viewId;
        for (const action of ["create", "replace", "remove"]) {
          const auditsBefore = checked(
            await h.db
              .from("admin_actions")
              .select("id")
              .eq("target_id", source.id)
              .in("action", [
                "forms.saved_view_saved",
                "forms.saved_view_removed",
              ]),
          ).length;
          if (action === "create") {
            await page.getByLabel("New view name", { exact: false }).fill(name);
            await page
              .getByRole("button", { name: "Save view", exact: true })
              .click();
          } else {
            await expect(
              page.getByRole("option", { name, exact: true }),
            ).toHaveCount(1);
            await page
              .getByRole("combobox", { name: /^Saved view/ })
              .selectOption(viewId);
            await expect(
              page.getByRole("button", {
                name:
                  action === "replace"
                    ? "Replace selected view"
                    : "Remove selected view",
                exact: true,
              }),
            ).toBeEnabled();
            await page
              .getByRole("button", {
                name:
                  action === "replace"
                    ? "Replace selected view"
                    : "Remove selected view",
                exact: true,
              })
              .click();
          }
          const dialog = page.getByRole("dialog");
          target = viewsPath + (action === "create" ? "" : "/" + viewId);
          targetMethod =
            action === "create"
              ? "POST"
              : action === "replace"
                ? "PATCH"
                : "DELETE";
          loss = position;
          await dialog
            .getByRole("button", {
              name:
                action === "create"
                  ? "Confirm new view"
                  : action === "replace"
                    ? "Confirm replacement"
                    : "Confirm removal",
              exact: true,
            })
            .click();
          const recovery = dialog.getByRole("region", {
            name: "Unconfirmed saved view change",
            exact: true,
          });
          await expect(recovery).toBeVisible();
          const original = attempts.at(-1),
            count = attempts.length;
          check(
            !!original.key &&
              JSON.parse(original.body).revision ===
                (action === "create"
                  ? undefined
                  : action === "replace"
                    ? 1
                    : 2),
            action +
              " " +
              position +
              " freezes the reviewed saved view revision/key" +
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
                    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
                  },
                })
              ).violations.map((v) => v.id),
            );
            check(
              !violations.length,
              "uncertain saved view " +
                action +
                " passes measured axe" +
                label +
                (violations.length ? ": " + JSON.stringify(violations) : ""),
            );
            if (action === "replace") {
              await recovery.scrollIntoViewIfNeeded();
              await page.screenshot({
                path: new URL(
                  "saved-view-recovery-" + viewport.width + ".png",
                  output,
                ).pathname,
                fullPage: false,
                animations: "disabled",
              });
            }
          }
          await recovery
            .getByRole("button", {
              name: "Check original saved view outcome",
              exact: true,
            })
            .click();
          if (position === "before") {
            await expect(
              recovery.getByText(/No committed receipt was found/),
            ).toBeVisible();
            await recovery
              .getByRole("button", {
                name: "Retry identical saved view change",
                exact: true,
              })
              .click();
          }
          await expect(dialog).toHaveCount(0);
          await expect(
            page.getByText("Original saved view " + action + " confirmed.", {
              exact: true,
            }),
          ).toBeVisible();
          check(
            attempts.length === count + (position === "before" ? 1 : 0) &&
              attempts
                .slice(count - 1)
                .every(
                  (a) => a.key === original.key && a.body === original.body,
                ),
            action +
              " " +
              position +
              " recovery never replaces the original request" +
              label,
          );
          const items = data(await h.call(viewsPath)).items,
            owned = items.find((v) => v.name === name);
          if (action === "create") viewId = owned?.id;
          check(
            (action === "remove"
              ? !owned
              : owned?.revision === (action === "create" ? 1 : 2)) &&
              checked(
                await h.db
                  .from("admin_actions")
                  .select("id")
                  .eq("target_id", source.id)
                  .in("action", [
                    "forms.saved_view_saved",
                    "forms.saved_view_removed",
                  ]),
              ).length ===
                auditsBefore + 1,
            action +
              " " +
              position +
              " leaves one intended view result and audit" +
              label,
          );
        }
      }
      const bulk = Array.from({ length: 125 }, (_, index) => ({
        form_id: source.id,
        owner_id: actor,
        name: "Fictional paging " + String(index + 1).padStart(3, "0"),
        filters: {},
        columns: [],
      }));
      checked(await h.db.from("form_saved_views").insert(bulk));
      await page
        .getByLabel("Search saved views", { exact: false })
        .fill("Fictional paging");
      await expect(
        page.getByText(/Saved views page 1 of 5 · 125 matching/),
      ).toBeVisible();
      for (let i = 0; i < 4; i++) {
        await expect(
          page.getByRole("button", { name: "Next saved views", exact: true }),
        ).toBeEnabled();
        await page
          .getByRole("button", { name: "Next saved views", exact: true })
          .click();
        await expect(
          page.getByText(new RegExp("Saved views page " + (i + 2) + " of 5")),
        ).toBeVisible();
      }
      await expect(
        page.getByRole("option", { name: "Fictional paging 125", exact: true }),
      ).toHaveCount(1);
      check(
        true,
        "saved view search/paging exposes owned row 125 without a 100-row ceiling" +
          label,
      );
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
        "saved preferences leave draft/publication/response/delivery state unchanged" +
          label,
      );
      check(
        !unexpected.length &&
          !errors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "saved view recovery has no unexpected writes, external requests, script errors or page overflow" +
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
      "../.docs/phase0/local-form-saved-view-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and desktop/mobile Chromium saved view create/replace/remove recovery. Two fresh fictional private drafts, no publication/responses. Both response-loss positions, original selected revision/key/body, read-only accepted reconciliation, identical explicit retry, one view result/audit per action, measured axe, and 125 owned preferences per viewport for real paging beyond 100. No workers/provider sends/existing chapter or production changes. Forms archived/accounts disabled/sessions revoked; captures unapproved.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
