import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  uuid,
  text,
  parse,
  queryValues,
  idempotency,
  databaseResult as checked,
} from "./lib/validation.mjs";
import { riskHash, tokenHash, verifySecret } from "./lib/security.mjs";
import {
  directCreate,
  directReply,
  directEdit,
  directThreadAction,
  directReview,
} from "../shared/direct-messages.mjs";
const cursorSchema = {
  before: z.string().datetime({ offset: true }).optional(),
  beforeId: uuid.optional(),
};
export async function directMessageRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/communications\/messages(?:\/([^/]+))?(?:\/(history|items))?(?:\/([^/]+))?$/,
    );
  if (!match) return false;
  allowMethod(request, response, match[3] ? ["POST"] : ["GET", "POST"]);
  if (match[3] && match[2] !== "items")
    throw new ApiError(404, "NOT_FOUND", "This endpoint was not found.");
  const session = await requireSession(request, store, config),
    actor = session.user;
  const reply = (data) => {
    sendJson(response, 200, data, requestId);
    return true;
  };
  async function quota(scope, limit, seconds = 60) {
    const result = await store.rateLimit(
      scope,
      riskHash(actor.id, config.riskSecret),
      limit,
      seconds,
    );
    if (!result.allowed) {
      response.setHeader("Retry-After", String(result.retryAfter));
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Please wait before trying again.",
      );
    }
  }
  const scope = { p_actor: actor.id, p_session: session.sessionId };
  if (match[1] === "review" && !match[2] && !match[3]) {
    if (actor.role !== "super_admin")
      throw new ApiError(403, "FORBIDDEN", "Message review is restricted.");
    if (request.method === "GET")
      return reply(checked(await db.rpc("direct_review_state", scope)));
    await requireCsrf(request, session, store);
    const body = await jsonBody(request, directReview, 4096);
    let verified = null;
    if (body.action === "start") {
      await quota("messages.review", 5, 900);
      const account = await store.accountByEmail(actor.email);
      if (!(await verifySecret(body.currentPassword, account?.password_hash)))
        throw new ApiError(
          403,
          "PASSWORD_REQUIRED",
          "Confirm your current password.",
        );
      verified = account.password_hash;
    }
    return reply(
      checked(
        await db.rpc("mutate_direct_review", {
          ...scope,
          p_action: body.action,
          p_verified_hash: verified,
          p_reason: body.reason || null,
          p_request_id: requestId,
        }),
      ),
    );
  }
  const id = match[1] ? parse(uuid, match[1]) : null,
    itemId = match[3] ? parse(uuid, match[3]) : null;
  async function auditReview(thread = null) {
    const inserted = await db
      .from("admin_actions")
      .insert({
        actor_id: actor.id,
        action: thread ? "messages.review_read" : "messages.review_list",
        target_type: "direct_thread",
        target_id: thread,
        request_id: requestId,
      });
    checked(inserted);
  }
  if (request.method === "GET") {
    await quota("messages.read", 240);
    if (!id) {
      const q = queryValues(
        url.searchParams,
        z
          .object({
            ...cursorSchema,
            q: text(100).default(""),
            scope: z.enum(["own", "review"]).default("own"),
            archived: z.enum(["0", "1"]).default("0"),
          })
          .strict()
          .refine((v) => !!v.before === !!v.beforeId),
      );
      const result = checked(
        await db.rpc("list_direct_threads", {
          ...scope,
          p_query: q.q,
          p_scope: q.scope,
          p_archived: q.archived === "1",
          p_before: q.before || null,
          p_before_id: q.beforeId || null,
        }),
      );
      if (q.scope === "review") await auditReview();
      const last = result.items.at(-1);
      return reply({
        ...result,
        actorId: actor.id,
        canReview: actor.role === "super_admin",
        nextCursor:
          result.items.length === 30
            ? { before: last.updated_at, beforeId: last.id }
            : null,
      });
    }
    if (match[2] === "items")
      throw new ApiError(
        405,
        "METHOD_NOT_ALLOWED",
        "Use the thread history endpoint.",
      );
    const record = checked(
      await db.rpc("direct_thread_projection", { ...scope, p_thread: id }),
    );
    if (!record)
      throw new ApiError(404, "NOT_FOUND", "This conversation was not found.");
    if (!record.participant) await auditReview(id);
    if (match[2] === "history") {
      const q = queryValues(
        url.searchParams,
        z
          .object(cursorSchema)
          .strict()
          .refine((v) => !!v.before === !!v.beforeId),
      );
      const result = checked(
        await db.rpc("list_direct_messages", {
          ...scope,
          p_thread: id,
          p_before: q.before || null,
          p_before_id: q.beforeId || null,
        }),
      );
      const first = result.items[0];
      return reply({
        ...result,
        nextCursor:
          result.items.length === 50
            ? { before: first.created_at, beforeId: first.id }
            : null,
      });
    }
    queryValues(url.searchParams, z.object({}).strict());
    return reply({ record });
  }
  await requireCsrf(request, session, store);
  await quota("messages.write", 90);
  const key = idempotency(request),
    body = await jsonBody(
      request,
      itemId
        ? directEdit
        : match[2] === "items"
          ? directReply
          : id
            ? directThreadAction
            : directCreate,
      65536,
    );
  if (!id || match[2] === "items") {
    await quota("messages.send", 20);
    await quota("messages.send.daily", 200, 86400);
  }
  if (match[2] === "history")
    throw new ApiError(
      405,
      "METHOD_NOT_ALLOWED",
      "Use the conversation reply endpoint.",
    );
  const action = !id
    ? "create"
    : itemId
      ? body.action === "restore"
        ? "restore_message"
        : body.action
      : match[2] === "items"
        ? "reply"
        : body.action;
  return reply(
    checked(
      await db.rpc("mutate_direct_message", {
        ...scope,
        p_thread: id,
        p_id: itemId,
        p_action: action,
        p_revision: body.revision || null,
        p_document: body,
        p_key_hash: tokenHash(key),
        p_request_hash: tokenHash(JSON.stringify(body)),
        p_request_id: requestId,
      }),
    ),
  );
}
