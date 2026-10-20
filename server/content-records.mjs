import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  queryValues,
  uuid,
  text,
  safeUrl,
  imageUrl,
} from "./lib/validation.mjs";
const optional = (schema) => schema.nullable().optional(),
  lines = z.array(text(500, 1)).max(100),
  order = z.number().int().min(0).max(1000000).default(0),
  tier = z.enum(["platinum", "gold", "silver", "bronze"]);
export const contentSchemas = {
  resources: z
    .object({
      title: text(200, 2),
      description: text(10000, 2),
      type: z.enum(["study_jam", "cloud_credit", "documentation", "recording"]),
      category: optional(text(100)),
      url: optional(safeUrl),
      duration: optional(text(100)),
      level: z
        .enum(["Beginner", "Intermediate", "Advanced"])
        .default("Beginner"),
      status: z
        .enum(["Available", "Coming Soon", "Archived"])
        .default("Available"),
      provider: optional(text(200)),
      amount: optional(text(100)),
      requirements: lines.default([]),
      materials: lines.default([]),
      tags: z.array(text(50, 1)).max(30).default([]),
      speaker: optional(text(200)),
      icon: optional(text(60)),
      color: optional(
        z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .or(z.literal("")),
      ),
      order_index: order,
    })
    .strict(),
  sponsors: z
    .object({
      name: text(200, 2),
      logo_url: imageUrl.refine((v) => !!v, "Choose a logo."),
      website_url: optional(safeUrl),
      tier,
      order_index: order,
    })
    .strict(),
  "sponsor-tiers": z
    .object({
      tier_name: text(100, 2),
      tier_level: tier,
      amount: text(100, 1),
      color_gradient: z
        .enum(["coral", "gold", "silver", "bronze"])
        .default("coral"),
      benefits: lines.default([]),
      order_index: order,
    })
    .strict(),
  "sponsor-stats": z
    .object({
      stat_label: text(100, 2),
      stat_value: text(50, 1),
      stat_description: text(1000, 2),
      icon_name: z
        .enum(["users", "calendar", "code", "award", "heart", "globe"])
        .default("users"),
      order_index: order,
    })
    .strict(),
  "team-profiles": z
    .object({
      name: text(100, 2),
      role: text(100, 1),
      bio: optional(text(3000)),
      image_url: imageUrl.optional(),
      linkedin_url: optional(safeUrl),
      github_url: optional(safeUrl),
      email: z
        .union([
          z.string().trim().toLowerCase().email().max(254),
          z.literal(""),
        ])
        .nullable()
        .optional(),
      team_section: text(100, 1).default("Active Members"),
      order_index: order,
    })
    .strict(),
};
export async function contentRecordRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const match = new URL(request.url, config.origin).pathname.match(
    /^\/api\/v1\/admin\/content-records\/([^/]+)(?:\/([^/]+))?$/,
  );
  if (!match) return false;
  const kind = match[1],
    schema = contentSchemas[kind],
    capabilities = match[2] === "capabilities";
  if (!schema)
    throw new ApiError(
      404,
      "NOT_FOUND",
      "This content collection is not available.",
    );
  allowMethod(
    request,
    response,
    capabilities
      ? ["GET"]
      : match[2]
        ? ["GET", "PATCH", "POST", "DELETE"]
        : ["GET", "POST"],
  );
  const session = await requireSession(request, store, config);
  if (request.method !== "GET") await requireCsrf(request, session, store);
  if (!["super_admin", "admin", "team_member"].includes(session.user.role))
    throw new ApiError(403, "FORBIDDEN", "This action is not available.");
  const can = async (action, team = null) =>
    checked(
      await db.rpc("can_operate_content", {
        p_actor: session.user.id,
        p_kind: kind,
        p_action: action,
        p_team: team,
      }),
    );
  if (capabilities) {
    if (["admin", "super_admin"].includes(session.user.role)) {
      const teams = checked(
        await db
          .from("admin_teams")
          .select("id,name")
          .eq("is_active", true)
          .order("name")
          .limit(100),
      );
      sendJson(response, 200, { globalCreate: true, teams }, requestId);
      return true;
    }
    const memberships = await store.memberships(session.user.id),
      teams = [];
    for (const membership of memberships)
      if (
        membership.team?.is_active &&
        (await can("create", membership.team_id))
      )
        teams.push({ id: membership.team_id, name: membership.team.name });
    sendJson(
      response,
      200,
      { globalCreate: await can("create"), teams },
      requestId,
    );
    return true;
  }
  const id = match[2] ? parse(uuid, match[2]) : null;
  if (request.method === "GET") {
    if (id) {
      const table = {
        resources: "resources",
        sponsors: "sponsors",
        "sponsor-tiers": "sponsorship_tiers",
        "sponsor-stats": "sponsor_impact_stats",
        "team-profiles": "team_members",
      }[kind];
      const record = checked(
        await db.from(table).select("*").eq("id", id).maybeSingle(),
      );
      if (!record || !(await can("read", record.team_id)))
        throw new ApiError(404, "NOT_FOUND", "This record is not available.");
      const actions = [];
      for (const action of ["read", "create", "update", "delete", "publish"])
        if (await can(action, record.team_id)) actions.push(action);
      sendJson(response, 200, { record: { ...record, actions } }, requestId);
      return true;
    }
    const url = new URL(request.url, config.origin),
      p = queryValues(
        url.searchParams,
        z
          .object({
            page: z.coerce.number().int().min(1).max(10000).default(1),
            pageSize: z.coerce.number().int().min(1).max(100).default(30),
            q: text(100).default(""),
            state: z
              .enum(["current", "draft", "published", "trash"])
              .default("current"),
            team: uuid.optional(),
          })
          .strict(),
      );
    const result = checked(
      await db.rpc("list_content_records", {
        p_actor: session.user.id,
        p_kind: kind,
        p_page: p.page,
        p_size: p.pageSize,
        p_filters: {
          q: p.q,
          state: p.state,
          ...(p.team ? { team: p.team } : {}),
        },
      }),
    );
    sendJson(
      response,
      200,
      { ...result, page: p.page, pageSize: p.pageSize },
      requestId,
    );
    return true;
  }
  const body = await jsonBody(
    request,
    id
      ? request.method === "PATCH"
        ? z
            .object({
              revision: z.number().int().min(1),
              teamId: uuid.nullable().optional(),
              record: schema.partial(),
            })
            .strict()
        : z
            .object({
              revision: z.number().int().min(1),
              action:
                request.method === "DELETE"
                  ? z.literal("archive").default("archive")
                  : z.enum(["publish", "unpublish", "restore", "duplicate"]),
            })
            .strict()
      : z
          .object({ teamId: uuid.nullable().default(null), record: schema })
          .strict(),
    65536,
  );
  if (kind === "sponsor-tiers" && body.action === "duplicate")
    throw new ApiError(
      409,
      "INVALID_STATE",
      "Each sponsorship tier level is unique. Create a different level instead.",
    );
  const changed = checked(
    await db.rpc("mutate_content_record", {
      p_actor: session.user.id,
      p_kind: kind,
      p_id: id,
      p_action: !id
        ? "create"
        : request.method === "PATCH"
          ? "update"
          : body.action,
      p_revision: body.revision || null,
      p_document: {
        ...(body.record || {}),
        ...(body.teamId !== undefined ? { team_id: body.teamId } : {}),
      },
      p_request: requestId,
    }),
  );
  sendJson(response, 200, { record: changed }, requestId);
  return true;
}
