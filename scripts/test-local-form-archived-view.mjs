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
  password = "Fictional-archived-view-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-archived-view-" + id + "@example.test",
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-form-archived-view/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false;
const checked = (r) => {
  if (r.error)
    throw Error(
      "Owned archived-view database operation failed " + r.error.code,
    );
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned archived-view API failed " + r.status + " " + r.json?.error?.code,
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
    "Fictional archived-view " + label + " " + marker,
    "interest",
  );
  f.settings.access = "internal";
  return data(
    await h.call("/admin/forms", {
      method: "POST",
      body: {
        slug: "fictional-archived-view-" + label + "-" + marker,
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
        display_name: "Fictional archived-view reviewer " + marker,
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
    let source = await create("archived-" + viewport.width);
    const root = "/admin/forms/" + source.id,
      label = " at " + viewport.width + "×" + viewport.height;
    source = data(
      await h.call(root + "/publish", {
        method: "POST",
        body: { revision: source.revision },
      }),
    ).form;
    source = data(
      await h.call(root, {
        method: "DELETE",
        body: { revision: source.revision },
      }),
    ).form;
    const original = JSON.stringify(source);
    check(
      source.status === "Archived" &&
        source.actions.includes("edit") &&
        source.actions.includes("publish") &&
        source.versions.length === 1,
      "owned archived fixture retains raw grants and one immutable version" +
        label,
    );
    check(
      (await other.call(root)).status === 404 &&
        (await h.call("/forms/" + source.slug, { anonymous: true })).status ===
          404,
      "archived draft stays private to authorized readers" + label,
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
                  message: "Realtime paused for archived-view verification.",
                },
              },
            });
            return;
          }
          writes.push("unexpected mutation");
          await route.abort("blockedbyclient");
          return;
        }
        await route.continue();
      });
      await page.goto(h.env.APP_ORIGIN + root + "/edit");
      await expect(
        page.getByRole("region", { name: "Archived form status" }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Form title", { exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByLabel("Form description", { exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Publish", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("link", { name: "Preview", exact: true }),
      ).toHaveAttribute("aria-disabled", "false");
      check(
        writes.length === 0,
        "archived builder disables draft editing and publication while preserving saved preview" +
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
        "populated archived builder passes measured axe" +
          label +
          (violations.length ? ": " + JSON.stringify(violations) : ""),
      );
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: new URL("archived-builder-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Version history", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "Published versions",
      );
      await expect(
        page.getByLabel("Published snapshot", { exact: false }),
      ).toBeEnabled();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      check(
        writes.length === 0,
        "archived published history remains readable without a mutation" +
          label,
      );
      await page.getByRole("link", { name: "Preview", exact: true }).click();
      await expect(
        page.getByText("Draft preview", { exact: true }),
      ).toBeVisible();
      await page.locator("#respondent-name").fill("Fictional Preview Reviewer");
      await page
        .locator("#respondent-email")
        .fill("fictional-preview-" + marker + "@example.test");
      const questions = page.getByRole("group", {
        name: "Form questions",
        exact: true,
      });
      await questions
        .getByRole("textbox", { name: /^Full name/ })
        .fill("Fictional Preview Reviewer");
      await questions
        .getByRole("textbox", { name: /^Email address/ })
        .fill("fictional-preview-" + marker + "@example.test");
      await questions
        .getByRole("radio", { name: "Just getting started", exact: true })
        .check();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Submit response", exact: true }),
      ).toBeDisabled();
      check(
        writes.length === 0,
        "archived saved preview opens read-only and cannot submit a response" +
          label,
      );
      check(
        JSON.stringify(data(await h.call(root)).form) === original &&
          checked(
            await h.db
              .from("form_responses")
              .select("id")
              .eq("form_id", source.id),
          ).length === 0,
        "archived inspection leaves draft, version, availability and responses unchanged" +
          label,
      );
      check(
        !writes.length &&
          !errors.length &&
          !forbidden.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "archived inspection has no unexpected write, script error, external request or overflow" +
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
      "../.docs/phase0/local-form-archived-view-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and Chromium desktop/mobile archived builder inspection. Two fresh owned fictional internal forms are published once and archived before inspection. Raw grants still include edit/publish; UI disables draft/publication changes, retains immutable history and opens a saved preview with response submission disabled. All browser mutations/external requests blocked, realtime paused; draft/version/availability unchanged and no responses. Accounts disabled/sessions revoked, forms remain archived. No worker/provider send or existing chapter/production change. Captures ignored/unapproved.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
