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
  password = "Fictional-authoring-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-authoring-" + id + "@example.test",
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-form-authoring/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false;
const checked = (r) => {
  if (r.error)
    throw Error("Owned authoring database operation failed " + r.error.code);
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned authoring API failed " + r.status + " " + r.json?.error?.code,
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
    "Fictional authoring " + label + " " + marker,
    "interest",
  );
  f.settings.access = "internal";
  return data(
    await h.call("/admin/forms", {
      method: "POST",
      body: {
        slug: "fictional-authoring-" + label + "-" + marker,
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
          display_name: "Fictional authoring reviewer " + marker,
        })),
      ),
  );
  created = true;
  await login(h, actor);
  await login(other, outsider);
  const concurrent = await create("concurrent"),
    root = "/admin/forms/" + concurrent.id,
    definition = {
      title: concurrent.title + " revised",
      description: concurrent.description,
      fields: concurrent.fields,
      sections: concurrent.sections,
      settings: concurrent.settings,
    },
    draft = { revision: 1, definition },
    key = randomUUID();
  const saved = await Promise.all(
    Array.from({ length: 10 }, () =>
      h.call(root + "/draft", { method: "PATCH", body: draft, key }),
    ),
  );
  check(
    saved.every((r) => r.status === 200 && r.json.data.form.revision === 2) &&
      checked(
        await h.db
          .from("admin_actions")
          .select("id")
          .eq("target_id", concurrent.id)
          .eq("action", "forms.draft"),
      ).length === 1,
    "ten concurrent identical draft requests commit one revision and audit",
  );
  const publishKey = randomUUID(),
    pub = { revision: 2 };
  const published = await Promise.all(
    Array.from({ length: 10 }, () =>
      h.call(root + "/publish", { method: "POST", body: pub, key: publishKey }),
    ),
  );
  check(
    published.every(
      (r) => r.status === 200 && r.json.data.form.revision === 3,
    ) &&
      checked(
        await h.db
          .from("form_versions")
          .select("id")
          .eq("form_id", concurrent.id),
      ).length === 1,
    "ten concurrent identical publications create one immutable version",
  );
  check(
    (
      await h.call(root + "/draft", {
        method: "PATCH",
        body: { ...draft, revision: 3 },
        key,
      })
    ).status === 409,
    "changed authoring intent cannot reuse an accepted key",
  );
  check(
    (await other.call(root + "?mutation=publish", { key: publishKey }))
      .status === 404,
    "unrelated account cannot inspect an authoring receipt",
  );
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const form = await create("browser-" + viewport.width),
      root = "/admin/forms/" + form.id,
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
          throw Error("Owned authoring browser login failed " + r.status());
      }
      const page = await context.newPage(),
        writes = [],
        errors = [],
        forbidden = [];
      let drop = "after",
        permitted = "draft";
      page.on("pageerror", (e) => errors.push(e.name));
      await page.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          path = url.pathname;
        if (url.origin !== h.env.APP_ORIGIN) {
          forbidden.push("external");
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
                    "Realtime paused for fictional authoring verification.",
                },
              },
            });
            return;
          }
          if (
            path === "/api/v1" + root + "/" + permitted &&
            request.method() === (permitted === "draft" ? "PATCH" : "POST")
          ) {
            const record = {
              action: permitted,
              key: request.headers()["idempotency-key"],
              body: request.postDataJSON(),
            };
            writes.push(record);
            if (drop === "before") {
              drop = "none";
              await route.abort("connectionfailed");
              return;
            }
            let r;
            try {
              r = await route.fetch();
            } catch {
              throw Error("Owned authoring transport interrupted.");
            }
            if (r.status() !== 200)
              throw Error("Owned authoring browser write failed " + r.status());
            if (drop === "after") {
              drop = "none";
              await route.abort("connectionfailed");
            } else await route.fulfill({ response: r });
            return;
          }
          forbidden.push("unexpected write");
          await route.abort("blockedbyclient");
          return;
        }
        await route.continue();
      });
      await page.goto(h.env.APP_ORIGIN + root + "/edit");
      const title = page.getByLabel("Form title", { exact: true });
      async function loadCurrent() {
        await page
          .getByRole("button", {
            name: "Review loading saved draft",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", {
            name: "Load saved draft and discard proposed changes",
            exact: true,
          })
          .click();
        await expect(title).toBeEnabled();
        await expect(title).toBeFocused();
      }
      async function checkOutcome() {
        await page
          .getByRole("button", {
            name: "Recheck original write outcome",
            exact: true,
          })
          .click();
      }
      async function openPublish() {
        await page
          .getByRole("button", { name: "Publish", exact: true })
          .click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Publish version", exact: true })
          .click();
      }
      await title.fill("Fictional accepted draft " + viewport.width);
      await expect(
        page.getByRole("heading", {
          name: "Recheck the unconfirmed draft save",
        }),
      ).toBeVisible();
      await checkOutcome();
      await expect(
        page.getByText(/The original change is confirmed/),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Review loading saved draft",
          exact: true,
        }),
      ).toBeEnabled();
      check(
        writes.length === 1 && data(await h.call(root)).form.revision === 2,
        "accepted-but-lost draft reconciles read-only without another PATCH" +
          label,
      );
      await loadCurrent();
      drop = "before";
      await title.fill("Fictional retried draft " + viewport.width);
      await expect(
        page.getByRole("heading", {
          name: "Recheck the unconfirmed draft save",
        }),
      ).toBeVisible();
      await checkOutcome();
      await page
        .getByRole("button", {
          name: "Retry this exact draft save",
          exact: true,
        })
        .click();
      await expect(
        page.getByText(/The original change is confirmed/),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Review loading saved draft",
          exact: true,
        }),
      ).toBeEnabled();
      check(
        writes.length === 3 &&
          writes[1].key === writes[2].key &&
          JSON.stringify(writes[1].body) === JSON.stringify(writes[2].body) &&
          data(await h.call(root)).form.revision === 3,
        "unaccepted draft needs read-only check and exact explicit key/body retry" +
          label,
      );
      await loadCurrent();
      permitted = "publish";
      drop = "after";
      await openPublish();
      await expect(
        page.getByRole("heading", {
          name: "Recheck the unconfirmed publication",
        }),
      ).toBeVisible();
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
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
        "populated unconfirmed publication passes measured axe" +
          label +
          (violations.length ? ": " + violations.join(",") : ""),
      );
      await page.screenshot({
        path: new URL("publication-recovery-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
      await checkOutcome();
      await expect(
        page.getByText(/The original change is confirmed/),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Review loading saved draft",
          exact: true,
        }),
      ).toBeEnabled();
      check(
        writes.length === 4 &&
          data(await h.call(root)).form.versions.length === 1,
        "accepted-but-lost publication reconciles without another POST/version" +
          label,
      );
      await loadCurrent();
      drop = "before";
      await openPublish();
      await expect(
        page.getByRole("heading", {
          name: "Recheck the unconfirmed publication",
        }),
      ).toBeVisible();
      await checkOutcome();
      await page
        .getByRole("button", {
          name: "Retry this exact publication",
          exact: true,
        })
        .click();
      await expect(
        page.getByText(/The original change is confirmed/),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Review loading saved draft",
          exact: true,
        }),
      ).toBeEnabled();
      check(
        writes.length === 6 &&
          writes[4].key === writes[5].key &&
          JSON.stringify(writes[4].body) === JSON.stringify(writes[5].body) &&
          data(await h.call(root)).form.versions.length === 2,
        "unaccepted publication requires explicit original revision/key retry once" +
          label,
      );
      const audits = checked(
        await h.db
          .from("admin_actions")
          .select("action")
          .eq("target_id", form.id),
      );
      check(
        audits.filter((r) => r.action === "forms.draft").length === 2 &&
          audits.filter((r) => r.action === "forms.publish").length === 2,
        "two intended saves/publications have exactly two audits each" + label,
      );
      check(
        !errors.length &&
          !forbidden.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "authoring recovery has no extra write, script error, external request or overflow" +
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
      "../.docs/phase0/local-form-authoring-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and Chromium desktop/mobile; only fresh fictional accounts/forms with internal access. Ten concurrent identical save/publication calls and accepted-lost/unaccepted saves/publications; exact explicit retries, read-only receipts, original body/key, audit/version deduplication and measured axe. Forms archived/accounts disabled/sessions revoked. No responses, workers/provider sends, existing chapter or production changes. Screenshots private/ignored; no credentials/body/key material retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
