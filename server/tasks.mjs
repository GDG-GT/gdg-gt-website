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
import {
  taskCreate,
  taskMutation,
  taskComment,
  taskCommentMutation,
} from "../shared/tasks.mjs";
import { riskHash, tokenHash, verifySecret } from "./lib/security.mjs";
async function quota(
  store,
  response,
  config,
  actor,
  scope,
  limit,
  seconds = 60,
) {
  const result = await store.rateLimit(
    scope,
    riskHash(actor, config.riskSecret),
    limit,
    seconds,
  );
  if (!result.allowed) {
    response.setHeader("Retry-After", String(result.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Please wait before trying again.");
  }
}
export async function taskRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/communications\/tasks(?:\/([^/]+))?(?:\/(comments))?(?:\/([^/]+))?$/,
    );
  if (!match) return false;
  allowMethod(request, response, match[3] ? ["POST"] : ["GET", "POST"]);
  if (match[3] && !match[2])
    throw new ApiError(404, "NOT_FOUND", "This endpoint was not found.");
  const session = await requireSession(request, store, config),
    actor = session.user;
  const reply = (data) => {
    sendJson(response, 200, data, requestId);
    return true;
  };
  const can = (id, action, team = null) =>
    db
      .rpc("can_operate_task", {
        p_actor: actor.id,
        p_task: id,
        p_action: action,
        p_team: team,
      })
      .then(checked);
  if (match[1] === "capabilities" && !match[2] && !match[3]) {
    allowMethod(request, response, ["GET"]);
    const globalCreate = ["super_admin", "admin"].includes(actor.role),
      memberships = await store.memberships(actor.id),
      teams = [];
    const candidates = globalCreate
      ? checked(
          await db
            .from("admin_teams")
            .select("id,name")
            .eq("is_active", true)
            .is("deleted_at", null)
            .order("name")
            .limit(100),
        )
      : actor.role === "team_member"
        ? memberships
            .filter((m) => m.team?.is_active)
            .map((m) => ({ id: m.team_id, name: m.team.name }))
        : [];
    for (const team of candidates)
      if (globalCreate || (await can(null, "create", team.id)))
        teams.push(team);
    return reply({
      globalCreate,
      personalCreate: globalCreate || actor.role === "team_member",
      teams,
      actorId: actor.id,
    });
  }
  const id = match[1] ? parse(uuid, match[1]) : null,
    commentId = match[3] ? parse(uuid, match[3]) : null;
  if (request.method === "GET") {
    if (!id) {
      const q = queryValues(
        url.searchParams,
        z
          .object({
            page: z.coerce.number().int().min(1).max(10000).default(1),
            q: text(100).default(""),
            status: z
              .enum(["all", "pending", "in-progress", "completed", "overdue"])
              .default("all"),
            priority: z.enum(["all", "low", "medium", "high"]).default("all"),
            scope: z.enum(["all", "assigned", "created"]).default("assigned"),
            archived: z.enum(["0", "1"]).default("0"),
          })
          .strict(),
      );
      return reply(
        checked(
          await db.rpc("list_tasks", {
            p_actor: actor.id,
            p_page: q.page,
            p_query: q.q,
            p_state: q.status,
            p_priority: q.priority,
            p_scope: q.scope,
            p_archived: q.archived === "1",
          }),
        ),
      );
    }
    if (match[2] === "comments") {
      const q = queryValues(
        url.searchParams,
        z
          .object({
            before: z.string().datetime({ offset: true }).optional(),
            beforeId: uuid.optional(),
          })
          .strict()
          .refine((v) => !!v.before === !!v.beforeId),
      );
      const result = checked(
        await db.rpc("list_task_comments", {
          p_actor: actor.id,
          p_task: id,
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
    const record = checked(
      await db.rpc("task_projection", { p_actor: actor.id, p_id: id }),
    );
    if (!record)
      throw new ApiError(404, "NOT_FOUND", "This task was not found.");
    return reply({ record });
  }
  await requireCsrf(request, session, store);
  await quota(
    store,
    response,
    config,
    actor.id,
    match[2] ? "tasks.comments" : "tasks.write",
    120,
  );
  const key = idempotency(request);
  if (match[2] === "comments") {
    const body = await jsonBody(
      request,
      commentId ? taskCommentMutation : taskComment,
      24000,
    );
    return reply(
      checked(
        await db.rpc("mutate_task_comment", {
          p_actor: actor.id,
          p_session: session.sessionId,
          p_task: id,
          p_id: commentId,
          p_action: commentId ? body.action : "create",
          p_revision: commentId ? body.revision : null,
          p_comment: commentId
            ? body.action === "edit"
              ? body.comment
              : null
            : body.comment,
          p_key_hash: tokenHash(key),
          p_request_hash: tokenHash(JSON.stringify(body)),
          p_request_id: requestId,
        }),
      ),
    );
  }
  const body = await jsonBody(request, id ? taskMutation : taskCreate, 65536);
  if (
    !id &&
    !["super_admin", "admin"].includes(actor.role) &&
    !body.teamId &&
    body.assigneeEmail &&
    body.assigneeEmail !== actor.email
  )
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Personal tasks can be assigned only to your own account.",
    );
  let document = body,
    verifiedHash = null;
  if (id) {
    const record = checked(
      await db.rpc("task_projection", { p_actor: actor.id, p_id: id }),
    );
    if (!record)
      throw new ApiError(404, "NOT_FOUND", "This task was not found.");
    if (
      ["assign", "archive", "restore"].includes(body.action) &&
      body.confirmation !== record.title
    )
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Type the task title to confirm this change.",
      );
    if (body.action === "assign") {
      if (!(await can(id, "assign")))
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Task reassignment is restricted.",
        );
      await quota(store, response, config, actor.id, "tasks.confirm", 5, 900);
      const account = await store.accountByEmail(actor.email);
      if (!(await verifySecret(body.currentPassword, account?.password_hash)))
        throw new ApiError(
          403,
          "PASSWORD_REQUIRED",
          "Confirm your current password.",
        );
      verifiedHash = account.password_hash;
      document = { assigneeEmail: body.assigneeEmail };
    } else
      document =
        body.action === "update"
          ? body.record
          : body.action === "status"
            ? { status: body.status }
            : {};
  }
  const result = checked(
    await db.rpc("mutate_task", {
      p_actor: actor.id,
      p_session: session.sessionId,
      p_verified_hash: verifiedHash,
      p_id: id,
      p_action: id ? body.action : "create",
      p_revision: id ? body.revision : null,
      p_document: document,
      p_key_hash: tokenHash(key),
      p_request_hash: tokenHash(
        JSON.stringify({ ...body, currentPassword: undefined }),
      ),
      p_request_id: requestId,
    }),
  );
  return reply(result);
}
