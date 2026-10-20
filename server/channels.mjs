import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  uuid,
  text,
  queryValues,
  idempotency,
} from "./lib/validation.mjs";
import { riskHash, tokenHash, verifySecret } from "./lib/security.mjs";
const password = z.string().min(1).max(128),
  email = z.string().trim().toLowerCase().email().max(255);
export const channelRecord = z
  .object({
    name: text(100, 2),
    description: text(2000).default(""),
    visibility: z.enum(["private", "internal", "team"]).default("private"),
    teamId: uuid.nullable().default(null),
  })
  .strict()
  .refine(
    (v) => (v.visibility === "team") === !!v.teamId,
    "Choose an owning team only for a team-scoped room.",
  );
const create = z
  .object({ currentPassword: password, record: channelRecord })
  .strict();
const update = z
  .object({
    currentPassword: password,
    revision: z.number().int().positive(),
    record: z.object({ name: text(100, 2), description: text(2000) }).strict(),
  })
  .strict();
const action = z.discriminatedUnion("action", [
  z
    .object({
      currentPassword: password,
      revision: z.number().int().positive(),
      action: z.enum(["archive", "restore"]),
      confirmation: text(100, 2),
    })
    .strict(),
  z
    .object({
      currentPassword: password,
      revision: z.number().int().positive(),
      action: z.enum(["member_add", "member_role", "member_remove"]),
      email,
      role: z.enum(["owner", "moderator", "member"]),
    })
    .strict(),
]);
export const messageRecord = z
  .object({ message: text(10000, 1), replyToId: uuid.nullable().default(null) })
  .strict();
const messageAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("edit"),
      revision: z.number().int().positive(),
      message: text(10000, 1),
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
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
function reply(response, data, requestId) {
  sendJson(response, 200, data, requestId);
  return true;
}
async function quota(
  store,
  response,
  user,
  config,
  scope,
  limit,
  seconds = 900,
) {
  const r = await store.rateLimit(
    scope,
    riskHash(user, config.riskSecret),
    limit,
    seconds,
  );
  if (!r.allowed) {
    response.setHeader("Retry-After", String(r.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Please wait before trying again.");
  }
}
export async function channelRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/channels(?:\/([^/]+))?(?:\/(messages|members))?(?:\/([^/]+))?$/,
    );
  if (!match) return false;
  allowMethod(
    request,
    response,
    match[3]
      ? ["POST"]
      : match[2] === "messages"
        ? ["GET", "POST"]
        : match[2] === "members"
          ? ["GET"]
          : match[1]
            ? ["GET", "POST", "PATCH"]
            : ["GET", "POST"],
  );
  const session = await requireSession(request, store, config),
    actor = session.user;
  if (match[3] && match[2] !== "messages")
    throw new ApiError(404, "NOT_FOUND", "This endpoint was not found.");
  if (match[1] === "capabilities" && !match[2] && !match[3]) {
    allowMethod(request, response, ["GET"]);
    const memberships = await store.memberships(actor.id),
      globalCreate = ["super_admin", "admin"].includes(actor.role);
    const teams = globalCreate
      ? checked(
          await db
            .from("admin_teams")
            .select("id,name")
            .eq("is_active", true)
            .is("deleted_at", null)
            .order("name")
            .limit(100),
        )
      : memberships
          .filter(
            (m) => m.team?.is_active && ["lead", "co_lead"].includes(m.role),
          )
          .map((m) => ({ id: m.team_id, name: m.team.name }));
    return reply(
      response,
      {
        globalCreate,
        teams,
      },
      requestId,
    );
  }
  const id = match[1] ? parse(uuid, match[1]) : null,
    messageId = match[3] ? parse(uuid, match[3]) : null;
  if (request.method === "GET") {
    if (!id) {
      const q = queryValues(
        url.searchParams,
        z
          .object({
            q: text(100).default(""),
            page: z.coerce.number().int().min(1).max(10000).default(1),
            archived: z.enum(["0", "1"]).default("0"),
          })
          .strict(),
      );
      return reply(
        response,
        checked(
          await db.rpc("list_channels", {
            p_actor: actor.id,
            p_page: q.page,
            p_query: q.q,
            p_archived: q.archived === "1",
          }),
        ),
        requestId,
      );
    }
    if (
      !checked(
        await db.rpc("can_operate_channel", {
          p_actor: actor.id,
          p_channel: id,
          p_action: "read",
        }),
      )
    )
      throw new ApiError(404, "NOT_FOUND", "This channel was not found.");
    if (match[2] === "messages") {
      const q = queryValues(
        url.searchParams,
        z
          .object({
            before: z.string().datetime().optional(),
            beforeId: uuid.optional(),
            pinned: z.enum(["0", "1"]).default("0"),
          })
          .strict()
          .refine((v) => !!v.before === !!v.beforeId),
      );
      const r = checked(
        await db.rpc("list_channel_messages", {
          p_actor: actor.id,
          p_channel: id,
          p_before: q.before || null,
          p_before_id: q.beforeId || null,
          p_pinned: q.pinned === "1",
        }),
      );
      return reply(
        response,
        {
          ...r,
          nextCursor:
            r.items.length === 50
              ? { before: r.items[0].created_at, beforeId: r.items[0].id }
              : null,
        },
        requestId,
      );
    }
    const record = checked(
      await db
        .from("channels")
        .select(
          "id,name,description,visibility,team_id,is_archived,revision,created_at,updated_at",
        )
        .eq("id", id)
        .single(),
    );
    const permissions = await Promise.all(
      ["manage", "moderate", "send"].map(async (a) => [
        a,
        checked(
          await db.rpc("can_operate_channel", {
            p_actor: actor.id,
            p_channel: id,
            p_action: a,
          }),
        ),
      ]),
    );
    const actions = Object.fromEntries(permissions);
    if (match[2] === "members") {
      const q = queryValues(
        url.searchParams,
        z
          .object({
            page: z.coerce.number().int().min(1).max(10000).default(1),
          })
          .strict(),
      );
      const result = await db
        .from("channel_memberships")
        .select("admin_user_id,role,is_active,created_at", { count: "exact" })
        .eq("channel_id", id)
        .eq("is_active", true)
        .order("created_at")
        .order("admin_user_id")
        .range((q.page - 1) * 30, q.page * 30 - 1);
      const rows = checked(result);
      const users = rows.length
        ? checked(
            await db
              .from("admin_users")
              .select("id,display_name" + (actions.manage ? ",email" : ""))
              .in(
                "id",
                rows.map((m) => m.admin_user_id),
              ),
          )
        : [];
      return reply(
        response,
        {
          items: rows.map((m) => ({
            ...m,
            user: users.find((u) => u.id === m.admin_user_id),
          })),
          note: "Explicit room memberships only; internal/team rooms also use their audience scope.",
          total: result.count,
          page: q.page,
          pageSize: 30,
        },
        requestId,
      );
    }
    return reply(
      response,
      {
        record,
        actions,
        actorId: actor.id,
        canRestore:
          ["super_admin", "admin"].includes(actor.role) && record.is_archived,
      },
      requestId,
    );
  }
  await requireCsrf(request, session, store);
  if (match[2] === "messages") {
    await quota(store, response, actor.id, config, "channels.messages", 600);
    const body = await jsonBody(
        request,
        messageId ? messageAction : messageRecord,
        16384,
      ),
      key = !messageId ? idempotency(request) : null;
    const result = checked(
      await db.rpc("mutate_channel_message", {
        p_actor: actor.id,
        p_session: session.sessionId,
        p_channel: id,
        p_id: messageId,
        p_action: messageId ? body.action : "send",
        p_revision: body.revision ?? null,
        p_document: body,
        p_key_hash: key ? tokenHash(key) : null,
        p_request_hash: key ? tokenHash(JSON.stringify(body)) : null,
        p_request_id: requestId,
      }),
    );
    return reply(response, result, requestId);
  }
  if (match[2])
    throw new ApiError(
      405,
      "METHOD_NOT_ALLOWED",
      "This request method is not allowed.",
    );
  await quota(store, response, actor.id, config, "channels.administration", 30);
  const body = await jsonBody(
    request,
    !id ? create : request.method === "PATCH" ? update : action,
    8192,
  );
  if (
    id &&
    !checked(
      await db.rpc("can_operate_channel", {
        p_actor: actor.id,
        p_channel: id,
        p_action: body.action === "restore" ? "read" : "manage",
      }),
    )
  )
    throw new ApiError(404, "NOT_FOUND", "This channel was not found.");
  const account = await store.accountByEmail(actor.email);
  if (!(await verifySecret(body.currentPassword, account?.password_hash))) {
    await store.recordLoginFailure(account);
    await store.audit({
      actorId: actor.id,
      action: "channels.confirmation_failed",
      requestId,
      result: "denied",
    });
    throw new ApiError(
      403,
      "PASSWORD_CONFIRMATION_FAILED",
      "Your password could not be confirmed.",
    );
  }
  if (body.confirmation !== undefined) {
    const c = checked(
      await db.from("channels").select("name").eq("id", id).maybeSingle(),
    );
    if (!c || body.confirmation !== c.name)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Type the complete room name to confirm.",
      );
  }
  const { currentPassword, revision, action: operation, ...document } = body;
  void currentPassword;
  const result = checked(
    await db.rpc("mutate_channel", {
      p_actor: actor.id,
      p_session: session.sessionId,
      p_verified_hash: account.password_hash,
      p_id: id,
      p_action: !id
        ? "create"
        : request.method === "PATCH"
          ? "update"
          : operation,
      p_revision: revision ?? null,
      p_document: body.record || document,
      p_request_id: requestId,
    }),
  );
  return reply(response, { record: result }, requestId);
}
