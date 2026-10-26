import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
const { db, call, env } = await localHttp(),
  suffix = randomUUID().slice(0, 8),
  prefix = "Fictional inventory " + suffix,
  tests = [],
  attendees = [],
  ids = [];
const checked = (result) => {
  if (result.error) throw Error("Fixture database: " + result.error.code);
  return result.data;
};
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
const read = async (path) => {
  const r = await call(path, { anonymous: true });
  if (r.status !== 200)
    throw Error("Public inventory read failed: " + r.status);
  return r.json.data;
};
const stamp = (hours) => new Date(Date.now() + hours * 3600000).toISOString();
const event = (key, hours, changes = {}) => ({
  id: randomUUID(),
  title: `${prefix} ${key}`,
  slug: `fictional-inventory-${suffix}-${key}`,
  description: "Fictional read-path verification, not a chapter announcement.",
  short_description: "Local verification only; illustrative event photograph.",
  start_at: stamp(hours),
  timezone: "America/Los_Angeles",
  location: "Fictional verification venue",
  image_url: "/assets/event-workshop.jpg",
  publication_status: "published",
  registration_type: "internal",
  registration_enabled: true,
  max_participants: 10,
  external_attendees: 0,
  type: "Workshop",
  level: "beginner",
  ...changes,
});
const rows = {
  closed: event("closed", 1, { registration_enabled: false }),
  external: event("external-full", 2, {
    max_participants: 1,
    external_attendees: 1,
  }),
  soon: event("open-soon", 3),
  later: event("open-later", 4),
  internal: event("internal-full", 5, { max_participants: 1 }),
  removed: event("removed-attendance", 6, { max_participants: 1 }),
  pacific: event("timezone", 7, {
    start_at: "2030-01-01T01:30:00Z",
    end_at: "2030-01-01T03:30:00Z",
  }),
  draft: event("private-draft", 8, { publication_status: "draft" }),
  archived: event("archived", 9, { publication_status: "archived" }),
  ended: event("ended", -48, { end_at: stamp(-24) }),
};
let seeded = false;
if (process.argv.includes("--hold-for-browser") && !process.stdin.isTTY)
  throw Error("Browser review requires an interactive terminal.");
try {
  checked(await db.from("events").insert(Object.values(rows)));
  seeded = true;
  ids.push(...Object.values(rows).map((row) => row.id));
  for (const [index, key] of ["internal", "removed"].entries()) {
    const row = {
      id: randomUUID(),
      event_id: rows[key].id,
      attendee_name: "Fictional inventory participant",
      attendee_email: `inventory-${suffix}-${index}@example.test`,
      idempotency_key: createHash("sha256").update(randomUUID()).digest("hex"),
      request_hash: createHash("sha256").update(randomUUID()).digest("hex"),
      ...(key === "removed" ? { deleted_at: new Date().toISOString() } : {}),
    };
    checked(await db.from("event_attendance").insert(row));
    attendees.push(row.id);
  }
  const query = `/events?q=${encodeURIComponent(prefix)}&status=all&sort=availability&pageSize=2`,
    pages = await Promise.all(
      [1, 2, 3, 4].map((page) => read(query + "&page=" + page)),
    ),
    items = pages.flatMap((page) => page.items);
  check(
    pages.every((page) => page.total === 8 && page.items.length === 2),
    "published event filters and exact totals apply before availability pagination",
  );
  check(
    pages[0].items.map((row) => row.id).join() ===
      [rows.soon.id, rows.later.id].join(),
    "open events sort before earlier full or closed events on the first page",
  );
  check(
    pages[1].items.map((row) => row.id).join() ===
      [rows.removed.id, rows.pacific.id].join(),
    "derived capacity sorting is stable across subsequent pages",
  );
  check(
    new Set(items.map((row) => row.id)).size === 8 &&
      !items.some((row) => [rows.draft.id, rows.archived.id].includes(row.id)),
    "private lifecycle records remain absent without duplicate or missing public results",
  );
  const state = (key) =>
    items.find((row) => row.id === rows[key].id)?.registration_state;
  check(
    state("external") === "full" && state("internal") === "full",
    "both external totals and committed internal attendance determine full status",
  );
  check(
    state("removed") === "open" &&
      state("closed") === "closed" &&
      state("ended") === "ended",
    "removed attendance, disabled registration and ended events retain distinct correct states",
  );
  check(
    !JSON.stringify(items).match(
      /"(?:registration_priority|attendee_email|attendee_name|external_attendees|created_by|updated_by|team_id)":/,
    ),
    "public inventory omits ordering internals, participant identity and private ownership fields",
  );
  const detail = await call("/events/" + rows.internal.slug, {
    anonymous: true,
  });
  check(
    detail.status === 200 &&
      detail.json.data.event.registration_state === "full",
    "event detail shares the same authoritative availability projection",
  );
  checked(
    await db
      .from("event_attendance")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", attendees[0]),
  );
  const conditional = await fetch(
    env.APP_ORIGIN + "/api/v1/events/" + rows.internal.slug,
    {
      headers: { "If-None-Match": detail.headers.get("etag") },
      signal: AbortSignal.timeout(15000),
    },
  );
  const updated = await conditional.json();
  check(
    conditional.status === 200 &&
      updated.data.event.registration_state === "open",
    "capacity changes produce fresh detail data instead of an obsolete conditional 304",
  );
  const timezone = await read("/events/" + rows.pacific.slug);
  check(
    timezone.event.timezone === "America/Los_Angeles" &&
      timezone.event.start_at.startsWith("2030-01-01T01:30:00"),
    "public event data retains the chosen timezone and original UTC instant",
  );
  if (process.argv.includes("--hold-for-browser")) {
    console.info(
      "BROWSER_EVENTS " +
        env.APP_ORIGIN +
        "/events?q=" +
        encodeURIComponent(prefix) +
        "&sort=availability&status=all",
    );
    console.info(
      "BROWSER_DETAIL " + env.APP_ORIGIN + "/events/" + rows.pacific.slug,
    );
    console.info(
      "Type done to recoverably archive this invocation's exact fictional fixtures.",
    );
    const input = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    for await (const line of input)
      if (line.trim() === "done") {
        input.close();
        break;
      }
  }
} finally {
  if (attendees.length)
    checked(
      await db
        .from("event_attendance")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", attendees),
    );
  if (seeded)
    checked(
      await db
        .from("events")
        .update({ publication_status: "archived", registration_enabled: false })
        .in("id", ids),
    );
}
await writeFile(
  new URL("../.docs/phase0/local-event-inventory.json", import.meta.url),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: "Actual dedicated loopback read-path fixtures. Does not certify admin publication, hosted cache, device or visual acceptance. Only invocation-owned events/attendance were changed and recoverably archived; no registration email or third-party content was created.",
      tests,
    },
    null,
    2,
  ) + "\n",
);
console.info(
  "Archived the exact fictional inventory fixtures; unrelated records untouched.",
);
