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
  record = randomUUID(),
  password = "Fictional-audit-recovery-" + randomUUID(),
  marker = actor.slice(0, 8),
  action = "fixture.audit_recovery_" + marker,
  email = (id) => "fictional-audit-recovery-" + id + "@example.test",
  filters = new URLSearchParams({ action, actor }).toString(),
  historyPath = "/admin/audit?" + filters,
  entryPath = "/admin/audit/" + record,
  output = new URL("../artifacts/browser/live-audit-reads/", import.meta.url),
  tests = [];
let created = false,
  completed = false,
  browser;
const checked = (result) => {
  if (result.error)
    throw Error("Audit fixture DB operation failed " + result.error.code);
  return result.data;
};
const data = (result) => {
  if (result.status !== 200)
    throw Error(
      "Audit fixture API operation failed " +
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
async function accessibility(page, name) {
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
    name + (violations.length ? ": " + violations.join(",") : ""),
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
          display_name: "Fictional audit recovery reviewer " + marker,
        })),
      ),
  );
  created = true;
  checked(
    await h.db
      .from("admin_actions")
      .insert({
        id: record,
        actor_id: actor,
        action,
        target_type: "fixture",
        target_id: actor,
        result: "success",
        request_id: randomUUID(),
        metadata: { count: 17, privateNote: "Fictional omitted audit content" },
      }),
  );
  await login(h, actor);
  await login(other, outsider);
  for (const path of [historyPath, entryPath]) {
    check(
      (await h.call(path, { anonymous: true })).status === 401,
      "anonymous audit read denied for " +
        (path === historyPath ? "history" : "detail"),
    );
    check(
      (await other.call(path)).status === 403,
      "unprivileged account audit read denied for " +
        (path === historyPath ? "history" : "detail"),
    );
  }
  const inventory = await h.call(historyPath),
    detail = await h.call(entryPath);
  check(
    inventory.status === 200 &&
      inventory.headers.get("cache-control")?.includes("no-store") &&
      data(inventory).items.length === 1 &&
      data(inventory).statistics.total === 1 &&
      !inventory.text.includes("privateNote"),
    "authorized history returns the filtered uncached safe projection",
  );
  check(
    detail.status === 200 &&
      detail.headers.get("cache-control")?.includes("no-store") &&
      data(detail).record.metadata.count === 17 &&
      !detail.text.includes("privateNote") &&
      !detail.text.includes("Fictional omitted"),
    "authorized detail returns approved metadata only without caching",
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
          throw Error("Owned audit browser sign-in failed " + r.status());
      }
      const page = await context.newPage(),
        errors = [],
        forbidden = [];
      let failHistory = true,
        failEntry = false,
        denyHistory = false,
        historyReads = 0;
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
                  message: "Realtime paused for audit read verification.",
                },
              },
            });
            return;
          }
          forbidden.push("unexpected non-read API request");
          await route.abort("blockedbyclient");
          return;
        }
        if (path === "/api/v1/admin/audit") historyReads++;
        const denied = denyHistory && path === "/api/v1/admin/audit";
        if (
          denied ||
          (failHistory && path === "/api/v1/admin/audit") ||
          (failEntry && path === "/api/v1" + entryPath)
        ) {
          await route.fulfill({
            status: denied ? 403 : 503,
            json: {
              error: {
                code: denied ? "FORBIDDEN" : "TEMPORARILY_UNAVAILABLE",
                message: denied
                  ? "Fictional current access denied."
                  : "Fictional controlled audit read interruption.",
              },
            },
          });
          return;
        }
        await route.continue();
      });
      const label = " at " + viewport.width + "×" + viewport.height;
      await page.goto(h.env.APP_ORIGIN + "/admin/audit-log?" + filters, {
        waitUntil: "networkidle",
      });
      await expect(
        page.getByRole("button", { name: "Retry audit history" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Export filtered CSV" }),
      ).toBeDisabled();
      failHistory = false;
      await page.getByRole("button", { name: "Retry audit history" }).click();
      const table = page.getByRole("region", { name: "Audit history table" });
      await expect(table.getByText(action, { exact: true })).toBeVisible();
      check(
        await page
          .locator("#workspace-content")
          .evaluate((element) => element === document.activeElement),
        "real audit history retry restores inventory and workspace focus" +
          label,
      );
      failHistory = true;
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Retry audit history" }),
      ).toBeVisible();
      await expect(table.getByText(action, { exact: true })).toBeVisible();
      await expect(
        page.getByText(/Last successful history read/),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^View details for/ }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Export filtered CSV" }),
      ).toBeDisabled();
      check(
        true,
        "failed real history refresh retains timestamped rows and disables export/detail entry" +
          label,
      );
      failHistory = false;
      await page.getByRole("button", { name: "Retry audit history" }).click();
      const opener = page.getByRole("button", { name: /^View details for/ });
      await expect(opener).toBeEnabled();
      failEntry = true;
      await opener.click();
      await expect(
        page.getByRole("button", { name: "Retry audit entry" }),
      ).toBeVisible();
      const previousReads = historyReads;
      failEntry = false;
      await page.getByRole("button", { name: "Retry audit entry" }).click();
      const panel = page.getByRole("region", { name: "Audit entry detail" });
      await expect(
        panel.getByRole("heading", { name: "Approved metadata" }),
      ).toBeVisible();
      await expect(panel.getByText("17", { exact: true })).toBeVisible();
      check(
        historyReads === previousReads &&
          !(await page
            .getByText("Fictional omitted audit content", { exact: true })
            .count()),
        "entry recovery reads only the selected real detail and shows approved metadata" +
          label,
      );
      failEntry = true;
      await page.getByRole("button", { name: "Refresh audit entry" }).click();
      await expect(
        page.getByRole("button", { name: "Retry audit entry" }),
      ).toBeVisible();
      await expect(panel.getByText("17", { exact: true })).toBeVisible();
      await expect(panel.getByText(/Last successful entry read/)).toBeVisible();
      check(
        true,
        "failed entry refresh retains its own timestamped real snapshot" +
          label,
      );
      failEntry = false;
      await page.getByRole("button", { name: "Retry audit entry" }).click();
      await expect(
        page.getByRole("button", { name: "Refresh audit entry" }),
      ).toBeEnabled();
      await accessibility(
        page,
        "populated audit history/detail pass measured axe checks" + label,
      );
      await page.screenshot({
        path: new URL("audit-recovery-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Close details" }).click();
      await expect(opener).toBeFocused();
      check(
        true,
        "closing actual entry detail restores its invoking control" + label,
      );
      denyHistory = true;
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await expect(
        page.getByText("Audit access needs to be rechecked", { exact: true }),
      ).toBeVisible();
      await expect(table).toHaveCount(0);
      await expect(panel).toHaveCount(0);
      denyHistory = false;
      await page.getByRole("button", { name: "Recheck audit access" }).click();
      await expect(table.getByText(action, { exact: true })).toBeVisible();
      check(
        true,
        "read denial clears all displayed audit data and explicit recheck restores current access" +
          label,
      );
      await table.focus();
      if (
        await table.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        )
      ) {
        await page.keyboard.press("ArrowRight");
        await expect
          .poll(() => table.evaluate((element) => element.scrollLeft))
          .toBeGreaterThan(0);
      }
      check(
        !errors.length &&
          !forbidden.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "audit workflow preserves keyboard table access with no page error, write, external request or page overflow" +
          label,
      );
    } finally {
      await context.close();
    }
  }
  const retained = checked(
    await h.db
      .from("admin_actions")
      .select("actor_id,action,metadata")
      .eq("id", record)
      .single(),
  );
  check(
    retained.actor_id === actor &&
      retained.action === action &&
      retained.metadata.count === 17 &&
      retained.metadata.privateNote === "Fictional omitted audit content",
    "read recovery leaves the owned append-only fixture unchanged",
  );
  completed = true;
} finally {
  await browser?.close();
  if (created) {
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
    new URL("../.docs/phase0/local-audit-read-recovery.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback HTTP/DB and Chromium desktop/mobile audit reads with controlled transient/denied reads. Two fresh fictional accounts disabled and sessions revoked. The owned fictional append-only audit row and normal read-audit records are retained unchanged. Browser non-read API/external origins blocked; realtime paused. No export download, provider send, existing account/record or production change. Captures ignored/private; no credentials or response bodies retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
