import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  uuid,
  parse,
  queryValues,
  text,
  idempotency,
} from "./lib/validation.mjs";
import { tokenHash, riskHash, verifySecret } from "./lib/security.mjs";
import {
  communityMemberCreate,
  communityMemberMutation,
  memberCategories,
  memberMergePreview,
  memberMergeCommit,
} from "../shared/members.mjs";
export async function memberRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/members(?:\/([^/]+))?(?:\/(activity))?$/,
    );
  if (!match) return false;
  const kind = ["capabilities", "merge-preview", "merge"].includes(match[1])
      ? match[1]
      : null,
    id = match[1] && !kind ? parse(uuid, match[1]) : null,
    activity = !!match[2];
  if (kind && activity)
    throw new ApiError(404, "NOT_FOUND", "This endpoint was not found.");
  allowMethod(
    request,
    response,
    kind === "capabilities" || activity
      ? ["GET"]
      : kind
        ? ["POST"]
        : id
          ? ["GET", "PATCH", "POST", "DELETE"]
          : ["GET", "POST"],
  );
  const session = await requireSession(request, store, config),
    actor = session.user;
  if (!["admin", "super_admin", "team_member"].includes(actor.role))
    throw new ApiError(403, "FORBIDDEN", "This workspace is not available.");
  const reply = (data) => {
      sendJson(response, 200, data, requestId);
      return true;
    },
    can = async (team, action) =>
      checked(
        await db.rpc("can_operate_member", {
          p_actor: actor.id,
          p_team: team,
          p_action: action,
        }),
      );
  const quota = async (scope, limit, seconds = 900) => {
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
  if (request.method === "GET") await quota("members.read", 240, 60);
  if (kind === "capabilities") {
    queryValues(url.searchParams, z.object({}).strict());
    const globalCreate = await can(null, "create"),
      merge = await can(null, "merge"),
      candidates = globalCreate
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
      if ((await can(t.id, "read")) && (await can(t.id, "create")))
        teams.push(t);
    return reply({ globalCreate, merge, teams });
  }
  if (request.method === "GET") {
    if (id) {
      const p = queryValues(
          url.searchParams,
          activity
            ? z
                .object({
                  page: z.coerce.number().int().min(1).max(10000).default(1),
                })
                .strict()
            : z.object({}).strict(),
        ),
        record = checked(
          await db.rpc("community_member_projection", {
            p_actor: actor.id,
            p_id: id,
          }),
        );
      if (!record)
        throw new ApiError(404, "NOT_FOUND", "This member was not found.");
      if (activity) {
        const items = checked(
          await db
            .from("admin_actions")
            .select("id,action,result,created_at")
            .eq("target_type", "member")
            .eq("target_id", id)
            .neq("action", "members.viewed")
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range((p.page - 1) * 30, p.page * 30 - 1),
        );
        return reply({ items, page: p.page, pageSize: 30 });
      }
      await store.audit({
        actorId: actor.id,
        action: "members.viewed",
        targetType: "member",
        targetId: id,
        requestId,
      });
      return reply({ member: record });
    }
    const p = queryValues(
      url.searchParams,
      z
        .object({
          q: text(100).default(""),
          page: z.coerce.number().int().min(1).max(10000).default(1),
          state: z.enum(["current", "trash"]).default("current"),
          category: z.enum(memberCategories).optional(),
          year: text(50).optional(),
          active: z.enum(["true", "false"]).optional(),
          core: z.enum(["true", "false"]).optional(),
        })
        .strict(),
    );
    const result = checked(
      await db.rpc("list_community_members", {
        p_actor: actor.id,
        p_page: p.page,
        p_query: p.q,
        p_state: p.state,
        p_category: p.category || null,
        p_year: p.year || null,
        p_active: p.active === undefined ? null : p.active === "true",
        p_core: p.core === undefined ? null : p.core === "true",
      }),
    );
    await store.audit({
      actorId: actor.id,
      action: "members.list_viewed",
      targetType: "member",
      requestId,
      metadata: {
        count: result.items.length,
        filterHash: tokenHash(JSON.stringify(p)),
      },
    });
    return reply(result);
  }
  await requireCsrf(request, session, store);
  queryValues(url.searchParams, z.object({}).strict());
  await quota("members.mutation", 120, 60);
  const key = idempotency(request);
  if (kind === "merge-preview") {
    if (!["admin", "super_admin"].includes(actor.role))
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only chapter administrators can review merges.",
      );
    await quota("members.merge_preview", 30);
    const body = await jsonBody(request, memberMergePreview, 4096),
      reviewToken = Buffer.from(
        riskHash(
          "members.merge.preview:" +
            actor.id +
            ":" +
            session.sessionId +
            ":" +
            key,
          config.riskSecret,
        ),
        "hex",
      ).toString("base64url");
    const review = checked(
      await db.rpc("preview_member_merge", {
        p_actor: actor.id,
        p_session: session.sessionId,
        p_source: body.sourceId,
        p_target: body.targetId,
        p_source_revision: body.sourceRevision,
        p_target_revision: body.targetRevision,
        p_token_hash: tokenHash(reviewToken),
        p_request_id: requestId,
      }),
    );
    return reply({ ...review, reviewToken });
  }
  const body = await jsonBody(
      request,
      kind === "merge"
        ? memberMergeCommit
        : id
          ? communityMemberMutation
          : communityMemberCreate,
      32768,
    ),
    { currentPassword, ...document } = body;
  let verified = null;
  if (kind === "merge" && !["admin", "super_admin"].includes(actor.role))
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only chapter administrators can merge records.",
    );
  if (request.method === "DELETE" && document.action !== "archive")
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Use the confirmed archive action.",
    );
  if (currentPassword !== undefined) {
    await quota("members.confirm", 30);
    const a = await store.accountByEmail(actor.email);
    if (!(await verifySecret(currentPassword, a?.password_hash)))
      throw new ApiError(
        403,
        "PASSWORD_REQUIRED",
        "Confirm your current password.",
      );
    verified = a.password_hash;
  }
  if (kind === "merge") {
    const { reviewToken, ...fingerprint } = document;
    return reply(
      checked(
        await db.rpc("commit_member_merge", {
          p_actor: actor.id,
          p_session: session.sessionId,
          p_verified_hash: verified,
          p_review: document.reviewId,
          p_token_hash: tokenHash(reviewToken),
          p_source_confirmation: document.sourceConfirmation,
          p_target_confirmation: document.targetConfirmation,
          p_key_hash: tokenHash(key),
          p_request_hash: tokenHash(
            JSON.stringify({
              ...fingerprint,
              reviewTokenHash: tokenHash(reviewToken),
            }),
          ),
          p_request_id: requestId,
        }),
      ),
    );
  }
  return reply(
    checked(
      await db.rpc("mutate_community_member", {
        p_actor: actor.id,
        p_session: session.sessionId,
        p_verified_hash: verified,
        p_id: id,
        p_action: id ? document.action : "create",
        p_revision: document.revision || null,
        p_document: document,
        p_key_hash: tokenHash(key),
        p_request_hash: tokenHash(JSON.stringify(document)),
        p_request_id: requestId,
      }),
    ),
  );
}
