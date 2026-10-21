import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import { isAuthorized, routes } from "./lib/authorization.mjs";
import {
  databaseResult as checked,
  parse,
  queryValues,
  uuid,
} from "./lib/validation.mjs";
import { csvRow } from "./lib/csv.mjs";

const pagination = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
};
export const auditQuery = z
  .object({
    ...pagination,
    action: z
      .string()
      .trim()
      .max(100)
      .regex(/^[a-z0-9_.-]*$/)
      .optional(),
    actor: uuid.optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    result: z.enum(["success", "denied", "failure"]).optional(),
  })
  .strict()
  .refine((p) => !p.from || !p.to || new Date(p.from) <= new Date(p.to), {
    message: "Invalid date range",
    path: ["to"],
  });
const safeNotification = (row) => ({
  ...row,
  link:
    typeof row.link === "string" &&
    /^\/admin(?:\/|$)/.test(row.link) &&
    !/[\\?#]/.test(row.link)
      ? row.link
      : null,
});

export async function workspaceRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    path = url.pathname;
  const notification = path.match(
    /^\/api\/v1\/admin\/notifications(?:\/([^/]+))?$/,
  );
  if (
    !notification &&
    ![
      "/api/v1/admin/dashboard",
      "/api/v1/admin/audit",
      "/api/v1/admin/audit/export",
    ].includes(path)
  )
    return false;
  allowMethod(
    request,
    response,
    notification
      ? notification[1]
        ? ["PATCH", "DELETE"]
        : ["GET", "PATCH", "DELETE"]
      : ["GET"],
  );
  const session = await requireSession(request, store, config);
  if (request.method !== "GET") await requireCsrf(request, session, store);
  if (notification) {
    if (request.method === "GET") {
      const p = queryValues(
        url.searchParams,
        z
          .object({
            ...pagination,
            unread: z.enum(["true", "false"]).default("false"),
          })
          .strict(),
      );
      let query = db
        .from("notifications")
        .select("id,user_id,type,title,message,link,is_read,created_at", {
          count: "exact",
        })
        .eq("user_id", session.user.id);
      if (p.unread === "true") query = query.eq("is_read", false);
      const [rows, count] = await Promise.all([
        query
          .order("created_at", { ascending: false })
          .order("id")
          .range((p.page - 1) * p.pageSize, p.page * p.pageSize - 1),
        db
          .from("notifications")
          .select("id", { head: true, count: "exact" })
          .eq("user_id", session.user.id)
          .eq("is_read", false),
      ]);
      checked(rows);
      checked(count);
      sendJson(
        response,
        200,
        {
          items: rows.data.map(safeNotification),
          total: rows.count,
          unreadCount: count.count,
          page: p.page,
          pageSize: p.pageSize,
        },
        requestId,
      );
      return true;
    }
    const id = notification[1] ? parse(uuid, notification[1]) : null;
    queryValues(url.searchParams, z.object({}).strict());
    if (request.method === "PATCH")
      await jsonBody(
        request,
        z.object({ is_read: z.literal(true) }).strict(),
        1024,
      );
    if (request.method === "DELETE" && !id)
      await jsonBody(request, z.object({ readOnly: z.literal(true) }).strict(), 1024);
    checked(
      await db.rpc("mutate_own_notification", {
        p_actor: session.user.id,
        p_id: id,
        p_action:
          request.method === "DELETE" ? id ? "delete" : "dismiss_all_read" : id ? "read" : "read_all",
        p_request_id: requestId,
      }),
    );
    sendJson(response, 200, { updated: true }, requestId);
    return true;
  }
  if (path.includes("/audit")) {
    if (!["admin", "super_admin"].includes(session.user.role))
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only chapter administrators can view the audit log.",
      );
    const p = queryValues(url.searchParams, auditQuery),
      cutoff = new Date().toISOString();
    const base = () => {
      let q = db
        .from("admin_actions")
        .select(
          "id,actor_id,action,target_type,target_id,result,request_id,created_at",
          { count: "exact" },
        )
        .lte("created_at", cutoff);
      if (p.action) q = q.eq("action", p.action);
      if (p.actor) q = q.eq("actor_id", p.actor);
      if (p.from) q = q.gte("created_at", p.from);
      if (p.to) q = q.lte("created_at", p.to);
      if (p.result) q = q.eq("result", p.result);
      return q.order("created_at", { ascending: false }).order("id");
    };
    const exported = path.endsWith("/export");
    const result = await base().range(
      exported ? 0 : (p.page - 1) * p.pageSize,
      exported ? 0 : p.page * p.pageSize - 1,
    );
    checked(result);
    if (exported && result.count > 10000)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Narrow your filters to 10,000 audit entries or fewer.",
      );
    await store.audit({
      actorId: session.user.id,
      action: exported ? "audit.exported" : "audit.viewed",
      requestId,
      targetType: "audit",
      metadata: { filters: p, count: result.count },
    });
    if (!exported) {
      sendJson(
        response,
        200,
        {
          items: result.data,
          total: result.count,
          page: p.page,
          pageSize: p.pageSize,
        },
        requestId,
      );
      return true;
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="chapter-audit.csv"',
    );
    response.write(
      "\uFEFF" +
        csvRow([
          "id",
          "actor_id",
          "action",
          "target_type",
          "target_id",
          "result",
          "request_id",
          "created_at",
        ]),
    );
    for (let offset = 0; offset < result.count; offset += 1000)
      for (const row of checked(await base().range(offset, offset + 999)))
        response.write(
          csvRow([
            row.id,
            row.actor_id,
            row.action,
            row.target_type,
            row.target_id,
            row.result,
            row.request_id,
            row.created_at,
          ]),
        );
    response.end();
    return true;
  }
  const authorization = await store.authorization(session.user.id),
    context = { user: session.user, ...authorization };
  const allowedRoutes = Object.entries(routes)
    .filter(([route, resource]) =>
      isAuthorized({ ...context, route, resource }),
    )
    .map(([route]) => route);
  const has = (resource) =>
    allowedRoutes.includes(
      Object.entries(routes).find(([, r]) => r === resource)?.[0],
    );
  const teamIds = (resource) =>
    authorization.memberships
      .filter((m) =>
        isAuthorized({
          ...context,
          resource,
          route: Object.entries(routes).find(([, r]) => r === resource)?.[0],
          teamId: m.team_id,
        }),
      )
      .map((m) => m.team_id);
  const scoped = (query, resource) =>
    ["super_admin", "admin"].includes(session.user.role)
      ? query
      : query.in("team_id", teamIds(resource));
  const work = {
    activity: async () => ({
      items: checked(
        await db
          .from("admin_actions")
          .select("id,action,result,created_at,target_type")
          .eq("actor_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(8),
      ),
    }),
    memberships: async () => ({
      items: authorization.memberships
        .filter((m) => m.team?.is_active)
        .map((m) => ({ id: m.team_id, name: m.team.name, role: m.role })),
    }),
    tasks: async () => ({
      items: checked(
        await db
          .from("communication_tasks")
          .select("id,title,status,due_date,priority")
          .eq("assigned_to_id", session.user.id)
          .neq("status", "completed")
          .order("due_date", { nullsFirst: false })
          .limit(8),
      ),
    }),
  };
  if (has("events"))
    work.events = async () => {
      const [count, upcoming] = await Promise.all([
        scoped(
          db
            .from("events")
            .select("id", { head: true, count: "exact" })
            .neq("publication_status", "archived"),
          "events",
        ),
        scoped(
          db
            .from("events")
            .select("id,title,start_at,timezone,publication_status")
            .in("publication_status", ["draft", "published"])
            .gte("start_at", new Date().toISOString()),
          "events",
        )
          .order("start_at")
          .limit(5),
      ]);
      checked(count);
      return { count: count.count, items: checked(upcoming) };
    };
  if (has("finances") || session.user.role === "team_member")
    work.finances = async () => {
      const r = checked(
        await db.rpc("list_finances", {
          p_actor: session.user.id,
          p_page: 1,
          p_filter: {},
        }),
      );
      return { pending: r.summary.awaitingApproval };
    };
  if (has("team_profiles"))
    work.profiles = async () => {
      const r = await db
        .from("team_members")
        .select("id", { head: true, count: "exact" })
        .eq("is_active", true);
      checked(r);
      return { count: r.count };
    };
  const entries = Object.entries(work),
    settled = await Promise.allSettled(entries.map(([, run]) => run()));
  const widgets = Object.fromEntries(
    entries.map(([key], i) => [
      key,
      settled[i].status === "fulfilled"
        ? { state: "ready", data: settled[i].value }
        : {
            state: "error",
            message: "This section could not load. Refresh to try again.",
          },
    ]),
  );
  sendJson(
    response,
    200,
    { allowedRoutes, widgets, generatedAt: new Date().toISOString() },
    requestId,
  );
  return true;
}
