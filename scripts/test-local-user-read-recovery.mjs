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
  target = randomUUID(),
  marker = actor.slice(0, 8),
  password = "Fictional-directory-recovery-" + randomUUID(),
  email = (id) => "fictional-directory-recovery-" + id + "@example.test",
  query = new URLSearchParams({
    q: email(target),
    state: "current",
    page: "1",
  }).toString(),
  directoryPath = "/admin/users?" + query,
  sessionsPath = "/admin/users/" + target + "/sessions",
  output = new URL("../artifacts/browser/live-user-reads/", import.meta.url),
  tests = [];
let created = false,
  completed = false,
  browser;
const checked = (result) => {
  if (result.error)
    throw Error("Directory fixture DB operation failed " + result.error.code);
  return result.data;
};
const data = (result) => {
  if (result.status !== 200)
    throw Error(
      "Directory fixture API operation failed " +
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
        [actor, target].map((id) => ({
          id,
          email: email(id),
          password_hash: passwordHash,
          role: id === actor ? "super_admin" : "team_member",
          is_active: true,
          display_name:
            "Fictional account read reviewer " +
            (id === actor ? "admin " : "target ") +
            marker,
        })),
      ),
  );
  created = true;
  await login(h, actor);
  await login(other, target);
  for (const path of [directoryPath, sessionsPath]) {
    check(
      (await h.call(path, { anonymous: true })).status === 401,
      "anonymous account read denied for " +
        (path === directoryPath ? "directory" : "sessions"),
    );
    check(
      (await other.call(path)).status === 403,
      "ordinary member account read denied for " +
        (path === directoryPath ? "directory" : "sessions"),
    );
  }
  const directory = await h.call(directoryPath),
    sessions = await h.call(sessionsPath);
  check(
    directory.headers.get("cache-control")?.includes("no-store") &&
      data(directory).items.length === 1 &&
      data(directory).items[0].id === target &&
      !directory.text.includes("password_hash"),
    "authorized account directory returns the literal filtered uncached safe projection",
  );
  check(
    sessions.headers.get("cache-control")?.includes("no-store") &&
      data(sessions).items.length === 1 &&
      !sessions.text.includes("token_hash") &&
      !sessions.text.includes("ip_address"),
    "authorized selected-account sessions are uncached and omit bearer/IP data",
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
        const response = await context.request.post(
          h.env.APP_ORIGIN + "/api/v1" + path,
          { headers: { Origin: h.env.APP_ORIGIN }, data: body },
        );
        if (response.status() !== 200)
          throw Error(
            "Owned directory browser sign-in failed " + response.status(),
          );
      }
      const page = await context.newPage(),
        errors = [],
        forbidden = [];
      let failDirectory = true,
        failSessions = false,
        denySessions = false,
        directoryReads = 0;
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
                  message: "Realtime paused for account read verification.",
                },
              },
            });
            return;
          }
          forbidden.push("unexpected non-read API request");
          await route.abort("blockedbyclient");
          return;
        }
        if (path === "/api/v1/admin/users") directoryReads++;
        const denied = denySessions && path === "/api/v1" + sessionsPath;
        if (
          denied ||
          (failDirectory && path === "/api/v1/admin/users") ||
          (failSessions && path === "/api/v1" + sessionsPath)
        ) {
          await route.fulfill({
            status: denied ? 403 : 503,
            json: {
              error: {
                code: denied ? "FORBIDDEN" : "TEMPORARILY_UNAVAILABLE",
                message: "Fictional controlled account read interruption.",
              },
            },
          });
          return;
        }
        await route.continue();
      });
      const label = " at " + viewport.width + "×" + viewport.height;
      await page.goto(h.env.APP_ORIGIN + "/admin/users", {
        waitUntil: "networkidle",
      });
      await expect(
        page.getByRole("button", { name: "Retry account directory" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Create account" }),
      ).toBeDisabled();
      failDirectory = false;
      await page
        .getByRole("button", { name: "Retry account directory" })
        .click();
      await expect(
        page.getByRole("cell").filter({ hasText: email(target) }),
      ).toBeVisible();
      check(
        await page
          .locator("#workspace-content")
          .evaluate((element) => element === document.activeElement),
        "actual account directory retry restores current data and workspace focus" +
          label,
      );
      await page
        .getByRole("searchbox", { name: "Search account emails" })
        .fill(email(target));
      await expect(page.getByRole("row")).toHaveCount(2);
      const row = page
        .getByRole("row")
        .filter({ has: page.getByRole("cell").filter({ hasText: email(target) }) });
      await row.getByRole("button", { name: "Edit", exact: true }).click();
      const displayName = page.getByLabel(/^Display name/),
        draft = "Fictional retained editor " + marker;
      await displayName.fill(draft);
      failDirectory = true;
      await page
        .getByRole("button", { name: "Refresh account directory" })
        .click();
      await expect(
        page.getByRole("button", { name: "Retry account directory" }),
      ).toBeVisible();
      await expect(
        page.getByText(/Last successful account read/),
      ).toBeVisible();
      await expect(
        row.getByRole("button", { name: "Sessions", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Save account", exact: true }),
      ).toBeDisabled();
      await expect(displayName).toHaveValue(draft);
      check(
        true,
        "failed directory refresh retains timestamped rows/editor input while security/session actions are disabled" +
          label,
      );
      failDirectory = false;
      await page
        .getByRole("button", { name: "Retry account directory" })
        .click();
      await expect(
        page.getByRole("button", { name: "Save account", exact: true }),
      ).toBeEnabled();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      failSessions = true;
      const opener = row.getByRole("button", { name: "Sessions", exact: true });
      await opener.click();
      await expect(
        page.getByRole("button", { name: "Retry account sessions" }),
      ).toBeVisible();
      await expect(
        page.getByText("No active sessions.", { exact: true }),
      ).toHaveCount(0);
      failSessions = false;
      const count = directoryReads;
      await page
        .getByRole("button", { name: "Retry account sessions" })
        .click();
      const panel = page.getByRole("region", {
        name: "Selected account sessions",
      });
      await expect(panel.getByText(/^Signed in/)).toBeVisible();
      check(
        count === directoryReads,
        "actual selected-account session retry is independent from directory reads" +
          label,
      );
      failSessions = true;
      await page
        .getByRole("button", { name: "Refresh account sessions" })
        .click();
      await expect(
        page.getByRole("button", { name: "Retry account sessions" }),
      ).toBeVisible();
      await expect(panel.getByText(/^Signed in/)).toBeVisible();
      await expect(
        panel.getByText(/Last successful session read/),
      ).toBeVisible();
      check(
        true,
        "failed actual session refresh retains its own timestamped inventory" +
          label,
      );
      failSessions = false;
      await page
        .getByRole("button", { name: "Retry account sessions" })
        .click();
      await expect(
        page.getByRole("button", { name: "Refresh account sessions" }),
      ).toBeEnabled();
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
          })
        ).violations.map((item) => item.id),
      );
      check(
        !violations.length,
        "populated directory/sessions pass measured axe checks" +
          label +
          (violations.length ? ": " + violations.join(",") : ""),
      );
      await page.screenshot({
        path: new URL(
          "account-read-recovery-" + viewport.width + ".png",
          output,
        ).pathname,
        fullPage: true,
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Close session details" }).click();
      await expect(opener).toBeFocused();
      await opener.click();
      await expect(panel.getByText(/^Signed in/)).toBeVisible();
      denySessions = true;
      await page
        .getByRole("button", { name: "Refresh account sessions" })
        .click();
      await expect(
        page.getByText("Account access needs to be rechecked", { exact: true }),
      ).toBeVisible();
      await expect(row).toHaveCount(0);
      await expect(panel).toHaveCount(0);
      denySessions = false;
      await page
        .getByRole("button", { name: "Recheck account access" })
        .click();
      await expect(
        row.getByRole("button", { name: "Edit", exact: true }),
      ).toBeVisible();
      check(
        true,
        "denied account session read clears directory/private state before explicit access recheck" +
          label,
      );
      const table = page.getByRole("region", {
        name: "Chapter accounts table",
      });
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
        "directory recovery preserves keyboard table access without page errors, writes, external requests or overflow" +
          label,
      );
    } finally {
      await context.close();
    }
  }
  const retained = checked(
    await h.db
      .from("admin_users")
      .select("revision,is_active,role")
      .eq("id", target)
      .single(),
  );
  check(
    retained.revision === 1 &&
      retained.is_active &&
      retained.role === "team_member",
    "read recovery leaves the owned target account revision/access unchanged",
  );
  completed = true;
} finally {
  await browser?.close();
  if (created) {
    checked(
      await h.db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .in("id", [actor, target]),
    );
    checked(
      await h.db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .in("admin_user_id", [actor, target])
        .is("revoked_at", null),
    );
  }
  await writeFile(
    new URL("../.docs/phase0/local-user-read-recovery.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and Chromium desktop/mobile account-directory/session reads with controlled interruptions/denial and unsaved editor input. Fresh Super Admin and member fixture accounts disabled and sessions revoked. No account mutation was submitted by the browser, no setup/reset/provider send or existing account/session change. Browser non-read API/external requests blocked; realtime paused. Captures ignored/private; no credentials or response bodies retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
