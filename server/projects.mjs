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
import { projectCreate, projectMutation } from "../shared/projects.mjs";
export async function projectRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/projects(?:\/([^/]+))?(?:\/(members))?$/,
    );
  if (!match) return false;
  const capabilities = match[1] === "capabilities",
    id = match[1] && !capabilities ? parse(uuid, match[1]) : null,
    members = !!match[2];
  if (capabilities && members)
    throw new ApiError(404, "NOT_FOUND", "This endpoint was not found.");
  allowMethod(
    request,
    response,
    capabilities ? ["GET"] : id ? ["GET", "POST", "PATCH"] : ["GET", "POST"],
  );
  const session = await requireSession(request, store, config),
    actor = session.user;
  if (!["admin", "super_admin", "team_member"].includes(actor.role))
    throw new ApiError(403, "FORBIDDEN", "This workspace is not available.");
  const reply = (data) => {
    sendJson(response, 200, data, requestId);
    return true;
  };
  const can = async (team, action) =>
    checked(
      await db.rpc("can_operate_project", {
        p_actor: actor.id,
        p_team: team,
        p_action: action,
      }),
    );
  if (capabilities) {
    queryValues(url.searchParams, z.object({}).strict());
    const globalCreate = await can(null, "create"),
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
    return reply({ globalCreate, teams });
  }
  if (request.method === "GET") {
    if (id) {
      const p = queryValues(
        url.searchParams,
        z
          .object({
            page: z.coerce.number().int().min(1).max(10000).default(1),
          })
          .strict(),
      );
      return reply(
        checked(
          await db.rpc("private_project_detail", {
            p_actor: actor.id,
            p_id: id,
            p_page: p.page,
          }),
        ),
      );
    }
    const p = queryValues(
      url.searchParams,
      z
        .object({
          q: text(100).default(""),
          page: z.coerce.number().int().min(1).max(10000).default(1),
          state: z.enum(["current", "trash"]).default("current"),
          status: z
            .enum(["active", "completed", "on_hold", "archived"])
            .optional(),
          category: text(100, 1).optional(),
          featured: z.enum(["true", "false"]).optional(),
        })
        .strict(),
    );
    return reply(
      checked(
        await db.rpc("list_private_projects", {
          p_actor: actor.id,
          p_page: p.page,
          p_query: p.q,
          p_state: p.state,
          p_status: p.status || null,
          p_category: p.category || null,
          p_featured: p.featured === undefined ? null : p.featured === "true",
        }),
      ),
    );
  }
  await requireCsrf(request, session, store);
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
  await quota("projects.mutation", 120, 60);
  queryValues(url.searchParams, z.object({}).strict());
  const body = await jsonBody(
    request,
    id ? projectMutation : projectCreate,
    65536,
  );
  if (members && !body.action?.startsWith("member_"))
    throw new ApiError(400, "VALIDATION_ERROR", "Choose a member action.");
  const { currentPassword, ...document } = body;
  let verified = null;
  if (currentPassword !== undefined) {
    await quota("projects.confirm", 20, 900);
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
      await db.rpc("mutate_private_project", {
        p_actor: actor.id,
        p_session: session.sessionId,
        p_verified_hash: verified,
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
