import { z } from "zod";
import { ApiError, allowMethod } from "./lib/http.mjs";
import {
  databaseResult as checked,
  queryValues,
  text,
  uuid,
} from "./lib/validation.mjs";
import { publicJson as cachedPublicJson } from "./events.mjs";
// Mutable CMS projections must reach the database before a conditional 304.
// Shared caches cannot serve an older publication through a stale TTL window.
const publicJson = (request, response, data, requestId) =>
  cachedPublicJson(request, response, data, requestId, { revalidate: true });
const publicPages = [
  "home",
  "events",
  "team",
  "resources",
  "sponsors",
  "gallery",
  "contact",
];
const publicHref = (value) =>
  typeof value === "string" &&
  /^\/(?:events(?:\/[a-z0-9-]+)?|team|resources|sponsors|gallery|contact|privacy|accessibility)?$/.test(
    value,
  );
const select = {
  team: {
    table: "team_members",
    columns:
      "id,name,role,bio,image_url,linkedin_url,github_url,order_index,team_section",
    order: "order_index",
  },
  resources: {
    table: "resources",
    columns:
      "id,title,description,type,category,url,duration,level,status,provider,amount,requirements,materials,tags,speaker,views,icon,color,order_index",
    order: "order_index",
  },
  sponsors: {
    table: "sponsors",
    columns: "id,name,logo_url,website_url,tier,order_index",
    order: "order_index",
  },
  "sponsor-tiers": {
    table: "sponsorship_tiers",
    columns:
      "id,tier_name,tier_level,amount,color_gradient,benefits,order_index",
    order: "order_index",
  },
  "sponsor-stats": {
    table: "sponsor_impact_stats",
    columns: "id,stat_label,stat_value,stat_description,icon_name,order_index",
    order: "order_index",
  },
};
export async function readPublicHome(db) {
    const [
      settings,
      navigation,
      footer,
      pages,
      social,
      events,
      team,
      sponsors,
      metrics,
    ] = await Promise.all([
      db
        .from("site_settings")
        .select("key,value")
        .eq("is_active", true)
        .is("deleted_at", null)
        .in("key", [
          "site_title",
          "site_subtitle",
          "site_description",
          "contact_email",
          "all_links",
        ]),
      db
        .from("navigation_items")
        .select("id,label,href,order_index,parent_id")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("order_index"),
      db
        .from("footer_content")
        .select("section_key,content")
        .eq("is_active", true)
        .is("deleted_at", null),
      db
        .from("page_content")
        .select("page_slug,section_key,content,order_index")
        .eq("is_active", true)
        .is("deleted_at", null)
        .in("page_slug", publicPages)
        .order("order_index"),
      db
        .from("social_links")
        .select("platform,url,icon")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("order_index"),
      db
        .from("events")
        .select(
          "id,title,slug,short_description,start_at,end_at,timezone,location,image_url,type,level,registration_enabled,registration_type,publication_status,is_featured",
        )
        .eq("publication_status", "published")
        .gte("start_at", new Date().toISOString())
        .order("start_at")
        .limit(3),
      db
        .from("team_members")
        .select(select.team.columns)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("order_index")
        .order("id")
        .limit(6),
      db
        .from("sponsors")
        .select(select.sponsors.columns)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("order_index")
        .order("id")
        .limit(12),
      db
        .from("sponsor_impact_stats")
        .select(
          "id,stat_label,stat_value,stat_description,icon_name,order_index",
        )
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("order_index")
        .order("id")
        .limit(4),
    ]);
    for (const result of [
      settings,
      navigation,
      footer,
      pages,
      social,
      events,
      team,
      sponsors,
      metrics,
    ])
      checked(result);
  return {
        settings: settings.data,
        navigation: navigation.data.filter(
          (item) =>
            publicHref(item.href) &&
            (!item.parent_id ||
              navigation.data.some(
                (parent) =>
                  parent.id === item.parent_id &&
                  !parent.parent_id &&
                  publicHref(parent.href),
              )),
        ),
        footer: footer.data.filter(
          (item) =>
            !["blog", "projects", "admin", "security"].includes(
              item.section_key,
            ),
        ),
        pages: pages.data,
        social: social.data,
        events: events.data,
        team: team.data,
        sponsors: sponsors.data,
        metrics: metrics.data,
      };
}
export async function publicContentRoutes(
  request,
  response,
  { db, config, requestId, store },
) {
  const url = new URL(request.url, config.origin),
    resource = url.pathname.replace("/api/v1/", "");
  if (resource === "public/home") {
    allowMethod(request, response, ["GET"]);
    publicJson(request, response, await readPublicHome(db), requestId);
    return true;
  }
  if (select[resource]) {
    allowMethod(request, response, ["GET"]);
    const p = queryValues(
      url.searchParams,
      z
        .object({
          page: z.coerce.number().int().min(1).max(10000).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(50),
          q: text(100).optional(),
          type: text(50).optional(),
          level: text(30).optional(),
          status: text(50).optional(),
          tag: text(100).optional(),
        })
        .strict(),
    );
    const spec = select[resource];
    if (resource === "sponsors") {
      publicJson(
        request,
        response,
        checked(
          await db.rpc("read_public_sponsor_library", {
            p_page: p.page,
            p_size: p.pageSize,
            p_query: p.q || null,
          }),
        ),
        requestId,
      );
      return true;
    }
    let query = db
      .from(spec.table)
      .select(spec.columns, { count: "exact" })
      .eq("is_active", true)
      .is("deleted_at", null)
      .order(spec.order)
      .order("id");
    if (p.q)
      query = query.ilike(
        resource === "team" || resource === "sponsors"
          ? "name"
          : resource === "sponsor-tiers"
            ? "tier_name"
            : resource === "sponsor-stats"
              ? "stat_label"
              : "title",
        "%" + p.q.replace(/[%_\\]/g, "\\$&") + "%",
      );
    if (resource === "resources") {
      for (const k of ["type", "level", "status"])
        if (p[k]) query = query.eq(k, p[k]);
      if (p.tag) query = query.contains("tags", [p.tag]);
    }
    const result = await query.range(
      (p.page - 1) * p.pageSize,
      p.page * p.pageSize - 1,
    );
    checked(result);
    publicJson(
      request,
      response,
      {
        items: result.data,
        page: p.page,
        pageSize: p.pageSize,
        total: result.count,
      },
      requestId,
    );
    return true;
  }
  if (resource === "sponsors/tiers" || resource === "sponsors/impact-stats") {
    allowMethod(request, response, ["GET"]);
    const tiers = resource.endsWith("tiers");
    const items = checked(
      await db
        .from(tiers ? "sponsorship_tiers" : "sponsor_impact_stats")
        .select(
          tiers
            ? "id,tier_name,tier_level,amount,color_gradient,benefits,order_index"
            : "id,stat_label,stat_value,stat_description,icon_name,order_index",
        )
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("order_index")
        .order("id"),
    );
    publicJson(request, response, { items }, requestId);
    return true;
  }
  if (resource === "gallery") {
    allowMethod(request, response, ["GET"]);
    const p = queryValues(
      url.searchParams,
      z
        .object({
          event: uuid.optional(),
          page: z.coerce.number().int().min(1).max(10000).default(1),
        })
        .strict(),
    );
    const result = checked(
      await db.rpc("read_public_gallery", {
        p_event: p.event ?? null,
        p_page: p.page,
      }),
    );
    publicJson(
      request,
      response,
      {
        items: result.items.map((row) => ({
          ...row,
          url: "/api/v1/media/public/" + row.id,
          srcSet: [360, 960, 1920]
            .map(
              (width) =>
                `/api/v1/media/public/${row.id}?width=${width} ${Math.min(width, row.width)}w`,
            )
            .filter(
              (value, index, all) =>
                all.findIndex(
                  (v) => v.split(" ").at(-1) === value.split(" ").at(-1),
                ) === index,
            )
            .join(", "),
          downloadUrl: row.allow_download
            ? `/api/v1/media/public/${row.id}?width=1920&download=true`
            : null,
        })),
        page: p.page,
        pageSize: 30,
        total: result.total,
        events: (result.events || []).map(({ id, title }) => ({ id, title })),
      },
      requestId,
    );
    return true;
  }
  const view = resource.match(/^resources\/([^/]+)\/view$/);
  if (view) {
    allowMethod(request, response, ["POST"]);
    if (!uuid.safeParse(view[1]).success)
      throw new ApiError(404, "NOT_FOUND", "This resource was not found.");
    const { riskHash } = await import("./lib/security.mjs");
    const limit = await store.rateLimit(
      "resource.view",
      riskHash(
        (request.socket?.remoteAddress || "unknown") + ":" + view[1],
        config.riskSecret,
      ),
      1,
      60,
    );
    if (limit.allowed)
      checked(
        await db.rpc("increment_resource_views", { p_resource_id: view[1] }),
      );
    response.statusCode = 204;
    response.end();
    return true;
  }
  return false;
}
