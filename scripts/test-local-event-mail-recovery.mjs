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
  attendee = randomUUID(),
  password = "Fictional-mail-recovery-" + randomUUID(),
  marker = actor.slice(0, 8),
  email = (id) => "fictional-mail-recovery-" + id + "@example.test",
  recipient = "fictional-recipient-" + marker + "@example.test",
  output = new URL(
    "../artifacts/browser/live-event-mail-recovery/",
    import.meta.url,
  ),
  tests = [];
let event,
  browser,
  created = false,
  completed = false;
const checked = (result) => {
  if (result.error)
    throw Error("Owned mail DB operation failed " + result.error.code);
  return result.data;
};
const data = (result) => {
  if (result.status !== 200)
    throw Error(
      "Owned mail API operation failed " +
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
    "A local sender/scheduler is running; no fixture created. Pause it before mail receipt verification.",
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
        display_name: "Fictional mail reviewer " + marker,
      })),
    ),
  );
  created = true;
  await login(h, actor);
  await login(other, outsider);
  event = data(
    await h.call("/admin/events", {
      method: "POST",
      body: {
        event: {
          title: "Fictional mail event " + marker,
          slug: "fictional-mail-event-" + marker,
          description: "Owned fictional mail recovery event",
          start_at: "2099-12-31T18:00:00Z",
          location: "Fictional room",
          registration_type: "internal",
          registration_enabled: true,
          team_id: null,
        },
      },
    }),
  ).event;
  data(
    await h.call("/admin/events/" + event.id + "/publish", {
      method: "POST",
      body: { revision: event.revision, event: {} },
    }),
  );
  checked(
    await h.db.from("event_attendance").insert({
      id: attendee,
      event_id: event.id,
      attendee_name: "Fictional mail participant",
      attendee_email: recipient,
      idempotency_key: "1".repeat(64),
      request_hash: "2".repeat(64),
    }),
  );
  const root = "/admin/events/" + event.id + "/email",
    lookup = root + "?reviewId=" + randomUUID();
  check(
    (await h.call(lookup, { anonymous: true, key: randomUUID() })).status ===
      401,
    "anonymous mail approval recovery is denied",
  );
  check(
    [403, 404].includes(
      (await other.call(lookup, { key: randomUUID() })).status,
    ),
    "unrelated account cannot discover mail review or approval receipts",
  );
  check(
    (await h.call(lookup, { key: null })).status === 400,
    "mail receipt lookup requires a valid original retry identity",
  );
  const missing = await h.call(lookup, { key: randomUUID() });
  check(
    missing.status === 200 &&
      missing.headers.get("cache-control")?.includes("no-store") &&
      missing.json.data.state === "unavailable",
    "unavailable owned review returns no audience or fabricated success and is uncached",
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
          throw Error("Owned mail browser sign-in failed " + response.status());
      }
      const page = await context.newPage(),
        errors = [],
        forbidden = [],
        approvals = [];
      let mode = "accepted",
        loseApproval = true,
        denyRecovery = false,
        lastReview;
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
          denyRecovery &&
          request.method() === "GET" &&
          path === "/api/v1" + root &&
          url.searchParams.has("reviewId")
        ) {
          await route.fulfill({
            status: 403,
            json: {
              error: {
                code: "FORBIDDEN",
                message: "Fictional mail recovery access denied.",
              },
            },
          });
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
                  message: "Realtime paused for owned mail verification.",
                },
              },
            });
            return;
          }
          if (
            path === "/api/v1" + root + "-review" &&
            request.method() === "POST"
          ) {
            await route.continue();
            return;
          }
          if (path === "/api/v1" + root && request.method() === "POST") {
            const { currentPassword: _proof, ...intent } =
              request.postDataJSON();
            lastReview = intent.reviewId;
            approvals.push({
              mode,
              key: request.headers()["idempotency-key"],
              fingerprint: JSON.stringify(intent),
            });
            if (loseApproval && mode !== "accepted") {
              loseApproval = false;
              await route.abort("connectionfailed");
              return;
            }
            const response = await route.fetch().catch(() => {
              throw Error(
                "Owned mail transport interrupted before a response was available.",
              );
            });
            if (response.status() !== 200)
              throw Error(
                "Owned mail approval did not succeed " + response.status(),
              );
            if (loseApproval) {
              loseApproval = false;
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
      await page.goto(h.env.APP_ORIGIN + "/admin/events");
      await page
        .getByRole("row")
        .filter({ hasText: event.title })
        .getByRole("button", { name: "Attendance", exact: true })
        .click();
      async function prepareMail(suffix) {
        await page
          .getByRole("button", {
            name: "Email registered attendees",
            exact: true,
          })
          .click();
        await page
          .getByLabel(/^Subject/)
          .fill("Fictional mail " + suffix + " " + marker);
        await page
          .getByLabel(/^Message/)
          .fill("Fictional private message " + "LongContext".repeat(30));
        await page
          .getByRole("button", { name: "Review recipients and message" })
          .click();
        await expect(
          page.getByRole("heading", { name: "Review email to 1 attendees" }),
        ).toBeVisible();
        await page
          .getByText("Inspect all 1 recipient addresses", { exact: true })
          .click();
        await expect(
          page.getByRole("listitem").filter({ hasText: recipient }),
        ).toBeVisible();
        await page.getByLabel(/^Current password/).fill(password);
        await page.getByLabel(/^Type SEND 1/).fill("SEND 1");
      }
      async function mailCount() {
        return checked(
          await h.db
            .from("event_messages")
            .select("id")
            .eq("event_id", event.id),
        ).length;
      }
      const before = await mailCount();
      await prepareMail("accepted");
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
            },
          })
        ).violations.map((row) => row.id),
      );
      check(
        !violations.length,
        "populated exact-audience/message approval passes measured axe" +
          label +
          (violations.length ? ": " + violations.join(",") : ""),
      );
      await page.screenshot({
        path: new URL("mail-review-" + viewport.width + ".png", output)
          .pathname,
        animations: "disabled",
        mask: [page.getByLabel(/^Current password/)],
      });
      await page.getByRole("button", { name: "Queue 1 messages" }).click();
      await expect(
        page.getByRole("button", { name: "Retry original email approval" }),
      ).toBeDisabled();
      await expect(page.getByLabel(/^Fresh current password/)).toHaveValue("");
      checked(
        await h.db
          .from("event_mail_reviews")
          .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
          .eq("id", lastReview)
          .eq("actor_id", actor)
          .eq("event_id", event.id),
      );
      await page
        .getByRole("button", { name: "Review your queued event messages" })
        .click();
      await expect(
        page.getByRole("region", {
          name: "Your queued event messages",
          exact: true,
        }),
      ).toContainText("Approval queued");
      check(
        approvals.filter((row) => row.mode === "accepted").length === 1,
        "private current-sender message history is available during uncertain approval without another POST" +
          label,
      );
      await page
        .getByRole("button", { name: "Hide queued message history" })
        .click();
      await page
        .getByRole("button", { name: "Recheck saved email approval" })
        .click();
      await expect(
        page.getByText(/1 audience-bound messages are queued/),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Review email to 1 attendees" }),
      ).toHaveCount(0);
      check(
        approvals.filter((row) => row.mode === "accepted").length === 1 &&
          (await mailCount()) === before + 1,
        "lost accepted approval reconciles its receipt after review expiry with no second approval POST" +
          label,
      );
      mode = "not-accepted";
      loseApproval = true;
      await prepareMail("not-accepted");
      await page.getByRole("button", { name: "Queue 1 messages" }).click();
      await expect(
        page.getByRole("button", { name: "Retry original email approval" }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "Recheck saved email approval" })
        .click();
      await expect(
        page.getByText(/exact saved audience review remains ready/),
      ).toBeVisible();
      check(
        (await mailCount()) === before + 1 &&
          approvals.filter((row) => row.mode === "not-accepted").length === 1,
        "read-only recheck of an unaccepted approval does not queue a message" +
          label,
      );
      await page.getByLabel(/^Fresh current password/).fill(password);
      await page
        .getByRole("button", { name: "Retry original email approval" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Review email to 1 attendees" }),
      ).toHaveCount(0);
      await expect(
        page.getByText(/1 audience-bound messages are queued/),
      ).toBeVisible();
      const attempts = approvals.filter((row) => row.mode === "not-accepted");
      check(
        attempts.length === 2 &&
          attempts[0].key === attempts[1].key &&
          attempts[0].fingerprint === attempts[1].fingerprint &&
          (await mailCount()) === before + 2,
        "fresh-proof explicit retry uses the identical intent/key and queues one message" +
          label,
      );
      mode = "denied";
      loseApproval = true;
      await prepareMail("denied");
      await page.getByRole("button", { name: "Queue 1 messages" }).click();
      await expect(
        page.getByRole("button", { name: "Recheck saved email approval" }),
      ).toBeVisible();
      denyRecovery = true;
      await page
        .getByRole("button", { name: "Recheck saved email approval" })
        .click();
      await expect(
        page.getByRole("button", { name: "Recheck event email access" }),
      ).toBeFocused();
      await expect(
        page.getByText("Inspect all 1 recipient addresses", { exact: true }),
      ).toHaveCount(0);
      denyRecovery = false;
      await page
        .getByRole("button", { name: "Recheck event email access" })
        .click();
      await expect(page.getByLabel(/^Subject/)).toHaveValue("");
      check(
        (await mailCount()) === before + 2,
        "denied approval lookup clears recipients/content/proof before actual access recheck without another message" +
          label,
      );
      check(
        !errors.length &&
          !forbidden.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "mail recovery has no script error, extra mutation, external request or page overflow" +
          label,
      );
    } finally {
      await context.unrouteAll({ behavior: "wait" });
      await context.close();
    }
  }
  const messages = checked(
      await h.db.from("event_messages").select("id").eq("event_id", event.id),
    ),
    ids = messages.map((row) => row.id);
  check(
    messages.length === 4 &&
      checked(
        await h.db
          .from("delivery_jobs")
          .select("id")
          .eq("kind", "event_message")
          .in("payload->>messageId", ids),
      ).length === 4,
    "complete probe creates four intended messages and four owned pending jobs with no delivery worker",
  );
  completed = true;
} finally {
  await browser?.close();
  if (created) {
    const owned = checked(
      await h.db.from("events").select("id,revision").eq("created_by", actor),
    );
    for (const row of owned) {
      const messages = checked(
        await h.db.from("event_messages").select("id").eq("event_id", row.id),
      );
      for (const message of messages)
        checked(
          await h.db
            .from("delivery_jobs")
            .update({ state: "dead", secret_payload: null })
            .contains("payload", { messageId: message.id }),
        );
      checked(
        await h.db
          .from("event_mail_reviews")
          .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
          .eq("event_id", row.id)
          .eq("actor_id", actor),
      );
      checked(
        await h.db
          .from("event_attendance")
          .update({ deleted_at: new Date().toISOString() })
          .eq("event_id", row.id),
      );
      data(
        await h.call("/admin/events/" + row.id, {
          method: "DELETE",
          body: { revision: row.revision, event: {} },
        }),
      );
    }
    checked(
      await h.db
        .from("admin_users")
        .update({
          is_active: false,
          deleted_at: new Date().toISOString(),
          password_hash: await hashSecret(
            "Retired-fictional-proof-" + randomUUID(),
          ),
        })
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
    new URL("../.docs/phase0/local-event-mail-recovery.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and desktop/mobile Chromium event-mail recovery. Lost accepted approvals reconciled by GET even after owned review expiry; unaccepted requests rechecked read-only then explicitly retried with fresh proof/identical intent. Controlled denied lookup clears private fields. Only fresh owned fictional accounts/event/registration/reviews/messages/jobs. Sender/scheduler preflight; no worker/provider send. Owned jobs marked dead/secrets cleared, reviews expired, registration soft-deleted/events archived/accounts disabled with credential generation retired/sessions revoked. Immutable fictional message audit retained. Existing chapter/production records untouched. Captures masked/private; no credentials or response bodies retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
