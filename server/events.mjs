import { z } from "zod";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import { requireSession, requireCsrf } from "./auth.mjs";
import {
  databaseResult as checked,
  parse,
  queryValues,
  slug,
  uuid,
  text,
  safeUrl,
  imageUrl,
  idempotency,
} from "./lib/validation.mjs";
import { riskHash, tokenHash, verifySecret } from "./lib/security.mjs";
import { createHash } from "node:crypto";
import { csvRow } from "./lib/csv.mjs";

const eventFields = {
  title: text(200, 2),
  slug,
  short_description: text(500),
  description: text(40000, 2),
  start_at: z.string().datetime({ offset: true }),
  end_at: z.string().datetime({ offset: true }).nullable(),
  timezone: z
    .string()
    .max(80)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
  location: text(500, 1),
  room: text(200).nullable(),
  type: text(50, 1),
  level: z.enum(["beginner", "intermediate", "advanced", "open_for_all"]),
  image_url: imageUrl,
  image_media_id: uuid.nullable(),
  event_link: safeUrl.nullable(),
  registration_url: safeUrl.nullable(),
  google_form_url: safeUrl.nullable(),
  google_event_url: safeUrl.nullable(),
  registration_type: z.enum(["internal", "external", "both"]),
  registration_enabled: z.boolean(),
  max_participants: z.number().int().min(1).max(1000000).nullable(),
  external_attendees: z.number().int().min(0).max(1000000),
  is_featured: z.boolean(),
  team_id: uuid.nullable(),
  prerequisites: text(10000).nullable(),
  what_youll_learn: text(10000).nullable(),
  what_to_bring: text(10000).nullable(),
  schedule: text(20000).nullable(),
  additional_info: text(20000).nullable(),
  contact_info: text(2000).nullable(),
};
export const eventInput = z.object(eventFields).partial().strict();
const createInput = eventInput.required({
  title: true,
  slug: true,
  description: true,
  start_at: true,
  location: true,
});
export const registrationInput = z
  .object({
    name: text(100, 2),
    email: z.string().trim().toLowerCase().email().max(255),
    notes: text(2000).optional(),
    consent: z.literal(true),
    website: z.string().max(200).default(""),
  })
  .strict();
export const eventMailReview = z
  .object({ subject: text(200, 2), message: text(10000, 10) })
  .strict();
export const eventMailApproval = z
  .object({
    reviewId: uuid,
    currentPassword: z.string().min(1).max(1024),
    confirmation: z.string().regex(/^SEND [1-9][0-9]{0,3}$/),
  })
  .strict();
const publicColumns =
  "id,title,slug,short_description,description,start_at,end_at,previous_start_at,timezone,location,room,type,level,image_url,image_media_id,event_link,registration_url,google_form_url,google_event_url,registration_type,registration_enabled,max_participants,is_featured,prerequisites,what_youll_learn,what_to_bring,schedule,additional_info,contact_info,publication_status,published_at,updated_at,created_at,revision";
const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
    q: text(100).default(""),
    type: text(50).optional(),
    level: text(30).optional(),
    status: z.enum(["upcoming", "past", "all"]).default("upcoming"),
    sort: z
      .enum(["soonest", "newest", "title", "availability"])
      .default("soonest"),
  })
  .strict();
export function calendarFile(event, origin) {
  const escape = (v) =>
    String(v || "")
      .replace(/\\/g, "\\\\")
      .replace(/[\r\n]+/g, "\\n")
      .replace(/[,;]/g, (m) => "\\" + m);
  const stamp = (v) =>
    new Date(v)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GDG at Georgia Tech//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-TIMEZONE:" + escape(event.timezone),
    "BEGIN:VEVENT",
    "UID:" + event.id + "@" + new URL(origin).hostname,
    "DTSTAMP:" + stamp(event.updated_at),
    "LAST-MODIFIED:" + stamp(event.updated_at),
    "SEQUENCE:" + event.revision,
    "STATUS:" +
      (event.publication_status === "cancelled" ? "CANCELLED" : "CONFIRMED"),
    "DTSTART:" + stamp(event.start_at),
    ...(event.end_at ? ["DTEND:" + stamp(event.end_at)] : []),
    "SUMMARY:" + escape(event.title),
    "DESCRIPTION:" + escape(event.description),
    "LOCATION:" +
      escape([event.location, event.room].filter(Boolean).join(", ")),
    "URL:" + origin + "/events/" + event.slug,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return (
    lines
      .map((line) => {
        let out = "",
          bytes = 0;
        for (const char of line) {
          const size = Buffer.byteLength(char);
          if (bytes + size > 75) {
            out += "\r\n ";
            bytes = 1;
          }
          out += char;
          bytes += size;
        }
        return out;
      })
      .join("\r\n") + "\r\n"
  );
}
export function publicJson(
  request,
  response,
  data,
  requestId,
  { revalidate = false } = {},
) {
  const etag =
    '"' + createHash("sha256").update(JSON.stringify(data)).digest("hex") + '"';
  response.setHeader("ETag", etag);
  response.setHeader(
    "Cache-Control",
    revalidate
      ? "public, max-age=0, s-maxage=0, must-revalidate"
      : "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
  );
  if (request.headers["if-none-match"] === etag) {
    response.statusCode = 304;
    response.end();
    return;
  }
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify({ data, meta: { requestId } }));
}
export async function eventRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    path = url.pathname;
  const publicMatch = path.match(
    /^\/api\/v1\/events(?:\/([^/]+)(?:\/(registrations|calendar\.ics))?)?$/,
  );
  const adminMatch = path.match(
    /^\/api\/v1\/admin\/events(?:\/([^/]+)(?:\/(publish|unpublish|cancel|duplicate|attendees|email|email-review)(?:\/([^/]+))?)?)?$/,
  );
  if (!publicMatch && !adminMatch) return false;
  const rate = async (scope, key, limit) => {
    const r = await store.rateLimit(
      scope,
      riskHash(key, config.riskSecret),
      limit,
      900,
    );
    if (!r.allowed) {
      response.setHeader("Retry-After", String(r.retryAfter));
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Please wait before trying again.",
      );
    }
  };
  if (publicMatch) {
    const [, rawSlug, operation] = publicMatch;
    const eventSlug = rawSlug ? parse(slug, rawSlug) : null;
    allowMethod(
      request,
      response,
      operation === "registrations" ? ["POST"] : ["GET"],
    );
    if (operation === "registrations") {
      await rate(
        "events.registration.ip",
        request.socket?.remoteAddress || "unknown",
        30,
      );
      const body = await jsonBody(request, registrationInput, 8192),
        key = idempotency(request);
      if (body.website)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "This submission could not be accepted.",
        );
      await rate("events.registration.email", eventSlug + ":" + body.email, 10);
      const result = checked(
        await db.rpc("register_event_atomic", {
          p_slug: eventSlug,
          p_name: body.name,
          p_email: body.email,
          p_notes: body.notes || null,
          p_consent: body.consent,
          p_key_hash: tokenHash(key),
          p_request_hash: tokenHash(
            JSON.stringify({
              name: body.name,
              email: body.email,
              notes: body.notes || "",
              consent: true,
            }),
          ),
        }),
      );
      sendJson(response, 200, result, requestId);
      return true;
    }
    if (!eventSlug) {
      const params = queryValues(url.searchParams, listSchema);
      let query = db
        .from("public_event_inventory")
        .select(publicColumns + ",registration_state", { count: "exact" })
        .eq("publication_status", "published");
      if (params.q)
        query = query.ilike(
          "title",
          "%" + params.q.replace(/[%_\\]/g, "\\$&") + "%",
        );
      if (params.type) query = query.eq("type", params.type);
      if (params.level) query = query.eq("level", params.level);
      if (params.status === "upcoming")
        query = query.gte("start_at", new Date().toISOString());
      if (params.status === "past")
        query = query.lt("start_at", new Date().toISOString());
      query = query.order(
        params.sort === "title"
          ? "title"
          : params.sort === "newest"
            ? "created_at"
            : params.sort === "availability"
              ? "registration_priority"
              : "start_at",
        { ascending: params.sort !== "newest" },
      );
      if (params.sort === "availability") query = query.order("start_at");
      query = query.order("id");
      const result = await query.range(
        (params.page - 1) * params.pageSize,
        params.page * params.pageSize - 1,
      );
      checked(result);
      publicJson(
        request,
        response,
        {
          items: result.data,
          page: params.page,
          pageSize: params.pageSize,
          total: result.count,
        },
        requestId,
      );
      return true;
    }
    let event = checked(
      await db
        .from("public_event_inventory")
        .select(publicColumns + ",registration_state")
        .eq("slug", eventSlug)
        .eq("publication_status", "published")
        .maybeSingle(),
    );
    if (!event) {
      const redirect = checked(
        await db
          .from("event_slug_redirects")
          .select("event_id")
          .eq("old_slug", eventSlug)
          .maybeSingle(),
      );
      if (redirect) {
        const next = checked(
          await db
            .from("events")
            .select("slug")
            .eq("id", redirect.event_id)
            .eq("publication_status", "published")
            .maybeSingle(),
        );
        if (next) {
          response.statusCode = 308;
          response.setHeader(
            "Location",
            "/api/v1/events/" + next.slug + (operation ? "/" + operation : ""),
          );
          response.end();
          return true;
        }
      }
      throw new ApiError(404, "NOT_FOUND", "This event was not found.");
    }
    if (operation === "calendar.ics") {
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/calendar; charset=utf-8");
      response.setHeader(
        "Content-Disposition",
        'attachment; filename="' + event.slug + '.ics"',
      );
      response.end(calendarFile(event, config.origin));
      return true;
    }
    event = {
      ...event,
      linked_forms: checked(
        await db.rpc("public_event_form_integrations", { p_event: event.id }),
      ),
    };
    const related = checked(
      await db
        .from("public_event_inventory")
        .select(publicColumns + ",registration_state")
        .eq("publication_status", "published")
        .neq("id", event.id)
        .gte("start_at", new Date().toISOString())
        .order("start_at")
        .limit(3),
    );
    publicJson(request, response, { event, related }, requestId);
    return true;
  }
  const [, rawId, operation, attendeeId] = adminMatch;
  allowMethod(
    request,
    response,
    operation === "attendees"
      ? attendeeId && attendeeId !== "export"
        ? ["PATCH", "DELETE"]
        : ["GET"]
      : operation === "email"
        ? ["GET", "POST"]
        : operation
          ? ["POST"]
          : rawId
            ? ["GET", "PATCH", "DELETE"]
            : ["GET", "POST"],
  );
  const session = await requireSession(request, store, config);
  if (request.method !== "GET") await requireCsrf(request, session, store);
  const id = rawId ? parse(uuid, rawId) : null;
  let event;
  if (id) {
    event = checked(
      await db.from("events").select("*").eq("id", id).maybeSingle(),
    );
    if (
      !event ||
      !checked(
        await db.rpc("can_operate_event", {
          p_actor: session.user.id,
          p_action: "read",
          p_team: event.team_id,
        }),
      )
    )
      throw new ApiError(404, "NOT_FOUND", "This event was not found.");
  }
  if (operation === "email" || operation === "email-review") {
    if (attendeeId)
      throw new ApiError(404, "NOT_FOUND", "This email action was not found.");
    queryValues(url.searchParams, z.object({}).strict());
    if (
      !checked(
        await db.rpc("can_event_audience", {
          p_actor: session.user.id,
          p_event: id,
          p_action: "send_email",
        }),
      )
    )
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You do not have permission to email this audience.",
      );
    if (request.method === "GET") {
      const result = await db
        .from("event_attendance")
        .select("id", { head: true, count: "exact" })
        .eq("event_id", id)
        .is("deleted_at", null);
      checked(result);
      sendJson(
        response,
        200,
        { recipientCount: result.count, maxBatch: 1000 },
        requestId,
      );
      return true;
    }
    if (operation === "email-review") {
      const body = await jsonBody(request, eventMailReview, 65536);
      await rate("events.email-review", session.user.id, 30);
      sendJson(
        response,
        200,
        checked(
          await db.rpc("review_event_mail", {
            p_actor: session.user.id,
            p_session: session.sessionId,
            p_event: id,
            p_subject: body.subject,
            p_message: body.message,
            p_request_id: requestId,
          }),
        ),
        requestId,
      );
      return true;
    }
    const body = await jsonBody(request, eventMailApproval, 8192);
    const key = idempotency(request);
    await rate("events.email", session.user.id, 10);
    const account = await store.accountByEmail(session.user.email);
    if (!(await verifySecret(body.currentPassword, account?.password_hash)))
      throw new ApiError(
        403,
        "PASSWORD_REQUIRED",
        "Confirm your current password before sending event mail.",
      );
    const result = checked(
      await db.rpc("commit_event_mail", {
        p_actor: session.user.id,
        p_session: session.sessionId,
        p_event: id,
        p_review: body.reviewId,
        p_verified_hash: account.password_hash,
        p_confirmation: body.confirmation,
        p_key_hash: tokenHash(key),
        p_request_hash: tokenHash(
          JSON.stringify({
            reviewId: body.reviewId,
            confirmation: body.confirmation,
          }),
        ),
        p_request_id: requestId,
      }),
    );
    sendJson(response, 200, result, requestId);
    return true;
  }
  if (operation === "attendees" && attendeeId === "export") {
    if (
      !checked(
        await db.rpc("can_event_audience", {
          p_actor: session.user.id,
          p_event: id,
          p_action: "export",
        }),
      )
    )
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You do not have permission to export this audience.",
      );
    const filters = queryValues(
      url.searchParams,
      z
        .object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        })
        .strict(),
    );
    const base = () => {
      let q = db
        .from("event_attendance")
        .select(
          "id,attendee_name,attendee_email,notes,attended,registration_date,check_in_time",
          { count: "exact" },
        )
        .eq("event_id", id)
        .is("deleted_at", null)
        .order("id");
      if (filters.from) q = q.gte("registration_date", filters.from);
      if (filters.to) q = q.lte("registration_date", filters.to);
      return q;
    };
    const probe = await base().limit(1);
    checked(probe);
    if (probe.count > 10000)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Narrow the date range to 10,000 registrations or fewer.",
      );
    await store.audit({
      actorId: session.user.id,
      action: "events.attendees_exported",
      targetType: "event",
      targetId: id,
      requestId,
      metadata: { filters, count: probe.count },
    });
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="event-${id}-attendees.csv"`,
    );
    response.write(
      "\uFEFF" +
        csvRow([
          "registration_id",
          "name",
          "email",
          "notes",
          "attended",
          "registered_at",
          "checked_in_at",
        ]),
    );
    for (let offset = 0; offset < probe.count; offset += 1000) {
      const rows = checked(await base().range(offset, offset + 999));
      for (const row of rows)
        response.write(
          csvRow([
            row.id,
            row.attendee_name,
            row.attendee_email,
            row.notes,
            row.attended,
            row.registration_date,
            row.check_in_time,
          ]),
        );
    }
    response.end();
    return true;
  }
  if (request.method === "GET") {
    if (operation === "attendees") {
      const p = queryValues(
        url.searchParams,
        z
          .object({
            page: z.coerce.number().int().min(1).default(1),
            pageSize: z.coerce.number().int().min(1).max(100).default(50),
          })
          .strict(),
      );
      const result = await db
        .from("event_attendance")
        .select(
          "id,event_id,attendee_name,attendee_email,notes,registration_date,attended,check_in_time,updated_at",
          { count: "exact" },
        )
        .eq("event_id", id)
        .is("deleted_at", null)
        .order("registration_date")
        .range((p.page - 1) * p.pageSize, p.page * p.pageSize - 1);
      checked(result);
      await store.audit({
        actorId: session.user.id,
        action: "events.attendees_viewed",
        targetType: "event",
        targetId: id,
        requestId,
      });
      sendJson(
        response,
        200,
        { items: result.data, total: result.count, ...p },
        requestId,
      );
      return true;
    }
    if (id) {
      sendJson(response, 200, { event }, requestId);
      return true;
    }
    const p = queryValues(
      url.searchParams,
      z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(50),
        })
        .strict(),
    );
    let query = db
      .from("events")
      .select("*", { count: "exact" })
      .order("start_at", { ascending: false });
    if (!["admin", "super_admin"].includes(session.user.role)) {
      const memberships = await store.memberships(session.user.id),
        allowed = [];
      for (const membership of memberships)
        if (
          checked(
            await db.rpc("can_operate_event", {
              p_actor: session.user.id,
              p_action: "read",
              p_team: membership.team_id,
            }),
          )
        )
          allowed.push(membership.team_id);
      if (!allowed.length)
        throw new ApiError(403, "FORBIDDEN", "You do not have event access.");
      query = query.in("team_id", allowed);
    }
    const result = await query.range(
      (p.page - 1) * p.pageSize,
      p.page * p.pageSize - 1,
    );
    checked(result);
    sendJson(
      response,
      200,
      { items: result.data, total: result.count, ...p },
      requestId,
    );
    return true;
  }
  if (operation === "attendees") {
    parse(uuid, attendeeId);
    const body =
      request.method === "PATCH"
        ? await jsonBody(
            request,
            z
              .object({
                attendee_name: text(100, 2),
                attendee_email: z
                  .string()
                  .trim()
                  .toLowerCase()
                  .email()
                  .max(255),
                notes: text(2000).nullable(),
                attended: z.boolean(),
              })
              .partial()
              .strict(),
          )
        : {};
    const data = checked(
      await db.rpc("mutate_attendee", {
        p_actor: session.user.id,
        p_event: id,
        p_registration: attendeeId,
        p_document: body,
        p_remove: request.method === "DELETE",
        p_request_id: requestId,
      }),
    );
    sendJson(response, 200, data, requestId);
    return true;
  }
  const body = await jsonBody(
    request,
    z
      .object({
        revision: z.number().int().positive().optional(),
        event:
          request.method === "POST" && !operation ? createInput : eventInput,
      })
      .strict(),
  );
  if (id && !body.revision)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Reload the event before saving.",
    );
  const doc = body.event;
  const start = doc.start_at || event?.start_at,
    end = doc.end_at === undefined ? event?.end_at : doc.end_at;
  if (end && new Date(end) <= new Date(start))
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "The end must be after the start.",
      { end_at: "Choose a later end time." },
    );
  const result = checked(
    await db.rpc("mutate_event", {
      p_actor: session.user.id,
      p_id: id,
      p_action:
        operation ||
        (!id ? "create" : request.method === "DELETE" ? "archive" : "update"),
      p_expected_revision: body.revision || null,
      p_document: doc,
      p_request_id: requestId,
    }),
  );
  sendJson(response, 200, { event: result }, requestId);
  return true;
}
