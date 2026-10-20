import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { allowMethod, sendJson, jsonBody } from "./lib/http.mjs";
import { isAuthorized, routes } from "./lib/authorization.mjs";
import {
  queryValues,
  databaseResult as checked,
  text,
  safeUrl,
  imageUrl,
  uuid,
} from "./lib/validation.mjs";
export async function accessRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin);
  if (
    ![
      "/api/v1/admin/access",
      "/api/v1/admin/me",
      "/api/v1/admin/me/sessions",
      "/api/v1/admin/me/activity",
    ].includes(url.pathname)
  )
    return false;
  allowMethod(
    request,
    response,
    url.pathname.endsWith("/me") ? ["GET", "PATCH"] : ["GET"],
  );
  const session = await requireSession(request, store, config);
  if (url.pathname.endsWith("/sessions")) {
    const items = checked(
      await db
        .from("admin_sessions")
        .select(
          "id,created_at,last_seen_at,idle_expires_at,absolute_expires_at",
        )
        .eq("admin_user_id", session.user.id)
        .is("revoked_at", null)
        .gt("absolute_expires_at", new Date().toISOString())
        .gt("idle_expires_at", new Date().toISOString())
        .order("last_seen_at", { ascending: false })
        .limit(100),
    );
    sendJson(
      response,
      200,
      {
        items: items.map((row) => ({
          ...row,
          current: row.id === session.sessionId,
        })),
      },
      requestId,
    );
    return true;
  }
  if (url.pathname.endsWith("/activity")) {
    const items = checked(
      await db
        .from("admin_actions")
        .select("id,action,target_type,result,created_at,request_id")
        .eq("actor_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    );
    sendJson(response, 200, { items }, requestId);
    return true;
  }
  if (request.method === "PATCH") {
    await requireCsrf(request, session, store);
    const body = await jsonBody(
      request,
      z
        .object({
          display_name: text(100, 2).optional(),
          profile: z
            .object({
              name: text(100, 2),
              role: text(100, 1),
              bio: text(3000).optional(),
              imageUrl: imageUrl.optional(),
              linkedinUrl: safeUrl.optional(),
              githubUrl: safeUrl.optional(),
            })
            .strict()
            .optional(),
        })
        .strict(),
      16384,
    );
    checked(
      await db.rpc("update_own_profile", {
        p_actor: session.user.id,
        p_display_name: body.display_name || null,
        p_profile: body.profile || null,
        p_request_id: requestId,
      }),
    );
    sendJson(response, 200, { updated: true }, requestId);
    return true;
  }
  if (url.pathname.endsWith("/me")) {
    const profile = checked(
      await db
        .from("team_members")
        .select(
          "id,name,role,bio,image_url,linkedin_url,github_url,order_index,is_active",
        )
        .eq("admin_user_id", session.user.id)
        .limit(1)
        .maybeSingle(),
    );
    sendJson(
      response,
      200,
      {
        user: session.user,
        profile,
        memberships: await store.memberships(session.user.id),
      },
      requestId,
    );
    return true;
  }
  const params = queryValues(
    url.searchParams,
    z
      .object({
        route: z.string().max(100).optional(),
        resource: z.string().max(50).optional(),
        action: z.string().max(40).default("view"),
      })
      .strict(),
  );
  const { memberships, grants } = await store.authorization(session.user.id);
  const context = { user: session.user, memberships, grants };
  const accessibleRoutes = Object.entries(routes)
    .filter(([route, resource]) =>
      isAuthorized({ ...context, route, resource, action: "view" }),
    )
    .map(([route]) => route);
  if (
    session.user.role === "team_member" &&
    !accessibleRoutes.includes("/admin/forms")
  ) {
    const visible = checked(
      await db.rpc("list_forms", {
        p_actor: session.user.id,
        p_page: 1,
        p_size: 1,
        p_query: null,
        p_team: null,
        p_owner: null,
        p_state: null,
      }),
    );
    const create = checked(
      await db.rpc("can_operate_form", {
        p_actor: session.user.id,
        p_form: null,
        p_action: "create",
        p_team: null,
      }),
    );
    if (visible.total > 0 || create) accessibleRoutes.push("/admin/forms");
  }
  if (session.user.role === "blog_editor") {
    const channels = checked(
      await db.rpc("list_channels", {
        p_actor: session.user.id,
        p_page: 1,
        p_query: null,
        p_archived: false,
      }),
    );
    if (channels.total > 0) accessibleRoutes.push("/admin/channels");
  }
  const resource = params.resource || routes[params.route];
  if (
    !["super_admin", "admin"].includes(session.user.role) &&
    !accessibleRoutes.includes("/admin/whiteboard")
  ) {
    const boards = checked(
      await db.rpc("list_whiteboards", {
        p_actor: session.user.id,
        p_page: 1,
        p_query: null,
        p_deleted: false,
      }),
    );
    if (boards.total > 0) accessibleRoutes.push("/admin/whiteboard");
  }
  let allowed = params.route ? accessibleRoutes.includes(params.route) : false;
  if (params.resource)
    allowed = isAuthorized({
      ...context,
      route: params.route,
      resource,
      action: params.action,
    });
  const formRoute = params.route?.match(
    /^\/admin\/forms\/([^/]+)\/(edit|responses)$/,
  );
  if (formRoute)
    allowed =
      uuid.safeParse(formRoute[1]).success &&
      checked(
        await db.rpc("can_operate_form", {
          p_actor: session.user.id,
          p_form: formRoute[1],
          p_action: formRoute[2] === "edit" ? "edit" : "view_responses",
          p_team: null,
        }),
      );
  if (params.route?.startsWith("/admin/team/") && !routes[params.route])
    allowed =
      uuid.safeParse(params.route.split("/")[3]).success &&
      checked(
        await db.rpc("can_operate_team", {
          p_actor: session.user.id,
          p_team: params.route.split("/")[3],
          p_action: "read",
        }),
      );
  if (!params.route && !params.resource)
    sendJson(response, 200, { accessibleRoutes, grants }, requestId);
  else sendJson(response, 200, { allowed }, requestId);
  return true;
}
