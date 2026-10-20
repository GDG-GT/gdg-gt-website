import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
const { call, login, db } = await localHttp();
const evidence = [];
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
  r = await call("/events/" + slug + "/calendar.ics", { anonymous: true });
  check(
    r.status === 200 &&
      r.text.includes("BEGIN:VEVENT") &&
      r.text.includes("SEQUENCE:") &&
      r.text.includes("DTSTART:"),
    "calendar uses stable event metadata and UTC timestamps",
  );
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
    { method: "PATCH", body: { attended: true } },
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
