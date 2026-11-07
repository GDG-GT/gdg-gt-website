import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret, tokenHash } from "../server/lib/security.mjs";
const require = createRequire(import.meta.url),
  h = await localHttp(),
  other = await localHttp(),
  actor = randomUUID(),
  outsider = randomUUID(),
  inviteId = randomUUID(),
  postId = randomUUID(),
  password = "Fictional-child-reads-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-child-reads-" + id + "@example.test",
  recipient = "fictional-recipient-" + marker + "@example.test",
  title = "Fictional private team post " + marker,
  output = new URL(
    "../artifacts/browser/live-team-child-reads/",
    import.meta.url,
  ),
  tests = [];
let team,
  browser,
  created = false,
  completed = false;
const checked = (result) => {
  if (result.error)
    throw Error("Owned child-read DB operation failed " + result.error.code);
  return result.data;
};
const data = (result) => {
  if (result.status !== 200)
    throw Error(
      "Owned child-read API operation failed " +
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
          display_name: "Fictional child-read reviewer " + marker,
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
          name: "Fictional child-read team " + marker,
          slug: "fictional-child-read-" + marker,
          description: "Private owned recovery fixture",
          color: "#4285F4",
          icon: "users",
          leadId: actor,
        },
      },
    }),
  ).team;
  // Seed owned rows directly: no delivery job, usable capability or publication.
  checked(
    await h.db
      .from("team_invites")
      .insert({
        id: inviteId,
        team_id: team.id,
        email: recipient,
        role: "member",
        invited_by: actor,
        token_hash: tokenHash(randomUUID()),
        status: "pending",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      }),
  );
  checked(
    await h.db
      .from("team_announcements")
      .insert({
        id: postId,
        team_id: team.id,
        title,
        message: "Fictional private read-recovery body",
        author_id: actor,
        is_published: false,
        revision: 1,
      }),
  );
  const root = "/admin/teams/" + team.id;
  for (const kind of ["invitations", "announcements"]) {
    check(
      (await h.call(root + "/" + kind, { anonymous: true })).status === 401,
      "anonymous cannot read private team " + kind,
    );
    check(
      (await other.call(root + "/" + kind)).status === 404,
      "unrelated member cannot discover team " + kind,
    );
    const response = await h.call(root + "/" + kind),
      rows = data(response);
    check(
      response.headers.get("cache-control")?.includes("no-store") &&
        rows.items.length === 1 &&
        !JSON.stringify(rows).includes("token_hash"),
      "authorized " + kind + " read is private and omits capability material",
    );
  }
  const beforeInvites = data(await h.call(root + "/invitations")),
    beforePosts = data(await h.call(root + "/announcements"));
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
            "Owned child-read browser sign-in failed " + response.status(),
          );
      }
      const page = await context.newPage(),
        errors = [],
        forbidden = [];
      let failedKind = "",
        deniedKind = "";
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
                  message: "Realtime paused for owned read verification.",
                },
              },
            });
            return;
          }
          forbidden.push("unexpected non-read request");
          await route.abort("blockedbyclient");
          return;
        }
        const denied =
            !!deniedKind && path === "/api/v1" + root + "/" + deniedKind,
          failed = !!failedKind && path === "/api/v1" + root + "/" + failedKind;
        if (denied || failed) {
          await route.fulfill({
            status: denied ? 403 : 503,
            json: {
              error: {
                code: denied ? "FORBIDDEN" : "UNAVAILABLE",
                message: denied
                  ? "Fictional child read denied."
                  : "Fictional child read unavailable.",
              },
            },
          });
          return;
        }
        await route.continue();
      });
      for (const kind of ["invitations", "announcements"]) {
        const label = ` for ${kind} at ${viewport.width}×${viewport.height}`;
        failedKind = kind;
        await page.goto(
          h.env.APP_ORIGIN + "/admin/team/" + team.id + "?section=" + kind,
        );
        await expect(
          page.getByText("Fictional child read unavailable.", { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText(
            kind === "invitations"
              ? "No invitations recorded"
              : "No announcements in this view",
            { exact: true },
          ),
        ).toHaveCount(0);
        check(
          true,
          "initial failed child read never renders a false empty state" + label,
        );
        failedKind = "";
        const reload = page.getByRole("button", {
          name: "Reload " + kind,
          exact: true,
        });
        await reload.click();
        await expect(
          page.getByText(kind === "invitations" ? recipient : title, {
            exact: true,
          }),
        ).toBeVisible();
        if (kind === "announcements")
          await page
            .getByRole("button", { name: "Write announcement" })
            .click();
        const input = page.getByLabel(
            kind === "invitations" ? /^Recipient email/ : /^Announcement title/,
          ),
          value =
            kind === "invitations"
              ? "fictional-unsent@example.test"
              : "Fictional retained private draft";
        await input.fill(value);
        failedKind = kind;
        await reload.click();
        await expect(
          page.getByText("Fictional child read unavailable.", { exact: true }),
        ).toBeVisible();
        await expect(input).toHaveValue(value);
        await expect(input).toBeDisabled();
        await expect(
          page.getByText(/Showing the last successful/),
        ).toBeVisible();
        check(
          true,
          "temporary child outage retains timestamped rows and pauses preserved input" +
            label,
        );
        failedKind = "";
        await reload.click();
        await expect(input).toBeEnabled();
        await expect(input).toHaveValue(value);
        await expect(
          page.getByRole("region", {
            name:
              kind === "invitations"
                ? "Private team invitations"
                : "Team announcements",
            exact: true,
          }),
        ).toBeFocused();
        check(
          true,
          "independent read-only retry restores focus and retains the unsent child draft" +
            label,
        );
        await page.addScriptTag({
          path: require.resolve("axe-core/axe.min.js"),
        });
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
          "populated recovered child panel passes measured axe" +
            label +
            (violations.length ? ": " + violations.join(",") : ""),
        );
        await page.screenshot({
          path: new URL(kind + "-" + viewport.width + ".png", output).pathname,
          fullPage: true,
          animations: "disabled",
        });
        deniedKind = kind;
        await reload.click();
        const recheck = page.getByRole("button", {
          name:
            kind === "invitations"
              ? "Recheck invitation access"
              : "Recheck announcement access",
        });
        await expect(recheck).toBeVisible();
        await expect(input).toHaveCount(0);
        await expect(
          page.getByText(kind === "invitations" ? recipient : title, {
            exact: true,
          }),
        ).toHaveCount(0);
        deniedKind = "";
        await recheck.click();
        await expect(
          page.getByText(kind === "invitations" ? recipient : title, {
            exact: true,
          }),
        ).toBeVisible();
        if (kind === "invitations") await expect(input).toHaveValue("");
        else await expect(input).toHaveCount(0);
        check(
          true,
          "denied child read clears rows and input before explicit fresh recheck" +
            label,
        );
      }
      check(
        !errors.length &&
          !forbidden.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "both child workflows have no script error, browser mutation, external request or horizontal page overflow at " +
          viewport.width,
      );
    } finally {
      await context.close();
    }
  }
  check(
    JSON.stringify(data(await h.call(root + "/invitations"))) ===
      JSON.stringify(beforeInvites) &&
      JSON.stringify(data(await h.call(root + "/announcements"))) ===
        JSON.stringify(beforePosts),
    "all child read checks leave owned invitations and announcements unchanged",
  );
  check(
    checked(
      await h.db
        .from("delivery_jobs")
        .select("id")
        .contains("payload", { teamId: team.id }),
    ).length === 0,
    "owned read fixtures create no delivery jobs",
  );
  completed = true;
} finally {
  await browser?.close();
  if (team) {
    checked(
      await h.db
        .from("team_invites")
        .update({ status: "cancelled" })
        .eq("id", inviteId)
        .eq("team_id", team.id),
    );
    checked(
      await h.db
        .from("team_announcements")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", postId)
        .eq("team_id", team.id),
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
      "../.docs/phase0/local-team-child-read-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and Chromium desktop/mobile child read recovery. Only fresh owned fictional accounts/team/invitation/private announcement; invitation seeded without usable capability or delivery job, post never published. Browser non-read/external calls blocked; realtime paused. Rows unchanged before owned recoverable archive/cancellation; accounts disabled/sessions revoked. No provider send, existing chapter record or production change. Captures ignored; no credentials/response bodies retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
