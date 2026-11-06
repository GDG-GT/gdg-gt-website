import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  queryValues,
  parse,
  uuid,
  text,
  slug,
  idempotency,
} from "./lib/validation.mjs";
import { verifySecret, riskHash, tokenHash } from "./lib/security.mjs";
import { teamGrantOptions } from "../shared/teams.ts";
const colors = ["#4285F4", "#E6705F", "#0F9D58", "#F4B400", "#666666"];
const teamRecord = z
  .object({
    name: text(100, 2),
    description: text(2000).default(""),
    color: z.enum(colors).default("#4285F4"),
    icon: z
      .enum([
        "users",
        "calendar",
        "code",
        "palette",
        "megaphone",
        "heart",
        "star",
        "briefcase",
      ])
      .default("users"),
  })
  .strict();
const grant = z
  .object({
    path: z.string().max(100),
    resource: z.string().max(50),
    create: z.boolean(),
    read: z.boolean(),
    update: z.boolean(),
    delete: z.boolean(),
    extras: z.array(z.string().max(40)).max(6),
  })
  .strict()
  .superRefine((v, c) => {
    const option = teamGrantOptions.find(
      (o) => o.path === v.path && o.resource === v.resource,
    );
    if (
      !option ||
      new Set(v.extras).size !== v.extras.length ||
      v.extras.some((e) => !option.extras.some((x) => x === e)) ||
      (v.extras.includes("publish") && !v.update)
    )
      c.addIssue({
        code: "custom",
        message:
          "Choose an allowed page and its explicit actions. Publishing also requires edit access.",
      });
  });
const base = { currentPassword: z.string().min(1).max(128) };
export const teamSchemas = {
  create: z
    .object({
      ...base,
      record: teamRecord.extend({ slug, leadId: uuid }).strict(),
    })
    .strict(),
  update: z
    .object({
      ...base,
      revision: z.number().int().positive(),
      record: teamRecord,
    })
    .strict(),
  action: z.discriminatedUnion("action", [
    z
      .object({
        ...base,
        action: z.enum(["archive", "restore"]),
        revision: z.number().int().positive(),
        confirmation: text(100, 2),
      })
      .strict(),
    z
      .object({
        ...base,
        action: z.literal("member_add"),
        revision: z.number().int().positive(),
        email: z.string().trim().toLowerCase().email().max(255),
        role: z.enum(["member", "lead", "co_lead"]),
      })
      .strict(),
    z
      .object({
        ...base,
        action: z.enum(["member_role", "member_remove"]),
        revision: z.number().int().positive(),
        membershipId: uuid,
        membershipRevision: z.number().int().positive(),
        role: z.enum(["member", "lead", "co_lead"]),
      })
      .strict(),
    z
      .object({
        ...base,
        action: z.literal("member_transfer"),
        revision: z.number().int().positive(),
        membershipId: uuid,
        membershipRevision: z.number().int().positive(),
        destinationId: uuid,
        reason: text(1000, 2),
      })
      .strict(),
    z
      .object({
        ...base,
        action: z.literal("permissions"),
        revision: z.number().int().positive(),
        confirmation: text(100, 2),
        grants: z
          .array(grant)
          .max(16)
          .refine((v) => new Set(v.map((g) => g.path)).size === v.length),
      })
      .strict(),
  ]),
};
function reply(response, data, requestId) {
  sendJson(response, 200, data, requestId);
  return true;
}
export async function teamRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/teams(?:\/([^/]+))?(?:\/(activity|transfers|candidates))?$/,
    );
  if (!match) return false;
  allowMethod(
    request,
    response,
    match[2] ? ["GET"] : match[1] ? ["GET", "PATCH", "POST"] : ["GET", "POST"],
  );
  const session = await requireSession(request, store, config),
    actor = session.user,
    id = match[1] ? parse(uuid, match[1]) : null;
  if (actor.role === "blog_editor")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Editorial accounts cannot access team administration.",
    );
  if (request.method === "GET") {
    if (!id) {
      const q = queryValues(
        url.searchParams,
        z
          .object({
            q: text(100).default(""),
            state: z.enum(["current", "archived"]).default("current"),
            page: z.coerce.number().int().min(1).max(10000).default(1),
            pageSize: z.coerce.number().int().min(1).max(100).default(20),
          })
          .strict(),
      );
      let query = db
        .from("admin_teams")
        .select(
          "id,name,description,slug,color,icon,is_active,team_lead_id,revision,deleted_at",
          { count: "exact" },
        )
        .order("name")
        .order("id");
      if (actor.role === "team_member") {
        const memberships = (await store.memberships(actor.id)).filter(
          (m) => m.team?.is_active,
        );
        if (!memberships.length)
          return reply(
            response,
            {
              items: [],
              total: 0,
              page: q.page,
              pageSize: q.pageSize,
              canCreate: false,
            },
            requestId,
          );
        query = query.in(
          "id",
          memberships.map((m) => m.team_id),
        );
      }
      query =
        q.state === "archived"
          ? query.not("deleted_at", "is", null)
          : query.is("deleted_at", null);
      if (q.q)
        query = query.ilike("name", "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%");
      const result = await query.range(
          (q.page - 1) * q.pageSize,
          q.page * q.pageSize - 1,
        ),
        items = checked(result);
      return reply(
        response,
        {
          items,
          total: result.count,
          page: q.page,
          pageSize: q.pageSize,
          canCreate: ["super_admin", "admin"].includes(actor.role),
        },
        requestId,
      );
    }
    const workspace = checked(
      await db.rpc("team_workspace", { p_actor: actor.id, p_team: id }),
    );
    if (!match[2])
      return reply(
        response,
        {
          ...workspace,
          actorRole: actor.role,
          grantOptions: workspace.actions.permissions ? teamGrantOptions : [],
        },
        requestId,
      );
    if (match[2] === "candidates") {
      if (!workspace.actions.settings)
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Use an exact member email address to add a member.",
        );
      const q = queryValues(
        url.searchParams,
        z
          .object({ email: z.string().trim().toLowerCase().email().max(255) })
          .strict(),
      );
      let query = db
        .from("admin_users")
        .select("id,email,display_name,role")
        .eq("email", q.email)
        .eq("is_active", true)
        .eq("must_change_password", false)
        .is("deleted_at", null)
        .neq("role", "blog_editor");
      if (actor.role !== "super_admin")
        query = query.neq("role", "super_admin");
      return reply(
        response,
        { items: checked(await query.limit(1)) },
        requestId,
      );
    }
    const p = queryValues(
      url.searchParams,
      z
        .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
        .strict(),
    );
    const query =
      match[2] === "activity"
        ? db
            .from("team_activity_log")
            .select("id,action,target_user_id,details,created_at", {
              count: "exact",
            })
            .eq("team_id", id)
        : db
            .from("team_member_transfers")
            .select(
              "id,membership_id,from_team_id,to_team_id,reason,created_at",
              { count: "exact" },
            )
            .or(`from_team_id.eq.${id},to_team_id.eq.${id}`);
    const result = await query
      .order("created_at", { ascending: false })
      .order("id")
      .range((p.page - 1) * 20, p.page * 20 - 1);
    return reply(
      response,
      {
        items: checked(result),
        total: result.count,
        page: p.page,
        pageSize: 20,
      },
      requestId,
    );
  }
  await requireCsrf(request, session, store);
  const quota = await store.rateLimit(
    "teams.mutation",
    riskHash(actor.id, config.riskSecret),
    60,
    900,
  );
  if (!quota.allowed) {
    response.setHeader("Retry-After", String(quota.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Please wait before trying again.");
  }
  const body = await jsonBody(
      request,
      !id
        ? teamSchemas.create
        : request.method === "PATCH"
          ? teamSchemas.update
          : teamSchemas.action,
      32768,
    ),
    operation = !id
      ? "create"
      : request.method === "PATCH"
        ? "update"
        : body.action;
  if (id) {
    const needed = ["update", "archive", "restore"].includes(operation)
      ? "settings"
      : operation === "permissions"
        ? "permissions"
        : "manage";
    if (
      !checked(
        await db.rpc("can_operate_team", {
          p_actor: actor.id,
          p_team: id,
          p_action: needed,
        }),
      )
    )
      throw new ApiError(404, "NOT_FOUND", "This team was not found.");
    if (body.confirmation !== undefined) {
      const team = checked(
        await db.from("admin_teams").select("name").eq("id", id).single(),
      );
      if (body.confirmation !== team.name)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Type the complete team name to confirm.",
        );
    }
  } else if (!["super_admin", "admin"].includes(actor.role))
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only chapter administrators can create teams.",
    );
  const account = await store.accountByEmail(actor.email);
  if (!(await verifySecret(body.currentPassword, account?.password_hash))) {
    await store.recordLoginFailure(account);
    await store.audit({
      actorId: actor.id,
      action: "teams.confirmation_failed",
      requestId,
      result: "denied",
    });
    throw new ApiError(
      403,
      "PASSWORD_CONFIRMATION_FAILED",
      "Your password could not be confirmed.",
    );
  }
  const { currentPassword, revision, action, ...document } = body;
  const key = idempotency(request);
  void currentPassword;
  void action;
  const result = checked(
    await db.rpc("mutate_team_workspace", {
      p_actor: actor.id,
      p_session: session.sessionId,
      p_verified_hash: account.password_hash,
      p_team: id,
      p_action: operation,
      p_revision: revision ?? null,
      p_document: body.record || document,
      p_key_hash: tokenHash(key),
      p_request_hash: tokenHash(
        JSON.stringify({
          team: id,
          action: operation,
          revision: revision ?? null,
          document: body.record || document,
        }),
      ),
      p_request_id: requestId,
    }),
  );
  return reply(
    response,
    {
      ...result,
      actorRole: actor.role,
      grantOptions: result.actions.permissions ? teamGrantOptions : [],
    },
    requestId,
  );
}
