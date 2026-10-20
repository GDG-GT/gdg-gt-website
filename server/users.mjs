import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  queryValues,
  parse,
  text,
  uuid,
} from "./lib/validation.mjs";
import { accountManagementAllowed } from "./lib/authorization.mjs";
import {
  token,
  tokenHash,
  hashSecret,
  verifySecret,
  riskHash,
  validToken,
} from "./lib/security.mjs";
import { encryptPayload } from "./lib/encryption.mjs";
const role = z.enum(["super_admin", "admin", "team_member", "blog_editor"]);
const identity = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    display_name: text(100, 1),
    role,
  })
  .strict();
const password = z.string().min(1).max(128);
const create = z
  .object({ currentPassword: password, record: identity })
  .strict();
const update = z
  .object({
    currentPassword: password,
    revision: z.number().int().positive(),
    record: identity.omit({ email: true }),
  })
  .strict();
const action = z
  .object({
    currentPassword: password,
    revision: z.number().int().positive(),
    action: z.enum([
      "activate",
      "deactivate",
      "archive",
      "restore",
      "reset",
      "revoke_sessions",
    ]),
    confirmation: z.string().max(255),
  })
  .strict();
const setup = z
  .object({
    token: z.string().refine(validToken),
    email: z.string().trim().toLowerCase().email().max(255),
    newPassword: z.string().min(14).max(128),
  })
  .strict();
const fields =
  "id,email,display_name,role,is_active,created_at,last_login_at,password_changed_at,must_change_password,locked_until,revision,deleted_at";
const listQuery = z
  .object({
    q: text(100).default(""),
    state: z
      .enum(["current", "active", "inactive", "archived"])
      .default("current"),
    role: role.optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
function reply(response, status, data, requestId) {
  sendJson(response, status, data, requestId);
  return true;
}
async function rate(store, response, scope, key, limit) {
  const r = await store.rateLimit(scope, key, limit, 900);
  if (!r.allowed) {
    response.setHeader("Retry-After", String(r.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Please wait before trying again.");
  }
}
export async function userRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    path = url.pathname;
  if (path === "/api/v1/account/setup") {
    allowMethod(request, response, ["POST"]);
    await rate(
      store,
      response,
      "account.setup.ip",
      riskHash(request.socket?.remoteAddress || "unknown", config.riskSecret),
      20,
    );
    const body = await jsonBody(request, setup, 4096);
    await rate(
      store,
      response,
      "account.setup.token",
      tokenHash(body.token),
      5,
    );
    const completed = checked(
      await db.rpc("complete_account_access", {
        p_hash: tokenHash(body.token),
        p_email: body.email,
        p_password_hash: await hashSecret(body.newPassword),
        p_request_id: requestId,
      }),
    );
    if (!completed)
      throw new ApiError(
        400,
        "ACCESS_LINK_INVALID",
        "This access link is invalid, expired, or already used. Ask a chapter administrator for a new link.",
      );
    return reply(response, 200, { completed: true }, requestId);
  }
  const match = path.match(
    /^\/api\/v1\/admin\/users(?:\/([^/]+))?(?:\/(sessions))?$/,
  );
  if (!match) return false;
  allowMethod(
    request,
    response,
    match[2] ? ["GET"] : match[1] ? ["GET", "PATCH", "POST"] : ["GET", "POST"],
  );
  const session = await requireSession(request, store, config),
    actor = session.user;
  if (!["super_admin", "admin"].includes(actor.role))
    throw new ApiError(
      403,
      "FORBIDDEN",
      "You do not have access to account management.",
    );
  const id = match[1] ? parse(uuid, match[1]) : null;
  let target;
  if (id) {
    target = checked(
      await db.from("admin_users").select(fields).eq("id", id).maybeSingle(),
    );
    if (!target)
      throw new ApiError(404, "NOT_FOUND", "This account was not found.");
    if (!accountManagementAllowed(actor, target))
      throw new ApiError(403, "FORBIDDEN", "This action is not allowed.");
  }
  if (request.method === "GET") {
    if (match[2]) {
      const rows = checked(
        await db
          .from("admin_sessions")
          .select(
            "id,created_at,last_seen_at,idle_expires_at,absolute_expires_at",
          )
          .eq("admin_user_id", id)
          .is("revoked_at", null)
          .gt("idle_expires_at", new Date().toISOString())
          .gt("absolute_expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(100),
      );
      return reply(response, 200, { items: rows }, requestId);
    }
    if (id) return reply(response, 200, { record: target }, requestId);
    // The admin role can manage subordinate accounts via scoped API calls, but
    // does not receive the Super Admin directory or its route.
    if (actor.role !== "super_admin")
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You do not have access to the account directory.",
      );
    const q = queryValues(url.searchParams, listQuery);
    let query = db
      .from("admin_users")
      .select(fields, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id");
    query =
      q.state === "archived"
        ? query.not("deleted_at", "is", null)
        : query.is("deleted_at", null);
    if (q.state === "active" || q.state === "inactive")
      query = query.eq("is_active", q.state === "active");
    if (q.role) query = query.eq("role", q.role);
    // Do not interpolate search input into a PostgREST logic expression.
    if (q.q)
      query = query.ilike("email", "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%");
    const result = await query.range(
        (q.page - 1) * q.pageSize,
        q.page * q.pageSize - 1,
      ),
      items = checked(result);
    return reply(
      response,
      200,
      {
        items,
        total: result.count,
        page: q.page,
        pageSize: q.pageSize,
        actorId: actor.id,
      },
      requestId,
    );
  }
  await requireCsrf(request, session, store);
  await rate(
    store,
    response,
    "users.mutation",
    riskHash(actor.id, config.riskSecret),
    30,
  );
  const body = await jsonBody(
    request,
    !id ? create : request.method === "PATCH" ? update : action,
    8192,
  );
  if (target && !accountManagementAllowed(actor, target, body.record?.role))
    throw new ApiError(403, "FORBIDDEN", "This action is not allowed.");
  if (body.confirmation !== undefined && body.confirmation !== target.email)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Type the account’s complete email address to confirm.",
    );
  const account = await store.accountByEmail(actor.email);
  if (!(await verifySecret(body.currentPassword, account?.password_hash))) {
    await store.recordLoginFailure(account);
    await store.audit({
      actorId: actor.id,
      action: "users.confirmation_failed",
      requestId,
      result: "denied",
    });
    throw new ApiError(
      403,
      "PASSWORD_CONFIRMATION_FAILED",
      "Your password could not be confirmed.",
    );
  }
  if (account.locked_until && new Date(account.locked_until) > new Date())
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Account changes are temporarily locked. Try again later.",
    );
  const operation = !id
    ? "create"
    : request.method === "PATCH"
      ? "update"
      : body.action;
  const raw = ["create", "reset"].includes(operation) ? token() : null;
  const record = { ...body.record };
  if (operation === "create")
    record.passwordHash = await hashSecret(token() + token()); // No temporary credential is disclosed or usable.
  const result = checked(
    await db.rpc("mutate_account", {
      p_actor: actor.id,
      p_session: session.sessionId,
      p_verified_hash: account.password_hash,
      p_target: id,
      p_action: operation,
      p_revision: body.revision ?? null,
      p_document: record,
      p_token_hash: raw ? tokenHash(raw) : null,
      p_secret: raw
        ? encryptPayload(
            { token: raw, email: target?.email || record.email },
            config.encryptionSecret,
          )
        : null,
      p_request_id: requestId,
    }),
  );
  return reply(
    response,
    200,
    { record: result, accessQueued: !!raw },
    requestId,
  );
}
