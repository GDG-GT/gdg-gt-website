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
  password = "Fictional-team-writes-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-team-writes-" + id + "@example.test",
  output = new URL("../artifacts/browser/live-team-writes/", import.meta.url),
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
    await h.db.from("admin_users").insert(
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
  const createDocument = {
    name: "Fictional concurrent team " + marker,
    slug: "fictional-concurrent-team-" + marker,
    description: "Private concurrent team fixture",
    color: "#4285F4",
    icon: "users",
    leadId: actor,
  };
  check(
    (
      await h.call("/admin/teams", {
        method: "POST",
        key: null,
        body: { currentPassword: password, record: createDocument },
      })
    ).status === 400,
    "actual team creation rejects a missing retry identity",
  );
  const createKey = randomUUID(),
    results = await Promise.all(
      Array.from({ length: 10 }, () =>
        h.call("/admin/teams", {
          method: "POST",
          key: createKey,
          body: { currentPassword: password, record: createDocument },
        }),
      ),
    );
  const ids = new Set(results.map((result) => data(result).team.id));
  for (const id of ids) teams.push(id);
  check(ids.size === 1, "ten identical concurrent creates return one team");
  const concurrentTeam = [...ids][0];
  check(
    checked(
      await h.db
        .from("admin_actions")
        .select("id")
        .eq("target_id", concurrentTeam),
    ).length === 1 &&
      checked(
        await h.db
          .from("team_activity_log")
          .select("id")
          .eq("team_id", concurrentTeam),
      ).length === 1,
    "concurrent team creation commits one audit and team activity row",
  );
  check(
    (
      await h.call("/admin/teams", {
        method: "POST",
        key: createKey,
        body: {
          currentPassword: password,
          record: { ...createDocument, name: "Changed intent" },
        },
      })
    ).status === 409,
    "changed team intent cannot reuse an accepted create key",
  );
  let fresh = data(await h.call(root));
  data(
    await h.call(root, {
      method: "POST",
      body: {
        currentPassword: password,
        action: "member_add",
        revision: fresh.team.revision,
        email: email(outsider),
        role: "member",
      },
    }),
  );
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    if (viewport.width === 375) {
      const dest = data(await h.call("/admin/teams/" + destination.team.id)),
        membership = dest.members.find(
          (member) => member.admin_user_id === outsider && member.is_active,
        );
      data(
        await h.call("/admin/teams/" + destination.team.id, {
          method: "POST",
          body: {
            currentPassword: password,
            action: "member_transfer",
            revision: dest.team.revision,
            membershipId: membership.id,
            membershipRevision: membership.revision,
            destinationId: source.team.id,
            reason: "Fictional fixture return for independent viewport",
          },
        }),
      );
    }
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
        forbidden = [],
        writes = [];
      let dropSave = true,
        dropTransfer = true;
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
                  message: "Realtime paused for team mutation verification.",
                },
              },
            });
            return;
          }
          const body = request.postDataJSON(),
            allowed =
              path === "/api/v1" + root &&
              (request.method() === "PATCH" ||
                (request.method() === "POST" &&
                  body.action === "member_transfer"));
          if (!allowed) {
            forbidden.push("unexpected non-read API request");
            await route.abort("blockedbyclient");
            return;
          }
          const { currentPassword, ...intent } = body;
          if (currentPassword !== password)
            throw Error("Incorrect owned fixture proof");
          writes.push({ key: request.headers()["idempotency-key"], intent });
          const response = await route.fetch();
          if (response.status() !== 200)
            throw Error("Owned team mutation rejected " + response.status());
          const lost = request.method() === "PATCH" ? dropSave : dropTransfer;
          if (request.method() === "PATCH") dropSave = false;
          else dropTransfer = false;
          if (lost) await route.abort("connectionfailed");
          else await route.fulfill({ response });
          return;
        }
        await route.continue();
      });
      const label = " at " + viewport.width + "×" + viewport.height;
      await page.goto(h.env.APP_ORIGIN + "/admin/team/" + source.team.id, {
        waitUntil: "networkidle",
      });
      const before = data(await h.call(root));
      await page
        .getByRole("button", { name: "Edit details", exact: true })
        .click();
      const name = "Fictional updated team " + viewport.width + " " + marker;
      await page.getByLabel(/^Team name/).fill(name);
      await page.getByLabel(/^Confirm your own password/).fill(password);
      const save = page.getByRole("button", { name: "Save team change" });
      await save.click();
      await expect(page.getByRole("dialog")).toContainText(before.team.name);
      await expect(page.getByRole("dialog")).toContainText(name);
      check(
        writes.length === 0,
        "actual team edit reviews current/proposed identity before submission" +
          label,
      );
      await page.keyboard.press("Escape");
      await expect(save).toBeFocused();
      await save.click();
      await page.getByRole("button", { name: "Confirm team change" }).click();
      const retry = page.getByRole("button", {
        name: "Retry original team operation",
      });
      await expect(retry).toBeDisabled();
      await expect(page.getByLabel(/^Current password for retry/)).toHaveValue(
        "",
      );
      await page
        .getByRole("button", { name: "Recheck saved team values" })
        .click();
      await expect(
        page.getByText("Inspect current saved team and memberships", {
          exact: true,
        }),
      ).toBeVisible();
      check(
        writes.length === 1,
        "lost team-save result clears password and rechecks read-only before explicit replay" +
          label,
      );
      await page.getByLabel(/^Current password for retry/).fill(password);
      await expect(retry).toBeEnabled();
      await retry.click();
      await expect(
        page.getByText("Edit team details confirmed by the server.", {
          exact: true,
        }),
      ).toBeVisible();
      const after = data(await h.call(root));
      check(
        writes.length === 2 &&
          writes[0].key === writes[1].key &&
          JSON.stringify(writes[0].intent) ===
            JSON.stringify(writes[1].intent) &&
          after.team.revision === before.team.revision + 1 &&
          after.team.name === name,
        "identical real team-save replay commits one revision and audit" +
          label,
      );
      const memberRow = page
        .getByRole("row")
        .filter({ hasText: email(outsider) });
      await memberRow
        .getByRole("button", { name: "Transfer", exact: true })
        .click();
      await page
        .getByLabel(/^Destination team/)
        .selectOption(destination.team.id);
      await page
        .getByLabel(/^Transfer reason/)
        .fill("Fictional reviewed transfer " + viewport.width);
      await page.getByLabel(/^Confirm your own password/).fill(password);
      await page.getByRole("button", { name: "Save team change" }).click();
      await expect(page.getByRole("dialog")).toContainText(email(outsider));
      await expect(page.getByRole("dialog")).toContainText(
        destination.team.name,
      );
      await expect(page.getByRole("dialog")).toContainText(
        "Officer privileges are not inherited",
      );
      check(
        writes.length === 2,
        "real membership transfer names source/destination/recipient and privilege consequence" +
          label,
      );
      await page.getByRole("button", { name: "Confirm team change" }).click();
      await expect(retry).toBeDisabled();
      await page
        .getByRole("button", { name: "Recheck saved team values" })
        .click();
      await expect(
        page.getByText("Inspect current saved team and memberships", {
          exact: true,
        }),
      ).toBeVisible();
      check(
        writes.length === 3,
        "lost transfer receipt performs only current-authorized rechecks" +
          label,
      );
      await page.getByLabel(/^Current password for retry/).fill(password);
      await expect(retry).toBeEnabled();
      await retry.click();
      await expect(
        page.getByText("Transfer membership confirmed by the server.", {
          exact: true,
        }),
      ).toBeVisible();
      check(
        writes.length === 4 &&
          writes[2].key === writes[3].key &&
          JSON.stringify(writes[2].intent) === JSON.stringify(writes[3].intent),
        "identical transfer replay does not create another membership/history occurrence" +
          label,
      );
      await page
        .getByRole("button", { name: "Permissions", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Review & change grants" })
        .click();
      await page.getByLabel(/^Type the complete team name/).fill(name);
      await page.getByLabel(/^Confirm your own password/).fill(password);
      await page.getByRole("button", { name: "Save team change" }).click();
      await expect(page.getByRole("dialog")).toContainText("Current grants:");
      await expect(page.getByRole("dialog")).toContainText("Proposed grants:");
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
        !violations.length && writes.length === 4,
        "populated grant consequence review passes measured axe without applying an unapproved grant set" +
          label +
          (violations.length ? ": " + violations.join(",") : ""),
      );
      await page.screenshot({
        path: new URL("team-grant-review-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Keep editing" }).click();
      check(
        !errors.length &&
          !forbidden.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "team-write workflow has no page error, unintended mutation, external request or page overflow" +
          label,
      );
    } finally {
      await context.close();
    }
  }
  check(
    checked(
      await h.db
        .from("team_member_transfers")
        .select("id")
        .eq("from_team_id", source.team.id)
        .eq("to_team_id", destination.team.id),
    ).length === 2,
    "two viewport transfers and their replay create exactly two source-to-destination history rows",
  );
  check(
    checked(
      await h.db
        .from("admin_actions")
        .select("id")
        .eq("target_id", source.team.id)
        .eq("action", "teams.update"),
    ).length === 2,
    "two accepted-but-lost team saves and their replay create exactly two update audits",
  );
  completed = true;
} finally {
  await browser?.close();
  if (created)
    for (const row of checked(
      await h.db.from("admin_teams").select("id").eq("created_by", actor),
    ))
      if (!teams.includes(row.id)) teams.push(row.id);
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
    new URL(
      "../.docs/phase0/local-team-mutation-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and Chromium desktop/mobile team mutations, concurrent identical creates, accepted-but-lost team/transfer receipts and explicit identical replay with fresh password proof. Only fresh fictional teams/accounts touched. Browser allows only owned source PATCH/member-transfer POST; all other non-read/external origins blocked and realtime paused. Original unrelated-read checks run before fictional member assignment. Grant review cancelled without applying changes. All teams created by this invocation archived/accounts disabled/sessions revoked. No email/provider send, existing record or production change. Captures ignored/private; no passwords, credentials or response bodies retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
