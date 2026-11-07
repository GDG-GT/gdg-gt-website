import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
const require = createRequire(import.meta.url),
  h = await localHttp(),
  other = await localHttp(),
  actor = randomUUID(),
  outsider = randomUUID(),
  task = randomUUID(),
  password = "Fictional-overview-recovery-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-overview-recovery-" + id + "@example.test",
  title = "Fictional own overview task " + marker,
  output = new URL(
    "../artifacts/browser/live-overview-reads/",
    import.meta.url,
  ),
  tests = [];
let created = false,
  completed = false,
  browser;
const checked = (result) => {
  if (result.error)
    throw Error("Overview fixture DB operation failed " + result.error.code);
  return result.data;
};
const data = (result) => {
  if (result.status !== 200)
    throw Error(
      "Overview fixture API operation failed " +
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
          display_name: "Fictional overview recovery reviewer " + marker,
        })),
      ),
  );
  created = true;
  checked(
    await h.db
      .from("communication_tasks")
      .insert({
        id: task,
        title,
        description: "Fictional private task body excluded from dashboard",
        assigned_to_id: actor,
        assigned_by_id: actor,
        status: "pending",
        priority: "medium",
      }),
  );
  await login(h, actor);
  await login(other, outsider);
  check(
    (await h.call("/admin/dashboard", { anonymous: true })).status === 401,
    "anonymous overview read is denied",
  );
  const inventory = await h.call("/admin/dashboard"),
    own = data(inventory);
  check(
    inventory.headers.get("cache-control")?.includes("no-store") &&
      own.widgets.tasks.state === "ready" &&
      own.widgets.tasks.data.items.some((row) => row.id === task) &&
      !inventory.text.includes("Fictional private task body"),
    "authorized uncached overview returns the own safe assigned-task projection",
  );
  const otherOverview = data(await other.call("/admin/dashboard"));
  check(
    otherOverview.widgets.tasks.state === "ready" &&
      !otherOverview.widgets.tasks.data.items.some((row) => row.id === task),
    "unrelated account overview cannot include the owned private task",
  );
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
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
          throw Error("Owned overview browser sign-in failed " + r.status());
      }
      const page = await context.newPage(),
        errors = [],
        forbidden = [];
      let fail = true,
        denied = false,
        partial = false,
        reads = 0;
      page.on("pageerror", (error) => errors.push(error.name));
      await page.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          path = url.pathname;
        if (url.origin !== h.env.APP_ORIGIN) {
          forbidden.push("external origin");
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
                  code: "TEMPORARILY_UNAVAILABLE",
                  message: "Realtime paused for overview read verification.",
                },
              },
            });
            return;
          }
          forbidden.push("unexpected non-read API request");
          await route.abort("blockedbyclient");
          return;
        }
        if (path === "/api/v1/admin/dashboard") {
          reads++;
          if (fail || denied) {
            await route.fulfill({
              status: denied ? 403 : 503,
              json: {
                error: {
                  code: denied ? "FORBIDDEN" : "TEMPORARILY_UNAVAILABLE",
                  message: "Fictional controlled overview read interruption.",
                },
              },
            });
            return;
          }
          if (partial) {
            const response = await route.fetch();
            if (response.status() !== 200)
              throw Error("Underlying local overview read failed");
            const json = await response.json();
            json.data.widgets.registrations = {
              state: "error",
              message: "Fictional controlled registration widget interruption.",
            };
            await route.fulfill({ response, json });
            return;
          }
        }
        await route.continue();
      });
      const label = " at " + viewport.width + "×" + viewport.height;
      await page.goto(h.env.APP_ORIGIN + "/admin", {
        waitUntil: "networkidle",
      });
      await expect(
        page.getByRole("button", { name: "Retry overview" }),
      ).toBeVisible();
      fail = false;
      await page.getByRole("button", { name: "Retry overview" }).click();
      await expect(
        page.getByRole("link", { name: title, exact: true }),
      ).toBeVisible();
      check(
        await page
          .locator("#workspace-content")
          .evaluate((element) => element === document.activeElement),
        "actual overview initial retry recovers own data and workspace focus" +
          label,
      );
      fail = true;
      await page.getByRole("button", { name: "Refresh overview" }).click();
      await expect(
        page.getByRole("button", { name: "Retry overview" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: title, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(/Showing the overview loaded at/),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Plan an event/ }),
      ).toHaveCount(0);
      check(
        true,
        "actual failed refresh retains a dated overview and removes stale quick actions" +
          label,
      );
      fail = false;
      partial = true;
      await page.getByRole("button", { name: "Retry overview" }).click();
      await expect(
        page.getByRole("button", { name: "Retry registrations" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: title, exact: true }),
      ).toBeVisible();
      partial = false;
      const previous = reads;
      await page.getByRole("button", { name: "Retry registrations" }).click();
      await expect(
        page.getByRole("button", { name: "Retry registrations" }),
      ).toHaveCount(0);
      check(
        reads === previous + 1,
        "failed widget retries through one current overview read while unrelated data remains visible" +
          label,
      );
      await context.setOffline(true);
      await expect(
        page.getByRole("button", { name: "Refresh overview" }),
      ).toBeDisabled();
      await expect(page.getByText(/Overview snapshot from/)).toBeVisible();
      await expect(
        page.getByRole("link", { name: title, exact: true }),
      ).toBeVisible();
      const beforeReconnect = reads;
      await context.setOffline(false);
      await expect(
        page.getByRole("button", { name: "Refresh overview" }),
      ).toBeEnabled();
      check(
        reads === beforeReconnect,
        "offline overview keeps timestamped data and reconnect does not auto-submit or refresh" +
          label,
      );
      denied = true;
      await page.getByRole("button", { name: "Refresh overview" }).click();
      await expect(
        page.getByText("Overview access needs to be rechecked", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: title, exact: true }),
      ).toHaveCount(0);
      denied = false;
      await page
        .getByRole("button", { name: "Recheck overview access" })
        .click();
      await expect(
        page.getByRole("link", { name: title, exact: true }),
      ).toBeVisible();
      check(
        true,
        "overview denial clears private widgets before an explicit current-access recheck" +
          label,
      );
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
          })
        ).violations.map((row) => row.id),
      );
      check(
        !violations.length,
        "populated overview passes measured axe checks" +
          label +
          (violations.length ? ": " + violations.join(",") : ""),
      );
      check(
        !errors.length &&
          !forbidden.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "overview recovery has no page error, non-read API call, external request or page overflow" +
          label,
      );
      await page.screenshot({
        path: new URL("overview-recovery-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
    } finally {
      await context.close();
    }
  }
  const retained = checked(
    await h.db
      .from("communication_tasks")
      .select("title,revision,archived_at,assigned_to_id")
      .eq("id", task)
      .single(),
  );
  check(
    retained.title === title &&
      retained.revision === 1 &&
      retained.archived_at === null &&
      retained.assigned_to_id === actor,
    "overview recovery leaves the owned task revision and contents unchanged",
  );
  completed = true;
} finally {
  await browser?.close();
  if (created) {
    checked(
      await h.db
        .from("communication_tasks")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", task)
        .eq("assigned_by_id", actor),
    );
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
      "../.docs/phase0/local-overview-read-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and Chromium desktop/mobile overview reads with controlled aggregate/individual-widget failures and denial. Real own-task projection; all other ready widgets remain actual API results. Fresh owned task archived, fictional accounts disabled and sessions revoked. Browser non-read API/external requests blocked; realtime paused. No provider sends, existing account/record or production changes. Captures ignored/private; no credentials or response bodies retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
