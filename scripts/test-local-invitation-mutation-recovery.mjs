import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
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
  password = "Fictional-invite-replay-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-invite-replay-" + id + "@example.test",
  recipient = "fictional-recipient-" + marker + "@example.test",
  output = new URL(
    "../artifacts/browser/live-invitation-writes/",
    import.meta.url,
  ),
  tests = [];
let team,
  inviteId,
  browser,
  created = false,
  completed = false;
const checked = (result) => {
  if (result.error)
    throw Error("Owned invitation DB operation failed " + result.error.code);
  return result.data;
};
const data = (result) => {
  if (result.status !== 200)
    throw Error(
      "Owned invitation API operation failed " +
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
const processes = execFileSync("ps", ["-axo", "command"], { encoding: "utf8" });
if (
  processes
    .split("\n")
    .some((line) =>
      /(?:node|npm).*scripts\/(?:local-jobs|local-delivery)\.mjs/.test(line),
    )
)
  throw Error(
    "A local sender/scheduler is running; no fixture created. Pause it before invitation receipt verification.",
  );
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
          display_name: "Fictional invitation reviewer " + marker,
        })),
      ),
  );
  created = true;
  await login(h, actor);
  await login(other, outsider);
  team = data(
    await h.call("/admin/teams", {
      method: "POST",
      body: {
        currentPassword: password,
        record: {
          name: "Fictional invitation team " + marker,
          slug: "fictional-invitation-" + marker,
          description: "Owned private invitation replay fixture",
          color: "#4285F4",
          icon: "users",
          leadId: actor,
        },
      },
    }),
  ).team;
  const root = "/admin/teams/" + team.id + "/invitations",
    key = randomUUID(),
    body = { currentPassword: password, email: recipient, role: "member" };
  check(
    (await h.call(root, { method: "POST", body, key: null })).status === 400,
    "invitation mutation refuses missing retry identity",
  );
  const concurrent = await Promise.all(
    Array.from({ length: 10 }, () =>
      h.call(root, { method: "POST", body, key }),
    ),
  );
  const records = concurrent.map((result) => data(result).record);
  inviteId = records[0].id;
  check(
    records.every((record) => record.id === inviteId),
    "ten concurrent invitation creates return one invitation identity",
  );
  check(
    checked(await h.db.from("team_invites").select("id").eq("team_id", team.id))
      .length === 1 &&
      checked(
        await h.db
          .from("delivery_jobs")
          .select("id")
          .contains("payload", { inviteId }),
      ).length === 1 &&
      checked(
        await h.db
          .from("admin_actions")
          .select("id")
          .eq("target_id", inviteId)
          .eq("action", "teams.invite_create"),
      ).length === 1,
    "concurrent invitation replay creates one private-mail job and one audit row",
  );
  check(
    (
      await h.call(root, {
        method: "POST",
        key,
        body: { ...body, role: "lead" },
      })
    ).status === 409,
    "changed invitation role cannot reuse an accepted intent key",
  );
  for (const path of [
    root + "/" + inviteId,
    root + "?email=" + encodeURIComponent(recipient),
  ]) {
    check(
      (await h.call(path, { anonymous: true })).status === 401 &&
        (await other.call(path)).status === 404,
      "exact invitation recheck remains hidden from anonymous and unrelated accounts",
    );
    const response = await h.call(path);
    check(
      response.status === 200 &&
        response.headers.get("cache-control")?.includes("no-store") &&
        !/token_hash|secret_payload/.test(response.text),
      "authorized exact invitation recheck is private and excludes capability material",
    );
  }
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    checked(
      await h.db
        .from("team_invites")
        .update({ last_sent_at: new Date(Date.now() - 120000).toISOString() })
        .eq("id", inviteId)
        .eq("team_id", team.id),
    );
    const before = data(await h.call(root + "/" + inviteId)).record,
      jobs = checked(
        await h.db
          .from("delivery_jobs")
          .select("id")
          .contains("payload", { inviteId }),
      ).length,
      audits = checked(
        await h.db
          .from("admin_actions")
          .select("id")
          .eq("target_id", inviteId)
          .eq("action", "teams.invite_resend"),
      ).length;
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    try {
      for (const [path, loginBody] of [
        ["/auth/gate", { code: h.credentials.gateCode }],
        ["/auth/login", { email: email(actor), password }],
      ]) {
        const response = await context.request.post(
          h.env.APP_ORIGIN + "/api/v1" + path,
          { headers: { Origin: h.env.APP_ORIGIN }, data: loginBody },
        );
        if (response.status() !== 200)
          throw Error(
            "Owned invitation browser sign-in failed " + response.status(),
          );
      }
      const page = await context.newPage(),
        errors = [],
        forbidden = [],
        writes = [];
      let loseResend = true;
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
                  message: "Realtime paused for owned invitation verification.",
                },
              },
            });
            return;
          }
          if (
            path === "/api/v1" + root + "/" + inviteId &&
            request.method() === "POST" &&
            request.postDataJSON().action === "resend"
          ) {
            const { currentPassword: _proof, ...intent } =
              request.postDataJSON();
            writes.push({
              key: request.headers()["idempotency-key"],
              fingerprint: JSON.stringify(intent),
            });
            const response = await route.fetch();
            if (response.status() !== 200)
              throw Error(
                "Owned invitation resend did not return success " +
                  response.status(),
              );
            if (loseResend) {
              loseResend = false;
              await route.abort("connectionfailed");
            } else await route.fulfill({ response });
            return;
          }
          forbidden.push("unexpected non-read request");
          await route.abort("blockedbyclient");
          return;
        }
        await route.continue();
      });
      const label = ` at ${viewport.width}×${viewport.height}`;
      await page.goto(
        h.env.APP_ORIGIN + "/admin/team/" + team.id + "?section=invitations",
      );
      const row = page.getByRole("row").filter({ hasText: recipient });
      await row.getByRole("button", { name: "Resend", exact: true }).click();
      await page.getByLabel(/^Confirm your own password/).fill(password);
      const save = page.getByRole("button", {
        name: "Confirm invitation change",
        exact: true,
      });
      await save.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(recipient);
      await expect(dialog).toContainText("previous link stops working");
      check(
        writes.length === 0,
        "resend review names the exact recipient and link-rotation consequence before mutation" +
          label,
      );
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(save).toBeFocused();
      await save.click();
      await page.screenshot({
        path: new URL("resend-review-" + viewport.width + ".png", output)
          .pathname,
        animations: "disabled",
        mask: [page.getByLabel(/^Confirm your password again/)],
      });
      await page
        .getByRole("button", { name: "Confirm reviewed invitation change" })
        .click();
      const retry = page.getByRole("button", {
        name: "Retry original invitation operation",
      });
      await expect(retry).toBeDisabled();
      await expect(page.getByLabel(/^Current password for retry/)).toHaveValue(
        "",
      );
      await page
        .getByRole("button", { name: "Recheck saved invitation values" })
        .click();
      await expect(
        page.getByText("Inspect current saved invitation values", {
          exact: true,
        }),
      ).toBeVisible();
      check(
        writes.length === 1,
        "lost resend receipt clears proof and performs only an explicit read-only recheck" +
          label,
      );
      await page.getByLabel(/^Current password for retry/).fill(password);
      await retry.click();
      const receipt = page.getByText(
        /Invitation change confirmed by the server/,
      );
      await expect(receipt).toBeVisible();
      await expect(receipt).toBeFocused();
      await expect(dialog).toHaveCount(0);
      const after = data(await h.call(root + "/" + inviteId)).record;
      check(
        writes.length === 2 &&
          writes[0].key === writes[1].key &&
          writes[0].fingerprint === writes[1].fingerprint &&
          after.revision === before.revision + 1 &&
          checked(
            await h.db
              .from("delivery_jobs")
              .select("id")
              .contains("payload", { inviteId }),
          ).length ===
            jobs + 1 &&
          checked(
            await h.db
              .from("admin_actions")
              .select("id")
              .eq("target_id", inviteId)
              .eq("action", "teams.invite_resend"),
          ).length ===
            audits + 1,
        "accepted-but-lost resend replay rotates once and queues one mail/audit" +
          label,
      );
      await row.getByRole("button", { name: "Revoke", exact: true }).click();
      await page.getByLabel(/^Confirm your own password/).fill(password);
      await save.click();
      await expect(dialog).toContainText(
        "existing account or membership remain",
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
        ).violations.map((value) => value.id),
      );
      check(
        !violations.length,
        "populated exact-recipient revoke review passes measured axe" +
          label +
          (violations.length ? ": " + violations.join(",") : ""),
      );
      await page.keyboard.press("Escape");
      check(
        !errors.length &&
          !forbidden.length &&
          writes.length === 2 &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "invitation browser check has no extra write, provider send, external request, script error or page overflow" +
          label,
      );
    } finally {
      await context.close();
    }
  }
  const current = data(await h.call(root + "/" + inviteId)).record,
    revokeKey = randomUUID(),
    revokeBody = {
      currentPassword: password,
      action: "revoke",
      revision: current.revision,
    };
  data(
    await h.call(root + "/" + inviteId, {
      method: "POST",
      body: revokeBody,
      key: revokeKey,
    }),
  );
  const replay = data(
    await h.call(root + "/" + inviteId, {
      method: "POST",
      body: revokeBody,
      key: revokeKey,
    }),
  ).record;
  check(
    replay.status === "cancelled" &&
      replay.revision === current.revision + 1 &&
      checked(
        await h.db
          .from("admin_actions")
          .select("id")
          .eq("target_id", inviteId)
          .eq("action", "teams.invite_revoke"),
      ).length === 1,
    "exact revoke replay returns current cancelled state with one revision and audit",
  );
  check(
    checked(await h.db.from("team_invites").select("id").eq("team_id", team.id))
      .length === 1 &&
      checked(
        await h.db
          .from("delivery_jobs")
          .select("id")
          .contains("payload", { inviteId }),
      ).length === 3,
    "complete receipt probe retains one invitation and exactly three intended private-mail jobs",
  );
  completed = true;
} finally {
  await browser?.close();
  if (team) {
    checked(
      await h.db
        .from("delivery_jobs")
        .update({ state: "dead", secret_payload: null })
        .contains("payload", { teamId: team.id }),
    );
    checked(
      await h.db
        .from("team_invites")
        .update({ status: "cancelled" })
        .eq("team_id", team.id)
        .eq("status", "pending"),
    );
    const current = data(await h.call("/admin/teams/" + team.id)).team;
    data(
      await h.call("/admin/teams/" + team.id, {
        method: "POST",
        body: {
          action: "archive",
          revision: current.revision,
          currentPassword: password,
          confirmation: current.name,
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
      "../.docs/phase0/local-invitation-mutation-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and Chromium desktop/mobile invitation receipt verification. Ten concurrent creates, accepted-but-lost resends, explicit read-only rechecks, identical fresh-proof retries and exact revoke replay. Only fresh owned fictional accounts/team/invitation/jobs. Sender/scheduler preflight; no delivery worker invoked or provider send. Owned jobs marked dead and secret payloads cleared, invitations cancelled/team archived/accounts disabled/sessions revoked. Existing records/production untouched. Captures masked/private; no credentials or response bodies retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
