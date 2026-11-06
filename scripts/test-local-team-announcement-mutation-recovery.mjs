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
  password = "Fictional-post-replay-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-post-replay-" + id + "@example.test",
  output = new URL(
    "../artifacts/browser/live-team-announcement-writes/",
    import.meta.url,
  ),
  tests = [];
let team,
  postId,
  browser,
  created = false,
  completed = false;
const checked = (result) => {
  if (result.error)
    throw Error("Owned announcement DB operation failed " + result.error.code);
  return result.data;
};
const data = (result) => {
  if (result.status !== 200)
    throw Error(
      "Owned announcement API operation failed " +
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
    "A local sender/scheduler is running; no fixture created. Pause it before announcement receipt verification.",
  );
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
        display_name: "Fictional announcement reviewer " + marker,
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
          name: "Fictional announcement team " + marker,
          slug: "fictional-announcement-" + marker,
          description: "Owned private announcement replay fixture",
          color: "#4285F4",
          icon: "users",
          leadId: actor,
        },
      },
    }),
  ).team;
  const root = "/admin/teams/" + team.id + "/announcements",
    title = "Fictional initial post " + marker,
    body = { record: { title, message: "Fictional initial private body" } },
    key = randomUUID();
  check(
    (await h.call(root, { method: "POST", body, key: null })).status === 400,
    "announcement mutation refuses missing retry identity",
  );
  const creates = await Promise.all(
    Array.from({ length: 10 }, () =>
      h.call(root, { method: "POST", body, key }),
    ),
  );
  const records = creates.map((result) => data(result));
  postId = records[0].id;
  check(
    records.every((record) => record.id === postId) &&
      checked(
        await h.db
          .from("team_announcements")
          .select("id")
          .eq("team_id", team.id),
      ).length === 1 &&
      checked(
        await h.db
          .from("admin_actions")
          .select("id")
          .eq("target_id", postId)
          .eq("action", "teams.announcement_create"),
      ).length === 1,
    "ten concurrent draft creates commit one post and audit",
  );
  check(
    (
      await h.call(root, {
        method: "POST",
        key,
        body: { record: { title, message: "Changed intent" } },
      })
    ).status === 409,
    "changed private draft cannot reuse an accepted intent key",
  );
  check(
    (
      await h.call(root + "/" + postId, {
        method: "POST",
        body: { action: "publish", revision: 1 },
      })
    ).status === 400,
    "publication requires typed target confirmation",
  );
  const publishBody = { action: "publish", revision: 1, confirmation: title },
    publishKey = randomUUID();
  const publications = await Promise.all(
    Array.from({ length: 10 }, () =>
      h.call(root + "/" + postId, {
        method: "POST",
        body: publishBody,
        key: publishKey,
      }),
    ),
  );
  publications.forEach(data);
  check(
    checked(
      await h.db
        .from("delivery_jobs")
        .select("id")
        .contains("payload", { announcementId: postId }),
    ).length === 1 &&
      checked(
        await h.db
          .from("team_announcements")
          .select("publication_version,revision")
          .eq("id", postId)
          .single(),
      ).publication_version === 1,
    "ten identical publications snapshot one audience/version and queue one metadata-only notification job",
  );
  for (const path of [
    root + "/" + postId,
    root + "?title=" + encodeURIComponent(title),
  ]) {
    check(
      (await h.call(path, { anonymous: true })).status === 401 &&
        (await other.call(path)).status === 404,
      "exact announcement recheck conceals unrelated and anonymous reads",
    );
    const response = await h.call(path);
    check(
      response.status === 200 &&
        response.headers.get("cache-control")?.includes("no-store"),
      "authorized exact announcement read remains private and uncached",
    );
  }
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const before = data(await h.call(root + "/" + postId)).record,
      changedTitle = "Fictional reviewed post " + viewport.width + " " + marker,
      changedMessage = "Fictional reviewed body " + "LongContext".repeat(30);
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
            "Owned announcement browser sign-in failed " + response.status(),
          );
      }
      const page = await context.newPage(),
        errors = [],
        forbidden = [],
        writes = [],
        lost = new Set(["update", "publish", "archive"]);
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
                  message:
                    "Realtime paused for owned announcement verification.",
                },
              },
            });
            return;
          }
          const doc = request.postDataJSON(),
            action = request.method() === "PATCH" ? "update" : doc.action;
          if (
            path === "/api/v1" + root + "/" + postId &&
            ["update", "publish", "archive"].includes(action)
          ) {
            writes.push({
              action,
              key: request.headers()["idempotency-key"],
              fingerprint: JSON.stringify(doc),
            });
            const response = await route.fetch();
            if (response.status() !== 200)
              throw Error(
                "Owned announcement mutation did not return success " +
                  response.status(),
              );
            if (lost.has(action)) {
              lost.delete(action);
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
      async function reconcile(action) {
        const retry = page.getByRole("button", {
          name: "Retry original announcement operation",
        });
        await expect(retry).toBeDisabled();
        await page
          .getByRole("button", { name: "Recheck saved announcement values" })
          .click();
        await expect(
          page.getByText("Inspect current saved announcement values", {
            exact: true,
          }),
        ).toBeVisible();
        check(
          writes.filter((row) => row.action === action).length === 1,
          "lost " +
            action +
            " performs only a read-only recheck before explicit replay" +
            label,
        );
        await retry.click();
        const receipt = page.getByText(
          new RegExp("Announcement " + action + " confirmed by the server"),
        );
        await expect(receipt).toBeVisible();
        await expect(receipt).toBeFocused();
        const attempts = writes.filter((row) => row.action === action);
        check(
          attempts.length === 2 &&
            attempts[0].key === attempts[1].key &&
            attempts[0].fingerprint === attempts[1].fingerprint,
          "recovered " +
            action +
            " uses exactly one immutable intent/key" +
            label,
        );
      }
      await page.goto(
        h.env.APP_ORIGIN + "/admin/team/" + team.id + "?section=announcements",
      );
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page.getByLabel(/^Announcement title/).fill(changedTitle);
      await page.getByLabel(/^Message/).fill(changedMessage);
      const save = page.getByRole("button", {
        name: "Save private draft",
        exact: true,
      });
      await save.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(before.title);
      await expect(dialog).toContainText(changedMessage);
      await expect(dialog).toContainText(
        "returns the published post to a private draft",
      );
      check(
        writes.length === 0,
        "published edit reviews original/proposed body and unpublication consequence before writing" +
          label,
      );
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(save).toBeFocused();
      await save.click();
      await page.getByLabel(/^Type announcement title/).fill(before.title);
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
            },
          })
        ).violations.map((value) => value.id),
      );
      check(
        !violations.length,
        "populated long published-edit review passes measured axe" +
          label +
          (violations.length ? ": " + violations.join(",") : ""),
      );
      await page.screenshot({
        path: new URL("published-review-" + viewport.width + ".png", output)
          .pathname,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Confirm published-post changes" })
        .click();
      await reconcile("update");
      await expect(dialog).toHaveCount(0);
      let current = data(await h.call(root + "/" + postId)).record;
      check(
        current.revision === before.revision + 1 &&
          !current.is_published &&
          current.title === changedTitle &&
          checked(
            await h.db
              .from("admin_actions")
              .select("id")
              .eq("target_id", postId)
              .eq("action", "teams.announcement_update"),
          ).length === (viewport.width === 1440 ? 1 : 2),
        "lost published-edit replay commits one private-draft revision/audit" +
          label,
      );
      const beforePublication = checked(
        await h.db
          .from("delivery_jobs")
          .select("id")
          .contains("payload", { announcementId: postId }),
      ).length;
      await page
        .getByRole("button", { name: "Publish announcement", exact: true })
        .click();
      await page.getByLabel(/^Type announcement title/).fill(changedTitle);
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await reconcile("publish");
      check(
        checked(
          await h.db
            .from("delivery_jobs")
            .select("id")
            .contains("payload", { announcementId: postId }),
        ).length ===
          beforePublication + 1,
        "lost publication replay queues one metadata-only notification job" +
          label,
      );
      current = data(await h.call(root + "/" + postId)).record;
      await page
        .getByRole("button", { name: "Archive announcement", exact: true })
        .click();
      await page.getByLabel(/^Type announcement title/).fill(changedTitle);
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await reconcile("archive");
      const archived = data(await h.call(root + "/" + postId)).record;
      check(
        !!archived.deleted_at && archived.revision === current.revision + 1,
        "lost archive receipt replays once after the current-view row disappears" +
          label,
      );
      check(
        !errors.length &&
          !forbidden.length &&
          writes.length === 6 &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "announcement recovery has no extra write, worker send, external request, script error or page overflow" +
          label,
      );
      if (viewport.width === 1440) {
        data(
          await h.call(root + "/" + postId, {
            method: "POST",
            body: {
              action: "restore",
              revision: archived.revision,
              confirmation: archived.title,
            },
          }),
        );
        const restored = data(await h.call(root + "/" + postId)).record;
        data(
          await h.call(root + "/" + postId, {
            method: "POST",
            body: {
              action: "publish",
              revision: restored.revision,
              confirmation: restored.title,
            },
          }),
        );
      }
    } finally {
      await context.close();
    }
  }
  check(
    checked(
      await h.db.from("team_announcements").select("id").eq("team_id", team.id),
    ).length === 1 &&
      checked(
        await h.db
          .from("delivery_jobs")
          .select("id")
          .contains("payload", { announcementId: postId }),
      ).length === 4,
    "complete probe retains one post and four explicitly intended publication jobs",
  );
  completed = true;
} finally {
  await browser?.close();
  if (team) {
    const ownedPosts = checked(
      await h.db.from("team_announcements").select("id").eq("team_id", team.id),
    );
    for (const owned of ownedPosts) {
      checked(
        await h.db
          .from("delivery_jobs")
          .update({ state: "dead", secret_payload: null })
          .contains("payload", { announcementId: owned.id }),
      );
      checked(
        await h.db
          .from("team_announcements")
          .update({ is_active: false, deleted_at: new Date().toISOString() })
          .eq("id", owned.id)
          .eq("team_id", team.id),
      );
    }
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
      "../.docs/phase0/local-team-announcement-mutation-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and Chromium desktop/mobile announcement receipt verification: ten concurrent creates/publications, accepted-but-lost published edits/publications/archives, read-only exact rechecks and immutable retries. Sender/scheduler preflight; no worker invoked or provider send. Only fresh owned fictional accounts/team/post/jobs, jobs marked dead/secrets cleared, post/team archived/accounts disabled/sessions revoked. No existing chapter record or production change. Captures private/ignored; no credentials/response bodies retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
