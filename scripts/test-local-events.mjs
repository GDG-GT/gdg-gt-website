import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
const { call, login, db, env } = await localHttp();
const evidence = [];
if (process.argv.includes("--hold-for-browser") && !process.stdin.isTTY)
  throw Error("Browser review requires an interactive terminal.");
const check = (value, name) => {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
};
await login();
let event;
const unique = randomUUID().slice(0, 8),
  slug = "development-event-" + unique;
try {
  let r = await call("/admin/events", { anonymous: true });
  check(r.status === 401, "protected event list rejects anonymous callers");
  r = await call("/admin/events", {
    method: "POST",
    body: {
      event: {
        title: "Development test " + unique,
        slug,
        description:
          "Fictional integration test event. Not a chapter announcement.",
        start_at: new Date(Date.now() + 86400000 * 4).toISOString(),
        location: "Development fixture",
        max_participants: 1,
        registration_type: "both",
        registration_url: "https://example.org/registration",
        event_link: "https://example.org/event",
      },
    },
  });
  check(
    r.status === 200 && r.json.data.event.publication_status === "draft",
    "admin creates a draft event",
  );
  event = r.json.data.event;
  r = await call("/events/" + slug, { anonymous: true });
  check(r.status === 404, "draft detail is concealed from public API");
  r = await call("/admin/events/" + event.id, {
    method: "PATCH",
    body: { revision: event.revision, event: { created_by: randomUUID() } },
  });
  check(r.status === 400, "event mutations reject client-supplied ownership");
  r = await call("/admin/events/" + event.id + "/publish", {
    method: "POST",
    body: { revision: event.revision, event: {} },
  });
  check(r.status === 200, "authorized publication succeeds");
  event = r.json.data.event;
  r = await call("/events/" + slug, { anonymous: true });
  check(
    r.status === 200 &&
      r.json.data.event.registration_state === "open" &&
      !JSON.stringify(r.json).includes("created_by"),
    "published detail is a safe public projection",
  );
  const etag = r.headers.get("etag");
  check(
    !!etag && r.headers.get("cache-control").includes("s-maxage"),
    "public detail supplies ETag and short edge caching",
  );
  const initialStart = event.start_at;
  r = await call("/admin/events/" + event.id, {
    method: "PATCH",
    body: {
      revision: event.revision,
      event: { previous_start_at: "2000-01-01T00:00:00Z" },
    },
  });
  check(r.status === 400, "client cannot forge schedule history");
  r = await call("/admin/events/" + event.id, {
    method: "PATCH",
    body: {
      revision: event.revision,
      event: {
        start_at: new Date(Date.parse(initialStart) + 86400000).toISOString(),
        end_at: new Date(Date.parse(initialStart) + 93600000).toISOString(),
      },
    },
  });
  check(
    r.status === 200 &&
      Date.parse(r.json.data.event.previous_start_at) ===
        Date.parse(initialStart),
    "rescheduling returns the trigger-derived committed previous date",
  );
  event = r.json.data.event;
  r = await call("/events/" + slug, { anonymous: true });
  check(
    r.status === 200 &&
      Date.parse(r.json.data.event.previous_start_at) ===
        Date.parse(initialStart),
    "public projection exposes factual reschedule history",
  );
  const document = await fetch(env.APP_ORIGIN + "/events/" + slug, {
    headers: { Accept: "text/html" },
    signal: AbortSignal.timeout(15000),
  });
  const html = await document.text();
  check(
    document.status === 200 &&
      html.includes('"eventStatus":"https://schema.org/EventRescheduled"') &&
      html.includes('"previousStartDate":'),
    "raw crawler document marks the published event as rescheduled",
  );
  r = await call("/events/" + slug + "/calendar.ics", { anonymous: true });
  check(
    r.status === 200 &&
      r.text.includes("BEGIN:VEVENT") &&
      r.text.includes("SEQUENCE:") &&
      r.text.includes("DTSTART:"),
    "calendar uses stable event metadata and UTC timestamps",
  );
  check(
    r.text.includes("STATUS:CONFIRMED") &&
      r.text.includes("SEQUENCE:" + event.revision),
    "rescheduled calendar retains identity and its updated sequence",
  );
  if (process.argv.includes("--hold-for-browser")) {
    console.info("Browser fixture: " + env.APP_ORIGIN + "/events/" + slug);
    console.info(
      "Type done to continue registration/cancellation checks and archive this exact fixture.",
    );
    const terminal = createInterface({ input: process.stdin });
    await new Promise((resolve) => {
      terminal.on("line", (line) => {
        if (line.trim() === "done") {
          terminal.close();
          resolve();
        }
      });
      terminal.on("close", resolve);
    });
  }
  const body = {
      name: "Fictional Test Person",
      email: "integration-" + unique + "@example.test",
      consent: true,
      notes: "Test only",
      website: "",
    },
    key = randomUUID();
  r = await call("/events/" + slug + "/registrations", {
    anonymous: true,
    method: "POST",
    body,
  });
  check(r.status === 400, "registration requires an idempotency key");
  r = await call("/events/" + slug + "/registrations", {
    anonymous: true,
    method: "POST",
    body,
    key,
  });
  check(r.status === 200, "atomic registration commits successfully");
  const registration = r.json.data;
  r = await call("/events/" + slug + "/registrations", {
    anonymous: true,
    method: "POST",
    body,
    key,
  });
  check(
    r.status === 200 &&
      r.json.data.registrationId === registration.registrationId,
    "same idempotency key returns the same committed registration",
  );
  r = await call("/events/" + slug + "/registrations", {
    anonymous: true,
    method: "POST",
    body: { ...body, name: "Changed Person" },
    key,
  });
  check(
    r.status === 409 && r.json.error.code === "INVALID_STATE",
    "idempotency key cannot be reused with a different payload",
  );
  r = await call("/events/" + slug + "/registrations", {
    anonymous: true,
    method: "POST",
    body,
    key: randomUUID(),
  });
  check(
    r.status === 409 && r.json.error.code === "DUPLICATE",
    "normalized duplicate email is rejected",
  );
  r = await call("/events/" + slug + "/registrations", {
    anonymous: true,
    method: "POST",
    body: { ...body, email: "another-" + unique + "@example.test" },
    key: randomUUID(),
  });
  check(
    r.status === 409 && r.json.error.code === "EVENT_FULL",
    "capacity is enforced by the database",
  );
  r = await call("/admin/events/" + event.id + "/attendees");
  check(
    r.status === 200 && r.json.data.items.length === 1,
    "authorized attendee listing reads committed registrations",
  );
  r = await call(
    "/admin/events/" + event.id + "/attendees/" + registration.registrationId,
    {
      method: "PATCH",
      body: { attended: true, updatedAt: r.json.data.items[0].updated_at },
    },
  );
  check(r.status === 200, "check-in succeeds through protected API");
  r = await call("/admin/events/" + event.id, {
    method: "PATCH",
    body: { revision: event.revision, event: { slug: slug + "-renamed" } },
  });
  check(r.status === 200, "event slug can be renamed");
  event = r.json.data.event;
  r = await call("/events/" + slug, { anonymous: true, redirect: "manual" });
  check(
    r.status === 308 && r.headers.get("location").endsWith(slug + "-renamed"),
    "old public slug redirects without exposing drafts",
  );
  r = await call("/admin/events/" + event.id, {
    method: "PATCH",
    body: { revision: 1, event: { title: "Stale update" } },
  });
  check(
    r.status === 409 && r.json.error.code === "CONFLICT",
    "stale edits cannot silently overwrite newer revisions",
  );
  const jobs = await db
    .from("delivery_jobs")
    .select("id")
    .eq(
      "deduplication_key",
      "event-confirmation:" + registration.registrationId,
    );
  check(
    !jobs.error && jobs.data.length === 1,
    "one confirmation job exists after repeated registration",
  );
  r = await call("/admin/events/" + event.id + "/cancel", {
    method: "POST",
    body: { revision: event.revision, event: {} },
  });
  check(
    r.status === 200 && r.json.data.event.publication_status === "cancelled",
    "cancellation disables the published registration lifecycle",
  );
  event = r.json.data.event;
  r = await call("/events/" + event.slug, { anonymous: true });
  check(
    r.status === 404,
    "cancelled event detail remains concealed under the published-only rule",
  );
  const cancelledDocument = await fetch(
    env.APP_ORIGIN + "/events/" + event.slug,
    { headers: { Accept: "text/html" }, signal: AbortSignal.timeout(15000) },
  );
  check(
    cancelledDocument.status === 404 &&
      !(await cancelledDocument.text()).includes('"@type":"Event"'),
    "cancelled raw document cannot advertise a scheduled event",
  );
  r = await call("/events/" + event.slug + "/registrations", {
    anonymous: true,
    method: "POST",
    body: { ...body, email: "cancelled-" + unique + "@example.test" },
    key: randomUUID(),
  });
  check(r.status === 404, "cancelled event rejects a fresh registration");
} finally {
  if (event) {
    const r = await call("/admin/events/" + event.id, {
      method: "DELETE",
      body: { revision: event.revision, event: {} },
    });
    check(
      r.status === 200,
      "test fixture archives without destroying registrations",
    );
  }
  await call("/auth/session", { method: "DELETE" });
}
await writeFile(
  new URL("../.docs/phase0/local-events-integration.json", import.meta.url),
  JSON.stringify(
    {
      note: "Real local HTTP/PostgreSQL tests. Fictional event remains archived with its audited test registration; no provider email sent.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
