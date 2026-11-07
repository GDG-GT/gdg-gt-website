import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { createTemplate } from "../shared/forms.ts";
const require = createRequire(import.meta.url),
  h = await localHttp(),
  other = await localHttp(),
  actor = randomUUID(),
  outsider = randomUUID(),
  password = "Fictional-builder-scope-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-builder-scope-" + id + "@example.test",
  output = new URL(
    "../artifacts/browser/live-form-builder-scope/",
    import.meta.url,
  ),
  tests = [];
let browser,
  created = false,
  completed = false;
const checked = (result) => {
  if (result.error)
    throw Error("Owned form scope DB operation failed " + result.error.code);
  return result.data;
};
const data = (result) => {
  if (result.status !== 200)
    throw Error(
      "Owned form scope API operation failed " +
        result.status +
        " " +
        result.json?.error?.code,
    );
  return result.json.data;
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
await mkdir(output, { recursive: true });
try {
  const passwordHash = await hashSecret(password);
  checked(
    await h.db
      .from("admin_users")
      .insert(
        [actor, outsider].map((id) => ({
          id,
          email: email(id),
          password_hash: passwordHash,
          role: id === actor ? "admin" : "team_member",
          is_active: true,
          display_name: "Fictional builder reviewer " + marker,
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
    const template = createTemplate(
        "Fictional builder form " + viewport.width + " " + marker,
        "interest",
      ),
      form = data(
        await h.call("/admin/forms", {
          method: "POST",
          body: {
            slug: "fictional-builder-" + viewport.width + "-" + marker,
            teamId: null,
            definition: {
              title: template.title,
              description: template.description,
              fields: template.fields,
              sections: template.sections,
              settings: template.settings,
            },
          },
        }),
      ).form,
      root = "/admin/forms/" + form.id,
      label = ` at ${viewport.width}×${viewport.height}`;
    check(
      (await h.call(root, { anonymous: true })).status === 401 &&
        (await other.call(root)).status === 404,
      "private builder definition conceals anonymous/unrelated reads" + label,
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
        const response = await context.request.post(
          h.env.APP_ORIGIN + "/api/v1" + path,
          { headers: { Origin: h.env.APP_ORIGIN }, data: body },
        );
        if (response.status() !== 200)
          throw Error(
            "Owned form scope browser login failed " + response.status(),
          );
      }
      const page = await context.newPage(),
        errors = [],
        forbidden = [],
        writes = [];
      let dropSave = true,
        failRead = false,
        denyRead = false;
      page.on("pageerror", (error) => errors.push(error.name));
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
                  message: "Realtime paused for form scope verification.",
                },
              },
            });
            return;
          }
          if (
            path === "/api/v1" + root + "/draft" &&
            request.method() === "PATCH"
          ) {
            writes.push("draft-save");
            if (writes.length > 1)
              throw Error("A paused form autosave retried unexpectedly.");
            const response = await route.fetch().catch(() => {
              throw Error("Owned form save transport interrupted.");
            });
            if (response.status() !== 200)
              throw Error(
                "Owned form save did not succeed " + response.status(),
              );
            if (dropSave) {
              dropSave = false;
              await route.abort("connectionfailed");
            } else await route.fulfill({ response });
            return;
          }
          forbidden.push("unexpected non-read request");
          await route.abort("blockedbyclient");
          return;
        }
        if (path === "/api/v1" + root && (failRead || denyRead)) {
          await route.fulfill({
            status: denyRead ? 403 : 503,
            json: {
              error: {
                code: denyRead ? "FORBIDDEN" : "UNAVAILABLE",
                message: denyRead
                  ? "Fictional builder access denied."
                  : "Fictional saved draft unavailable.",
              },
            },
          });
          return;
        }
        await route.continue();
      });
      await page.goto(h.env.APP_ORIGIN + "/admin/forms/" + form.id + "/edit");
      const title = page.getByLabel("Form title", { exact: true }),
        accepted = "Fictional accepted builder title " + viewport.width;
      await title.fill(accepted);
      await expect(
        page.getByText(/Saved values changed or a save did not finish cleanly/),
      ).toBeVisible();
      await expect(title).toBeDisabled();
      check(
        writes.length === 1,
        "accepted-but-lost autosave pauses further writes and retains proposed fields" +
          label,
      );
      await page
        .getByRole("button", { name: "Recheck saved form", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Review loading saved draft" }),
      ).toBeEnabled();
      check(
        writes.length === 1 && data(await h.call(root)).form.title === accepted,
        "form recheck reads accepted saved values without another write" +
          label,
      );
      await page
        .getByRole("button", { name: "Review loading saved draft" })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(
        "Unsaved field, setting and undo/redo changes will be discarded",
      );
      await page.getByRole("button", { name: "Keep proposed draft" }).click();
      await expect(title).toHaveValue(accepted);
      await page
        .getByRole("button", { name: "Review loading saved draft" })
        .click();
      await page
        .getByRole("button", {
          name: "Load saved draft and discard proposed changes",
        })
        .click();
      await expect(title).toBeEnabled();
      await expect(title).toBeFocused();
      check(
        writes.length === 1,
        "loading the saved definition requires explicit review and restores editor focus" +
          label,
      );
      const proposed = "Fictional temporarily unsaved title " + viewport.width;
      await title.fill(proposed);
      failRead = true;
      await page
        .getByRole("button", { name: "Recheck saved form", exact: true })
        .click();
      await expect(
        page.getByText("Fictional saved draft unavailable.", { exact: true }),
      ).toBeVisible();
      await expect(title).toHaveValue(proposed);
      await expect(title).toBeDisabled();
      await expect(
        page.getByText(/Last successful saved draft read/),
      ).toBeVisible();
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
          })
        ).violations.map((row) => ({ id: row.id, nodes: row.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })),
      );
      check(
        !violations.length,
        "populated paused form builder passes measured axe" +
          label +
          (violations.length ? ": " + JSON.stringify(violations) : ""),
      );
      await page.screenshot({
        path: new URL("builder-paused-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
      check(
        writes.length === 1 && data(await h.call(root)).form.title === accepted,
        "transient form read failure preserves unsaved input without replacing saved data" +
          label,
      );
      failRead = false;
      denyRead = true;
      await page
        .getByRole("button", { name: "Recheck saved form", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Form access needs to be rechecked",
        }),
      ).toBeVisible();
      await expect(title).toHaveCount(0);
      denyRead = false;
      await page
        .getByRole("button", { name: "Try loading form again" })
        .click();
      await expect(title).toHaveValue(accepted);
      await expect(title).toBeEnabled();
      check(
        writes.length === 1,
        "denial clears private fields before explicit fresh form access recovery" +
          label,
      );
      check(
        !errors.length &&
          !forbidden.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "form scope workflow has no extra write, provider send, script error, external request or page overflow" +
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
    for (const form of forms) {
      const current = data(await h.call("/admin/forms/" + form.id)).form;
      data(
        await h.call("/admin/forms/" + form.id, {
          method: "DELETE",
          body: { revision: current.revision },
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
      "../.docs/phase0/local-form-builder-read-scope.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and Chromium desktop/mobile builder scope/read verification. Only fresh owned fictional accounts and two private unpublished forms; one accepted-but-lost draft save per form, writes then paused, exact read-only refresh and reviewed saved-draft loading, transient read retention and denial clearing. Every other browser non-read/external request blocked; realtime paused. Forms archived/accounts disabled/sessions revoked. No form publication, response, worker/provider send or existing chapter/production change. Captures private/ignored; no credentials/response bodies retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
