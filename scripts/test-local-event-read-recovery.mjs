import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
const h = await localHttp(),
  other = await localHttp(),
  { db, call } = h,
  actor = randomUUID(),
  outsider = randomUUID(),
  attendee = randomUUID(),
  password = "Fictional-event-reads-" + randomUUID(),
  marker = actor.slice(0, 8),
  title = "Fictional private read event " + marker,
  slug = "fictional-private-read-" + marker,
  output = new URL("../artifacts/browser/live-event-reads/", import.meta.url),
  tests = [];
let created = false,
  formEvent,
  browser,
  completed = false;
const checked = (value) => {
  if (value.error)
    throw Error("Event fixture database error " + value.error.code);
  return value.data;
};
const data = (result) => {
  if (result.status !== 200)
    throw Error(
      "Event fixture API error " +
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
const email = (id) => "fictional-event-reads-" + id + "@example.test";
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
    await db
      .from("admin_users")
      .insert(
        [actor, outsider].map((id) => ({
          id,
          email: email(id),
          password_hash: passwordHash,
          is_active: true,
          role: id === actor ? "admin" : "team_member",
          display_name: "Fictional event read reviewer " + marker,
        })),
      ),
  );
  created = true;
  await login(h, actor);
  await login(other, outsider);
  formEvent = data(
    await call("/admin/events", {
      method: "POST",
      body: {
        event: {
          title,
          slug,
          description: "A private fictional fixture for browser read recovery.",
          short_description: "Fictional draft, never published",
          start_at: "2099-12-31T18:00:00Z",
          end_at: "2099-12-31T20:00:00Z",
          timezone: "America/New_York",
          location: "Fictional classroom",
          type: "Workshop",
          level: "beginner",
          registration_type: "internal",
          registration_enabled: true,
          max_participants: 10,
          external_attendees: 0,
          is_featured: false,
          team_id: null,
        },
      },
    }),
  ).event;
  checked(
    await db
      .from("event_attendance")
      .insert({
        id: attendee,
        event_id: formEvent.id,
        attendee_name: "Fictional private read participant " + marker,
        attendee_email: "fictional-participant-" + marker + "@example.test",
        notes: "Private fictional note",
        idempotency_key: "1".repeat(64),
        request_hash: "2".repeat(64),
      }),
  );
  const root = "/admin/events/" + formEvent.id;
  for (const path of ["/admin/events", root, root + "/attendees"])
    check(
      (await call(path, { anonymous: true })).status === 401,
      "anonymous denial for " +
        (path === "/admin/events"
          ? "event inventory"
          : path.endsWith("attendees")
            ? "event attendees"
            : "selected event"),
    );
  const inventory = await call("/admin/events"),
    detail = await call(root),
    audience = await call(root + "/attendees");
  check(
    data(inventory).items.some((row) => row.id === formEvent.id) &&
      inventory.headers.get("cache-control")?.includes("no-store"),
    "authorized uncached inventory includes the owned private draft",
  );
  check(
    data(detail).event.revision === formEvent.revision &&
      detail.headers.get("cache-control")?.includes("no-store"),
    "selected event read returns the current revision privately",
  );
  check(
    data(audience).items.length === 1 &&
      audience.json.data.items[0].id === attendee &&
      audience.headers.get("cache-control")?.includes("no-store") &&
      !/password_hash|token_hash|idempotency_key|request_hash/.test(
        audience.text,
      ),
    "attendee read exposes only the authorized uncached projection",
  );
  check(
    (await other.call(root)).status === 404 &&
      (await other.call(root + "/attendees")).status === 404,
    "unrelated team member cannot discover the private event or attendee inventory",
  );
  check(
    (await call("/events/" + slug, { anonymous: true })).status === 404,
    "the fixture remains absent from public event detail",
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
          throw Error("Owned event browser sign-in failed " + r.status());
      }
      const page = await context.newPage(),
        errors = [],
        writes = [],
        external = [];
      let failInventory = true,
        failDetail = false,
        failAudience = false;
      page.on("pageerror", (error) => errors.push(error.name));
      await page.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          path = url.pathname;
        if (url.origin !== h.env.APP_ORIGIN) {
          external.push(url.origin);
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
                  message:
                    "Realtime paused for private event read verification.",
                },
              },
            });
            return;
          }
          writes.push(request.method() + " " + path);
          await route.abort("blockedbyclient");
          return;
        }
        if (
          (failInventory && path === "/api/v1/admin/events") ||
          (failDetail && path === "/api/v1" + root) ||
          (failAudience && path === "/api/v1" + root + "/attendees")
        ) {
          await route.fulfill({
            status: 503,
            json: {
              error: {
                code: "TEMPORARILY_UNAVAILABLE",
                message: "Fictional controlled read interruption.",
              },
            },
          });
          return;
        }
        await route.continue();
      });
      const label = " at " + viewport.width + "×" + viewport.height;
      await page.goto(h.env.APP_ORIGIN + "/admin/events", {
        waitUntil: "networkidle",
      });
      await expect(
        page.getByRole("button", { name: "Retry event inventory" }),
      ).toBeVisible();
      failInventory = false;
      await page.getByRole("button", { name: "Retry event inventory" }).click();
      const eventButton = page.getByRole("button", {
        name: title,
        exact: true,
      });
      await expect(eventButton).toBeVisible();
      check(
        await page
          .locator("#workspace-content")
          .evaluate((element) => element === document.activeElement),
        "browser inventory retry recovers real private rows and restores workspace focus" +
          label,
      );
      await eventButton.click();
      await expect(
        page.getByRole("button", { name: "Save draft changes" }),
      ).toBeEnabled();
      const draftName = "Fictional unsaved local draft " + marker;
      await page.getByLabel(/^Event title/).fill(draftName);
      failDetail = true;
      await page
        .getByRole("button", { name: "Refresh selected event" })
        .click();
      await expect(
        page.getByRole("button", { name: "Retry selected event" }),
      ).toBeVisible();
      await expect(page.getByLabel(/^Event title/)).toHaveValue(draftName);
      await expect(
        page.getByRole("button", { name: "Save draft changes" }),
      ).toBeDisabled();
      failDetail = false;
      await page.getByRole("button", { name: "Retry selected event" }).click();
      await expect(
        page.getByRole("button", { name: "Save draft changes" }),
      ).toBeEnabled();
      check(
        (await page.getByLabel(/^Event title/).inputValue()) === draftName,
        "selected-detail outage/retry retains unsaved fields without a save" +
          label,
      );
      await page.getByRole("button", { name: "All events" }).click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      failAudience = true;
      const row = page
        .getByRole("row")
        .filter({
          has: page.getByRole("button", { name: title, exact: true }),
        });
      await row
        .getByRole("button", { name: "Attendance", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Retry event attendees" }),
      ).toBeVisible();
      await expect(
        page.getByText("No registrations yet", { exact: true }),
      ).toHaveCount(0);
      failAudience = false;
      await page.getByRole("button", { name: "Retry event attendees" }).click();
      await expect(
        page.getByRole("textbox", {
          name: "Notes for Fictional private read participant " + marker,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Export CSV" }),
      ).toBeVisible();
      check(
        true,
        "attendee retry recovers the real owned inventory independently" +
          label,
      );
      failAudience = true;
      await page
        .getByRole("button", { name: "Refresh event attendees" })
        .click();
      await expect(
        page.getByRole("button", { name: "Retry event attendees" }),
      ).toBeVisible();
      await expect(
        page.getByRole("textbox", {
          name: "Notes for Fictional private read participant " + marker,
        }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Export CSV" }),
      ).toBeDisabled();
      check(
        await page
          .getByRole("textbox", {
            name: "Notes for Fictional private read participant " + marker,
          })
          .isVisible(),
        "failed attendee refresh retains its timestamped snapshot with editing/export disabled" +
          label,
      );
      check(
        !errors.length &&
          !writes.length &&
          !external.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "event read workflow has no page errors, mutations, external requests or horizontal overflow" +
          label,
      );
      await page.screenshot({
        path: new URL("event-read-recovery-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
    } finally {
      await context.close();
    }
  }
  const unchanged = data(await call(root)).event;
  check(
    unchanged.revision === formEvent.revision &&
      unchanged.publication_status === "draft" &&
      unchanged.title === title,
    "all read recovery leaves the owned event revision, title and private state unchanged",
  );
  completed = true;
} finally {
  await browser?.close();
  if (formEvent) {
    const owned = checked(
      await db
        .from("events")
        .select("created_by,revision")
        .eq("id", formEvent.id)
        .single(),
    );
    if (owned.created_by !== actor)
      throw Error("Event fixture ownership changed; cleanup not confirmed.");
    data(
      await call("/admin/events/" + formEvent.id, {
        method: "DELETE",
        body: { revision: owned.revision, event: {} },
      }),
    );
    checked(
      await db
        .from("event_attendance")
        .update({ deleted_at: new Date().toISOString() })
        .eq("event_id", formEvent.id)
        .eq("id", attendee),
    );
  }
  if (created) {
    checked(
      await db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .in("id", [actor, outsider]),
    );
    checked(
      await db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .in("admin_user_id", [actor, outsider])
        .is("revoked_at", null),
    );
  }
  await writeFile(
    new URL("../.docs/phase0/local-event-read-recovery.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback HTTP/DB and desktop/mobile browser read recovery with controlled 503 interruptions. Two fresh fictional accounts, one private draft and one private registration fixture; never published/no delivery jobs queued. Browser non-read API calls/external origins blocked and realtime paused. Owned event archived/registration soft-deleted/accounts disabled/sessions revoked. Existing account/event/registration, quota, provider and production state unchanged. Captures ignored/private; no response bodies/credentials retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
