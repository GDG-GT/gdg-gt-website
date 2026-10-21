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
import { tokenHash, riskHash, verifySecret } from "./lib/security.mjs";
import { blogCreate, blogMutation } from "../shared/blog.mjs";

export async function blogRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/blog\/(posts|categories|submissions|comments|capabilities)(?:\/([^/]+))?$/,
    );
  if (!match) return false;
  const kind = match[1],
    cap = kind === "capabilities",
    id = match[2] ? parse(uuid, match[2]) : null;
  if (cap && id)
    throw new ApiError(404, "NOT_FOUND", "This endpoint was not found.");
  allowMethod(
    request,
    response,
    cap
      ? ["GET"]
      : id
        ? ["GET", "POST", "PATCH", "DELETE"]
        : ["GET", ...(["posts", "categories"].includes(kind) ? ["POST"] : [])],
  );
  const session = await requireSession(request, store, config),
    actor = session.user;
  if (
    !["admin", "super_admin", "team_member", "blog_editor"].includes(actor.role)
  )
    throw new ApiError(403, "FORBIDDEN", "This workspace is not available.");
  const reply = (data) => {
    sendJson(response, 200, data, requestId);
    return true;
  };
  const can = async (collection, action, team = null, recordId = null) =>
    checked(
      await db.rpc("can_operate_blog", {
        p_actor: actor.id,
        p_kind: collection,
        p_id: recordId,
        p_team: team,
        p_action: action,
      }),
    );
  const quota = async (scope, limit, seconds) => {
    const r = await store.rateLimit(
      scope,
      riskHash(actor.id, config.riskSecret),
      limit,
      seconds,
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
  if (request.method !== "GET") await requireCsrf(request, session, store);
  await quota(
    request.method === "GET" ? "blog.read" : "blog.write",
    request.method === "GET" ? 240 : 120,
    60,
  );
  if (cap) {
    queryValues(url.searchParams, z.object({}).strict());
    const admin = ["admin", "super_admin"].includes(actor.role),
      globalCreate = await can("posts", "create");
    const candidates = admin
        ? checked(
            await db
              .from("admin_teams")
              .select("id,name")
              .eq("is_active", true)
              .is("deleted_at", null)
              .order("name")
              .limit(100),
          )
        : (await store.memberships(actor.id))
            .filter((m) => m.is_active && m.team?.is_active)
            .map((m) => ({ id: m.team_id, name: m.team.name })),
      teams = [];
    for (const t of candidates)
      if (await can("posts", "read", t.id))
        teams.push({ ...t, canCreate: await can("posts", "create", t.id) });
    if (!admin && actor.role !== "blog_editor" && !teams.length)
      throw new ApiError(403, "FORBIDDEN", "Blog access is not granted.");
    const editors = admin
      ? checked(
          await db
            .from("admin_users")
            .select("id,display_name")
            .eq("role", "blog_editor")
            .eq("is_active", true)
            .eq("must_change_password", false)
            .is("deleted_at", null)
            .order("display_name")
            .limit(100),
        )
      : [];
    return reply({
      globalCreate,
      teams,
      admin,
      editor: actor.role === "blog_editor",
      editors,
    });
  }
  if (request.method === "GET") {
    if (id) {
      const q = queryValues(
        url.searchParams,
        z
          .object({
            page: z.coerce.number().int().min(1).max(10000).default(1),
          })
          .strict(),
      );
      const result = checked(
        await db.rpc("blog_private_detail", {
          p_actor: actor.id,
          p_kind: kind,
          p_id: id,
          p_page: q.page,
        }),
      );
      await store.audit({
        actorId: actor.id,
        action: "blog.detail_viewed",
        targetType: "private_blog",
        targetId: id,
        requestId,
        metadata: { kind, page: q.page },
      });
      return reply(result);
    }
    const q = queryValues(
      url.searchParams,
      z
        .object({
          page: z.coerce.number().int().min(1).max(10000).default(1),
          q: text(100).default(""),
          state: z.enum(["current", "trash"]).default("current"),
          status: z
            .enum([
              "draft",
              "published",
              "archived",
              "pending",
              "reviewed",
              "approved",
              "rejected",
              "active",
              "inactive",
              "flagged",
            ])
            .optional(),
        })
        .strict(),
    );
    const result = checked(
      await db.rpc("list_private_blog", {
        p_actor: actor.id,
        p_kind: kind,
        p_page: q.page,
        p_query: q.q,
        p_state: q.state,
        p_status: q.status || null,
      }),
    );
    await store.audit({
      actorId: actor.id,
      action: "blog.inventory_viewed",
      targetType: "private_blog",
      requestId,
      metadata: {
        kind,
        page: q.page,
        filterHash: tokenHash(JSON.stringify(q)),
      },
    });
    return reply(result);
  }
  queryValues(url.searchParams, z.object({}).strict());
  const body = await jsonBody(
    request,
    id ? blogMutation(kind) : blogCreate(kind),
    262144,
  );
  if (request.method === "DELETE" && body.action !== "archive")
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Only recoverable archive is supported.",
    );
  const { currentPassword, ...document } = body;
  let verified = null;
  if (currentPassword !== undefined) {
    await quota("blog.confirm", 30, 900);
    const a = await store.accountByEmail(actor.email);
    if (!(await verifySecret(currentPassword, a?.password_hash)))
      throw new ApiError(
        403,
        "PASSWORD_REQUIRED",
        "Confirm your current password.",
      );
    verified = a.password_hash;
  }
  return reply(
    checked(
      await db.rpc("mutate_private_blog", {
        p_actor: actor.id,
        p_session: session.sessionId,
        p_verified_hash: verified,
        p_kind: kind,
        p_id: id,
        p_action: id ? document.action : "create",
        p_revision: document.revision || null,
        p_document: document,
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: tokenHash(JSON.stringify(document)),
        p_request_id: requestId,
      }),
    ),
  );
}
