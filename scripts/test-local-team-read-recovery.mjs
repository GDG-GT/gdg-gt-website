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
  password = "Fictional-team-reads-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-team-reads-" + id + "@example.test",
  output = new URL("../artifacts/browser/live-team-reads/", import.meta.url),
  tests = [],
  teams = [];
let source, destination;
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
          display_name: "Fictional team read reviewer " + marker,
        })),
      ),
  );
  created = true;
  await login(h, actor);
  await login(other, outsider);
  for (const label of ["source", "destination"]) {
    const result = data(
      await h.call("/admin/teams", {
        method: "POST",
        body: {
          currentPassword: password,
          record: {
            name: "Fictional read " + label + " " + marker,
            slug: "fictional-read-" + label + "-" + marker,
            description: "Private fictional read recovery team",
            color: "#4285F4",
            icon: "users",
            leadId: actor,
          },
        },
      }),
    );
    teams.push(result.team.id);
    if (label === "source") source = result;
    else destination = result;
  }
  const root = "/admin/teams/" + source.team.id;
  for (const [path, label] of [
    ["/admin/teams", "inventory"],
    [root, "selected team"],
    [root + "/activity", "team activity"],
    [root + "/transfers", "transfer history"],
  ]) {
    check(
      (await h.call(path, { anonymous: true })).status === 401,
      "anonymous team read denied for " + label,
    );
    const response = await h.call(path);
    check(
      response.status === 200 &&
        response.headers.get("cache-control")?.includes("no-store"),
      "authorized " + label + " is read privately without caching",
    );
    if (path !== "/admin/teams")
      check(
        (await other.call(path)).status === 404,
        "unrelated member cannot discover " + label,
      );
  }
  const before = data(await h.call(root));
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
          throw Error("Owned team browser sign-in failed " + response.status());
      }
      const page = await context.newPage(),
        errors = [],
        forbidden = [];
      let failInventory = true,
        failDetail = false,
        failActivity = false,
        failDestination = false,
        denyDetail = false,
        detailReads = 0;
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
                  message: "Realtime paused for team read verification.",
                },
              },
            });
            return;
          }
          forbidden.push("unexpected non-read API request");
          await route.abort("blockedbyclient");
          return;
        }
        if (path === "/api/v1" + root) detailReads++;
        const denied = denyDetail && path === "/api/v1" + root,
          isDestination =
            path === "/api/v1/admin/teams" &&
            url.searchParams.get("pageSize") === "100";
        if (
          denied ||
          (failInventory && path === "/api/v1/admin/teams" && !isDestination) ||
          (failDetail && path === "/api/v1" + root) ||
          (failActivity && path === "/api/v1" + root + "/activity") ||
          (failDestination && isDestination)
        ) {
          await route.fulfill({
            status: denied ? 403 : 503,
            json: {
              error: {
                code: denied ? "FORBIDDEN" : "TEMPORARILY_UNAVAILABLE",
                message: "Fictional controlled team read interruption.",
              },
            },
          });
          return;
        }
        await route.continue();
      });
      const label = " at " + viewport.width + "×" + viewport.height;
      await page.goto(h.env.APP_ORIGIN + "/admin/team/" + source.team.id, {
        waitUntil: "networkidle",
      });
      await expect(
        page.getByRole("button", { name: "Retry team inventory" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: source.team.name, exact: true }),
      ).toBeVisible();
      check(
        true,
        "selected actual team remains visible during an independent directory outage" +
          label,
      );
      failInventory = false;
      const reads = detailReads;
      await page.getByRole("button", { name: "Retry team inventory" }).click();
      await expect(
        page.getByRole("button", { name: "Retry team inventory" }),
      ).toHaveCount(0);
      check(
        detailReads === reads &&
          (await page
            .locator("#workspace-content")
            .evaluate((element) => element === document.activeElement)),
        "team inventory retry reads independently and returns workspace focus" +
          label,
      );
      await page
        .getByRole("button", { name: "Edit details", exact: true })
        .click();
      const input = page.getByLabel(/^Team name/),
        draft = "Fictional unsaved team " + marker;
      await input.fill(draft);
      failDetail = true;
      await page.getByRole("button", { name: "Refresh selected team" }).click();
      await expect(
        page.getByRole("button", { name: "Retry selected team" }),
      ).toBeVisible();
      await expect(input).toHaveValue(draft);
      await expect(
        page.getByRole("button", { name: "Save team change" }),
      ).toBeDisabled();
      await expect(page.getByText(/Last successful read/)).toBeVisible();
      check(
        true,
        "actual failed team-detail refresh retains timestamped members and unsaved fields while save pauses" +
          label,
      );
      failDetail = false;
      await page.getByRole("button", { name: "Retry selected team" }).click();
      await expect(
        page.getByRole("button", { name: "Save team change" }),
      ).toBeEnabled();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: /Discard/ }).click();
      failActivity = true;
      await page.getByRole("button", { name: "Activity", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Retry team activity" }),
      ).toBeVisible();
      await expect(
        page.getByText("No activity recorded.", { exact: true }),
      ).toHaveCount(0);
      failActivity = false;
      await page.getByRole("button", { name: "Retry team activity" }).click();
      await expect(page.locator(".gt-team-history li")).not.toHaveCount(0);
      failActivity = true;
      await page.getByRole("button", { name: "Refresh team activity" }).click();
      await expect(
        page.getByRole("button", { name: "Retry team activity" }),
      ).toBeVisible();
      await expect(page.locator(".gt-team-history li")).not.toHaveCount(0);
      check(
        true,
        "team history retry and failed refresh distinguish unavailable from empty and retain actual rows" +
          label,
      );
      failActivity = false;
      await page.getByRole("button", { name: "Retry team activity" }).click();
      await page.getByRole("button", { name: "Members", exact: true }).click();
      failDestination = true;
      await page.getByRole("button", { name: "Transfer", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Retry destination teams" }),
      ).toBeVisible();
      await expect(page.getByLabel(/^Destination team/)).toBeDisabled();
      failDestination = false;
      await page
        .getByRole("button", { name: "Retry destination teams" })
        .click();
      await page
        .getByLabel(/^Destination team/)
        .selectOption(destination.team.id);
      failDestination = true;
      await page
        .getByRole("button", { name: "Refresh destination teams" })
        .click();
      await expect(
        page.getByRole("button", { name: "Retry destination teams" }),
      ).toBeVisible();
      await expect(page.getByLabel(/^Destination team/)).toHaveValue(
        destination.team.id,
      );
      await expect(
        page.getByRole("button", { name: "Save team change" }),
      ).toBeDisabled();
      check(
        true,
        "actual transfer destination outage retains selection without allowing a stale transfer" +
          label,
      );
      failDestination = false;
      await page
        .getByRole("button", { name: "Retry destination teams" })
        .click();
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
        "populated team transfer/editor state passes measured axe checks" +
          label +
          (violations.length ? ": " + violations.join(",") : ""),
      );
      await page.screenshot({
        path: new URL("team-read-recovery-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
      denyDetail = true;
      await page.getByRole("button", { name: "Refresh selected team" }).click();
      await expect(
        page.getByText("Team access needs to be rechecked", { exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel(/^Destination team/)).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: source.team.name, exact: true }),
      ).toHaveCount(0);
      denyDetail = false;
      await page.getByRole("button", { name: "Recheck team access" }).click();
      await expect(
        page.getByRole("button", { name: "Open " + source.team.name }),
      ).toBeVisible();
      check(
        true,
        "denied current team read clears team/member/transfer input before explicit directory recheck" +
          label,
      );
      check(
        !errors.length &&
          !forbidden.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "team read workflow has no page error, mutation, external request or horizontal page overflow" +
          label,
      );
    } finally {
      await context.close();
    }
  }
  const after = data(await h.call(root));
  check(
    after.team.revision === before.team.revision &&
      after.team.name === before.team.name &&
      JSON.stringify(after.members) === JSON.stringify(before.members),
    "all team recovery reads leave owned team and memberships unchanged",
  );
  completed = true;
} finally {
  await browser?.close();
  for (const id of teams) {
    const current = data(await h.call("/admin/teams/" + id));
    data(
      await h.call("/admin/teams/" + id, {
        method: "POST",
        body: {
          action: "archive",
          revision: current.team.revision,
          currentPassword: password,
          confirmation: current.team.name,
        },
      }),
    );
  }
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
    new URL("../.docs/phase0/local-team-read-recovery.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and Chromium desktop/mobile team read recovery with controlled independent inventory/detail/activity/destination failures and denial. Only two fresh fictional teams/accounts; browser non-read API/external calls blocked and realtime paused. Team revision/memberships unchanged before owned teams archived/accounts disabled/sessions revoked. No existing record, provider send or production change. Captures ignored/private; no credentials or response bodies retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
