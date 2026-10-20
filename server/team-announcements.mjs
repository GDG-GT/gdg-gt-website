import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  uuid,
  text,
  queryValues,
} from "./lib/validation.mjs";
import { riskHash } from "./lib/security.mjs";
export const announcementRecord = z
  .object({
    title: text(200, 2),
    message: text(10000, 2),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    pinned: z.boolean().default(false),
    scheduledFor: z.string().datetime().nullable().default(null),
    expiresAt: z.string().datetime().nullable().default(null),
  })
  .strict()
  .refine(
    (v) =>
      !v.scheduledFor ||
      !v.expiresAt ||
      new Date(v.expiresAt) > new Date(v.scheduledFor),
    "Expiry must follow the scheduled publication time.",
  );
const create = z.object({ record: announcementRecord }).strict(),
  update = z
    .object({
      revision: z.number().int().positive(),
      record: announcementRecord,
    })
    .strict();
const action = z.discriminatedUnion("action", [
  z
    .object({
      action: z.enum(["publish", "unpublish", "archive", "restore"]),
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal("pin"),
      revision: z.number().int().positive(),
      pinned: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal("read") }).strict(),
]);
export async function teamAnnouncementRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/teams\/([^/]+)\/announcements(?:\/([^/]+))?$/,
    );
  if (!match) return false;
  allowMethod(
    request,
    response,
    match[2] ? ["POST", "PATCH"] : ["GET", "POST"],
  );
  const team = parse(uuid, match[1]),
    id = match[2] ? parse(uuid, match[2]) : null,
    session = await requireSession(request, store, config);
  if (request.method === "GET") {
    const q = queryValues(
      url.searchParams,
      z
        .object({
          page: z.coerce.number().int().min(1).max(10000).default(1),
          state: z
            .enum(["current", "drafts", "published", "archived"])
            .default("current"),
        })
        .strict(),
    );
    const result = checked(
      await db.rpc("list_team_announcements", {
        p_actor: session.user.id,
        p_team: team,
        p_page: q.page,
        p_state: q.state,
      }),
    );
    sendJson(response, 200, result, requestId);
    return true;
  }
  await requireCsrf(request, session, store);
  const quota = await store.rateLimit(
    "teams.announcements",
    riskHash(session.user.id, config.riskSecret),
    100,
    900,
  );
  if (!quota.allowed) {
    response.setHeader("Retry-After", String(quota.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Please wait before trying again.");
  }
  const body = await jsonBody(
    request,
    !id ? create : request.method === "PATCH" ? update : action,
    32768,
  );
  const result = checked(
    await db.rpc("mutate_team_announcement", {
      p_actor: session.user.id,
      p_session: session.sessionId,
      p_team: team,
      p_id: id,
      p_action: !id
        ? "create"
        : request.method === "PATCH"
          ? "update"
          : body.action,
      p_revision: body.revision ?? null,
      p_document: body.record || { pinned: body.pinned },
      p_request_id: requestId,
    }),
  );
  sendJson(response, 200, result, requestId);
  return true;
}
