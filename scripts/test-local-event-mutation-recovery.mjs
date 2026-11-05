import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const h = await localHttp(),
  other = await localHttp(),
  { db, call } = h,
  actor = randomUUID(),
  outsider = randomUUID(),
  attendee = randomUUID(),
  password = "Fictional-event-writes-" + randomUUID(),
  marker = actor.slice(0, 8),
  title = "Fictional private read event " + marker,
  slug = "fictional-private-read-" + marker,
  output = new URL("../artifacts/browser/live-event-writes/", import.meta.url),
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
async function accessibility(page, name) {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const violations = await page.evaluate(async () =>
    (
      await window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
        },
      })
    ).violations.map((violation) => violation.id),
  );
  check(
    violations.length === 0,
    name + (violations.length ? ": " + violations.join(",") : ""),
  );
}
const email = (id) => "fictional-event-writes-" + id + "@example.test";
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
    await db.from("admin_users").insert(
      [actor, outsider].map((id) => ({
        id,
        email: email(id),
        password_hash: passwordHash,
        is_active: true,
        role: id === actor ? "admin" : "team_member",
        display_name: "Fictional event write reviewer " + marker,
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
    await db.from("event_attendance").insert({
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
  const retryDocument = {
    title: "Fictional concurrent event " + marker,
    slug: "fictional-concurrent-" + marker,
    description: "Fictional private concurrent creation",
    start_at: "2099-12-31T18:00:00Z",
    location: "Fictional classroom",
  };
  check(
    (
      await call("/admin/events", {
        method: "POST",
        key: null,
        body: { event: retryDocument },
      })
    ).status === 400,
    "actual creation rejects a missing retry identity",
  );
  const createKey = randomUUID(),
    createdResults = await Promise.all(
      Array.from({ length: 10 }, () =>
        call("/admin/events", {
          method: "POST",
          key: createKey,
          body: { event: retryDocument },
        }),
      ),
    );
  const createdIds = new Set(
    createdResults.map((result) => data(result).event.id),
  );
  check(
    createdIds.size === 1,
    "ten concurrent identical create requests return one private event",
  );
  const concurrentEvent = [...createdIds][0];
  check(
    checked(
      await db
        .from("admin_actions")
        .select("id")
        .eq("target_id", concurrentEvent),
    ).length === 1,
    "concurrent creation commits only one audit",
  );
  check(
    (
      await call("/admin/events", {
        method: "POST",
        key: createKey,
        body: { event: { ...retryDocument, title: "Changed retry intent" } },
      })
    ).status === 409,
    "a reused key with changed creation intent conflicts",
  );
  const duplicateKey = randomUUID(),
    duplicates = await Promise.all(
      Array.from({ length: 10 }, () =>
        call(root + "/duplicate", {
          method: "POST",
          key: duplicateKey,
          body: { revision: formEvent.revision, event: {} },
        }),
      ),
    );
  check(
    new Set(duplicates.map((result) => data(result).event.id)).size === 1,
    "ten concurrent identical duplicate requests create one draft copy",
  );
  const attendeePath = root + "/attendees/" + attendee;
  check(
    (
      await call(attendeePath, {
        method: "PATCH",
        body: {
          notes: "Stale fictional edit",
          updatedAt: "2000-01-01T00:00:00Z",
        },
      })
    ).status === 409,
    "actual attendee mutation rejects a stale saved timestamp",
  );
  check(
    (
      await other.call(root, {
        method: "PATCH",
        body: {
          revision: formEvent.revision,
          event: { title: "Forbidden overwrite" },
        },
      })
    ).status === 404,
    "unrelated team member cannot mutate the owned private event",
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
          throw Error("Owned mutation browser sign-in failed " + r.status());
      }
      const before = data(await call(root)).event;
      const page = await context.newPage(),
        errors = [],
        writes = [],
        forbidden = [];
      let dropSave = true,
        dropAttendee = true;
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
                  message: "Realtime paused for owned mutation verification.",
                },
              },
            });
            return;
          }
          if (
            request.method() !== "PATCH" ||
            ![
              "/api/v1" + root,
              "/api/v1" + root + "/attendees/" + attendee,
            ].includes(path)
          ) {
            forbidden.push("unexpected mutation");
            await route.abort("blockedbyclient");
            return;
          }
          writes.push({
            path,
            key: request.headers()["idempotency-key"],
            body: request.postDataJSON(),
          });
          const response = await route.fetch();
          if (response.status() !== 200)
            throw Error("Owned browser mutation rejected " + response.status());
          const lost = path === "/api/v1" + root ? dropSave : dropAttendee;
          if (path === "/api/v1" + root) dropSave = false;
          else dropAttendee = false;
          if (lost) await route.abort("connectionfailed");
          else await route.fulfill({ response });
          return;
        }
        await route.continue();
      });
      const label = " at " + viewport.width + "×" + viewport.height;
      await page.goto(h.env.APP_ORIGIN + "/admin/events", {
        waitUntil: "networkidle",
      });
      await page
        .getByRole("button", { name: before.title, exact: true })
        .click();
      const save = page.getByRole("button", { name: "Save draft changes" });
      await expect(save).toBeEnabled();
      const newTitle =
        "Fictional UI saved event " + marker + " " + viewport.width;
      await page.getByLabel(/^Event title/).fill(newTitle);
      await save.click();
      const retry = page.getByRole("button", {
        name: "Retry original operation",
      });
      await expect(retry).toBeDisabled();
      await expect(page.getByLabel(/^Event title/)).toHaveValue(newTitle);
      check(
        writes.length === 1,
        "lost event-save response retains input and pauses blind writes" +
          label,
      );
      await page
        .getByRole("button", { name: "Recheck saved event data" })
        .click();
      await expect(retry).toBeEnabled();
      check(
        writes.length === 1,
        "saved-event recovery performs only reads" + label,
      );
      await retry.click();
      await expect(
        page.getByText("Event save confirmed by the server.", { exact: true }),
      ).toBeVisible();
      await expect(save).toBeEnabled();
      const after = data(await call(root)).event;
      await accessibility(
        page,
        "populated event editor passes measured axe checks" + label,
      );
      check(
        writes.length === 2 &&
          writes[0].key === writes[1].key &&
          JSON.stringify(writes[0].body) === JSON.stringify(writes[1].body) &&
          after.revision === before.revision + 1 &&
          after.title === newTitle,
        "explicit identical save replay returns one committed revision" + label,
      );
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await expect(page.getByRole("dialog")).toContainText(newTitle);
      await accessibility(
        page,
        "publication review passes measured axe checks" + label,
      );
      await page.screenshot({
        path: new URL(
          "event-publication-review-" + viewport.width + ".png",
          output,
        ).pathname,
        fullPage: true,
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Keep editing" }).click();
      await page.getByRole("button", { name: "Archive", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Confirm", exact: true }),
      ).toBeDisabled();
      await page
        .getByLabel("Type the event slug to confirm")
        .fill("wrong-target");
      await expect(
        page.getByRole("button", { name: "Confirm", exact: true }),
      ).toBeDisabled();
      await page.getByRole("button", { name: "Keep editing" }).click();
      check(
        writes.length === 2,
        "publication/archive review cancellation and wrong target send no write" +
          label,
      );
      await page.getByRole("button", { name: "All events" }).click();
      await page
        .getByRole("row")
        .filter({
          has: page.getByRole("button", { name: newTitle, exact: true }),
        })
        .getByRole("button", { name: "Attendance", exact: true })
        .click();
      const notes = page.getByRole("textbox", {
        name: "Notes for Fictional private read participant " + marker,
      });
      await expect(notes).toBeEnabled();
      await accessibility(
        page,
        "populated attendee editor passes measured axe checks" + label,
      );
      await notes.fill("Fictional edited note " + viewport.width);
      await notes.press("Tab");
      check(
        writes.length === 2,
        "editing attendee notes and leaving the field does not auto-save" +
          label,
      );
      await page.getByRole("button", { name: "All events" }).click();
      await expect(page.getByRole("dialog")).toContainText(
        "attendee input will be discarded",
      );
      await page.getByRole("button", { name: "Keep editing" }).click();
      await expect(notes).toHaveValue(
        "Fictional edited note " + viewport.width,
      );
      await page.getByText("Edit attendee", { exact: true }).click();
      await page.getByRole("button", { name: "Save attendee changes" }).click();
      await expect(retry).toBeDisabled();
      await page
        .getByRole("button", { name: "Recheck saved event data" })
        .click();
      await expect(retry).toBeEnabled();
      check(
        writes.length === 3,
        "lost attendee-save result retains input and rechecks without another write" +
          label,
      );
      await retry.click();
      await expect(
        page.getByText("Attendee update confirmed by the server.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(notes).toBeEnabled();
      check(
        writes.length === 4 &&
          writes[2].key === writes[3].key &&
          JSON.stringify(writes[2].body) === JSON.stringify(writes[3].body),
        "attendee replay retains the original timestamp and retry identity" +
          label,
      );
      await page.getByRole("button", { name: "Remove registration" }).click();
      await expect(page.getByRole("dialog")).toContainText(
        "no longer occupy a seat",
      );
      await page.getByRole("button", { name: "Keep editing" }).click();
      check(
        writes.length === 4 &&
          !errors.length &&
          !forbidden.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "reviewed event/attendee workflow has no accidental writes, page errors, external calls or overflow" +
          label,
      );
      await page.screenshot({
        path: new URL("event-mutations-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
    } finally {
      await context.close();
    }
  }
  check(
    data(await call(root)).event.publication_status === "draft",
    "all mutation recovery leaves the owned event private",
  );
  const eventAudits = checked(
    await db
      .from("admin_actions")
      .select("id")
      .eq("target_id", formEvent.id)
      .eq("action", "events.update"),
  );
  const attendeeAudits = checked(
    await db
      .from("admin_actions")
      .select("id")
      .eq("target_id", attendee)
      .eq("action", "events.attendee_updated"),
  );
  check(
    eventAudits.length === 2 && attendeeAudits.length === 2,
    "four accepted-and-lost writes each produce one audit despite replay",
  );
  completed = true;
} finally {
  await browser?.close();
  if (formEvent) {
    const owned = checked(
      await db
        .from("events")
        .select("id,created_by,revision")
        .eq("created_by", actor),
    );
    if (
      !owned.some((event) => event.id === formEvent.id) ||
      owned.some((event) => event.created_by !== actor)
    )
      throw Error("Event fixture ownership changed; cleanup not confirmed.");
    for (const event of owned)
      data(
        await call("/admin/events/" + event.id, {
          method: "DELETE",
          body: { revision: event.revision, event: {} },
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
    new URL(
      "../.docs/phase0/local-event-mutation-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback HTTP/DB and desktop/mobile browser mutation recovery with accepted-but-dropped responses and explicit identical replay. Two fresh fictional accounts, private source/concurrent-create/duplicate drafts and one private registration fixture; never published/no delivery jobs queued. Only owned event/attendee PATCH calls allowed in the browser; every other non-read/external origin blocked and realtime paused. All events created by this invocation's unique actor archived/registration soft-deleted/accounts disabled/sessions revoked. Existing account/event/registration, quota, provider and production state unchanged. Captures ignored/private; no response bodies/credentials retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
