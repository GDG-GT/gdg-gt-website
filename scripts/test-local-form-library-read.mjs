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
  password = "Fictional-library-read-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-library-read-" + id + "@example.test",
  output = new URL(
    "../artifacts/browser/live-form-library-read/",
    import.meta.url,
  ),
  tests = [];
let browser,
  created = false,
  completed = false;
const checked = (result) => {
  if (result.error)
    throw Error("Owned form library DB operation failed " + result.error.code);
  return result.data;
};
const data = (result) => {
  if (result.status !== 200)
    throw Error(
      "Owned form library API operation failed " +
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
    await h.db.from("admin_users").insert(
      [actor, outsider].map((id) => ({
        id,
        email: email(id),
        password_hash: passwordHash,
        role: id === actor ? "admin" : "team_member",
        is_active: true,
        display_name: "Fictional library reviewer " + marker,
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
        "Fictional library form " + viewport.width + " " + marker,
        "interest",
      ),
      form = data(
        await h.call("/admin/forms", {
          method: "POST",
          body: {
            slug: "fictional-library-" + viewport.width + "-" + marker,
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
      "private form definition conceals anonymous/unrelated reads" + label,
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
            "Owned form library browser login failed " + response.status(),
          );
      }
      const page = await context.newPage(),
        errors = [],
        forbidden = [],
        writes = [];
      let failRead = true,
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
                  message: "Realtime paused for library read verification.",
                },
              },
            });
            return;
          }
          writes.push("unexpected non-read request");
          await route.abort("blockedbyclient");
          return;
        }
        if (path === "/api/v1/admin/forms") {
          if (failRead || denyRead) {
            await route.fulfill({
              status: denyRead ? 403 : 503,
              json: {
                error: {
                  code: denyRead ? "FORBIDDEN" : "UNAVAILABLE",
                  message: denyRead
                    ? "Fictional library access denied."
                    : "Fictional library read unavailable.",
                },
              },
            });
            return;
          }
          // Every actual inventory read is constrained to this invocation's
          // owned fictional form. Existing chapter records never enter captures.
          url.searchParams.set("q", viewport.width + " " + marker);
          let response;
          try {
            response = await route.fetch({ url: url.href });
          } catch {
            throw Error("Owned library read transport interrupted.");
          }
          if (response.status() !== 200)
            throw Error("Owned library read failed " + response.status());
          await route.fulfill({ response });
          return;
        }
        await route.continue();
      });
      await page.goto(h.env.APP_ORIGIN + "/admin/forms");
      await expect(
        page.getByText("Fictional library read unavailable.", { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByText("Matching forms", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "No forms are available" }),
      ).toHaveCount(0);
      failRead = false;
      await page
        .getByRole("button", { name: "Recheck form library", exact: true })
        .click();
      const row = page.getByRole("link", { name: new RegExp(form.title) });
      await expect(row).toBeVisible();
      await expect(page.locator("#form-library-read-status")).toBeFocused();
      check(
        writes.length === 0,
        "first library failure remains distinct from empty data and read-only retry restores focus" +
          label,
      );
      failRead = true;
      await page
        .getByRole("button", { name: "Recheck form library", exact: true })
        .click();
      await expect(
        page.getByText("Fictional library read unavailable.", { exact: false }),
      ).toBeVisible();
      await expect(row).toBeVisible();
      await expect(
        page.getByText(/Last successful form library read/),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Create form", exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "Actions for " + form.title })
        .click();
      for (const name of ["Duplicate", "Archive form"])
        await expect(
          page.getByRole("menuitem", { name, exact: true }),
        ).toBeDisabled();
      await page.keyboard.press("Escape");
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
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      );
      check(
        !violations.length,
        "populated retained library passes measured axe" +
          label +
          (violations.length ? ": " + JSON.stringify(violations) : ""),
      );
      await page.locator("#form-library-read-status").focus();
      await page
        .getByRole("region", { name: "Form inventory table" })
        .evaluate((element) => {
          element.scrollLeft = 0;
        });
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: new URL("library-paused-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
      check(
        writes.length === 0,
        "temporary library outage preserves timestamped rows and pauses writes" +
          label,
      );
      failRead = false;
      await page
        .getByRole("button", { name: "Recheck form library", exact: true })
        .click();
      const create = page.getByRole("button", {
        name: "Create form",
        exact: true,
      });
      await expect(create).toBeEnabled();
      await create.click();
      const title = page.getByLabel("Form title", { exact: false });
      await title.fill("Fictional private creation proposal " + viewport.width);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      failRead = true;
      await create.click();
      await expect(
        page.getByText(/Your proposed title remains on this page/),
      ).toBeVisible();
      await expect(title).toHaveValue(
        "Fictional private creation proposal " + viewport.width,
      );
      await expect(
        page
          .getByRole("dialog")
          .getByRole("button", { name: "Create form", exact: true }),
      ).toBeDisabled();
      check(
        writes.length === 0,
        "failed creation-access refresh preserves a proposed title without creating a form" +
          label,
      );
      failRead = false;
      denyRead = true;
      await page
        .getByRole("button", { name: "Recheck form creation access" })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Form library access needs to be rechecked",
        }),
      ).toBeVisible();
      await expect(title).toHaveCount(0);
      await expect(row).toHaveCount(0);
      denyRead = false;
      await page
        .getByRole("button", { name: "Recheck form library access" })
        .click();
      await expect(row).toBeVisible();
      await create.click();
      await expect(title).toHaveValue("");
      await page.keyboard.press("Escape");
      check(
        writes.length === 0,
        "denial clears private rows, reviews and proposed input before explicit access recovery" +
          label,
      );
      check(
        data(await h.call(root)).form.revision === 1 &&
          checked(
            await h.db
              .from("admin_actions")
              .select("id")
              .eq("target_id", form.id)
              .neq("action", "forms.create"),
          ).length === 0,
        "read-only library recovery leaves the owned form revision and audit unchanged" +
          label,
      );
      check(
        !errors.length &&
          !forbidden.length &&
          !writes.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "library reads have no extra mutation, script error, external request or viewport overflow" +
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
    new URL("../.docs/phase0/local-form-library-read.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and Chromium desktop/mobile private library reads. Initial/transient read failure, timestamped retained inventory, paused actions, proposed creation input retention, denial clearing and focused explicit retry. Inventory routes force a search for this invocation's owned fictional form before forwarding the real API read, so existing records never enter captures. Every browser mutation/external request blocked, realtime paused. Owned form revisions/audits unchanged; forms archived/accounts disabled/sessions revoked. No publication, response, worker/provider send, existing chapter or production change.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
