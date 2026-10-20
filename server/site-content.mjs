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
} from "./lib/validation.mjs";
import {
  managedPublicPages,
  managedPageSections,
  pageCopyFields,
  managedSettingKeys,
} from "../shared/site-content.ts";
export const publicContentHref = z
  .string()
  .max(2000)
  .refine(
    (value) =>
      /^\/(?:events(?:\/[a-z0-9-]+)?|team|resources|sponsors|gallery|contact|privacy|accessibility)?(?:\?[A-Za-z0-9_.%=&-]{1,200})?$/.test(
        value,
      ) ||
      (value.startsWith("https://") && safeUrl.safeParse(value).success),
    "Use an approved public route or a safe HTTPS URL.",
  );
const publicInternalHref = z
  .string()
  .refine(
    (value) =>
      value.startsWith("/") && publicContentHref.safeParse(value).success,
  );
const copySchema = z
  .object(
    Object.fromEntries(
      pageCopyFields.map((key) => [
        key,
        key.endsWith("_link")
          ? publicContentHref.optional()
          : text(key === "description" ? 5000 : 1000).optional(),
      ]),
    ),
  )
  .strict();
const footerCopy = z
  .object({
    title: text(200).optional(),
    description: text(3000).optional(),
    newsletter_title: text(200).optional(),
    newsletter_description: text(1000).optional(),
    copyright: text(500).optional(),
  })
  .strict();
const links = z
  .array(
    z
      .object({
        id: z.string().regex(/^[a-z0-9_-]{1,60}$/),
        name: text(100, 1),
        url: publicContentHref,
        category: text(60, 1),
      })
      .strict(),
  )
  .max(100)
  .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length);
export const siteContentSchemas = {
  settings: z
    .object({
      key: z.enum(managedSettingKeys),
      value: z.unknown(),
      description: text(500).default(""),
    })
    .strict()
    .superRefine((row, ctx) => {
      const schema =
        row.key === "all_links"
          ? links
          : row.key === "contact_email"
            ? z.string().trim().toLowerCase().email().max(254)
            : text(row.key === "site_description" ? 3000 : 200, 1);
      if (!schema.safeParse(row.value).success)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "Check the setting value.",
        });
    }),
  pages: z
    .object({
      page_slug: z.enum(managedPublicPages),
      section_key: z.enum(managedPageSections),
      content: copySchema,
      order_index: z.number().int().min(0).max(10000).default(0),
    })
    .strict(),
  navigation: z
    .object({
      label: text(80, 1),
      href: publicInternalHref,
      icon: text(60).default(""),
      order_index: z.number().int().min(0).max(10000).default(0),
      parent_id: uuid.nullable().default(null),
    })
    .strict(),
  social: z
    .object({
      platform: z.enum([
        "github",
        "linkedin",
        "instagram",
        "youtube",
        "discord",
        "community",
      ]),
      url: safeUrl.refine((value) => !!value),
      icon: z.enum([
        "github",
        "linkedin",
        "instagram",
        "youtube",
        "discord",
        "community",
      ]),
      order_index: z.number().int().min(0).max(10000).default(0),
    })
    .strict(),
  footer: z
    .object({
      section_key: z.enum(["about", "newsletter", "copyright"]),
      content: footerCopy,
      order_index: z.number().int().min(0).max(10000).default(0),
    })
    .strict(),
};
const tables = {
  settings: "site_settings",
  pages: "page_content",
  navigation: "navigation_items",
  social: "social_links",
  footer: "footer_content",
};
export async function siteContentRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/site-content\/([^/]+)(?:\/([^/]+))?$/,
    );
  if (!match) return false;
  const kind = match[1],
    schema = siteContentSchemas[kind];
  if (!schema)
    throw new ApiError(404, "NOT_FOUND", "This collection is not available.");
  const capabilities = match[2] === "capabilities";
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
  const can = async (action) =>
    checked(
      await db.rpc("can_manage_site_content", {
        p_actor: session.user.id,
        p_action: action,
      }),
    );
  if (!(await can("read")))
    throw new ApiError(
      403,
      "FORBIDDEN",
      "You do not have access to site content.",
    );
  const actions = [];
  for (const action of ["read", "create", "update", "delete", "publish"])
    if (await can(action)) actions.push(action);
  if (capabilities) {
    sendJson(response, 200, { actions }, requestId);
    return true;
  }
  const id = match[2] ? parse(uuid, match[2]) : null;
  if (request.method === "GET") {
    const p = queryValues(
      url.searchParams,
      z
        .object({
          page: z.coerce.number().int().min(1).max(10000).default(1),
          state: z
            .enum(["current", "draft", "published", "trash"])
            .default("current"),
          q: text(100).default(""),
        })
        .strict(),
    );
    let query = db
      .from(tables[kind])
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false })
      .order("id");
    if (kind === "settings") query = query.in("key", managedSettingKeys);
    if (kind === "pages") query = query.in("page_slug", managedPublicPages);
    if (kind === "footer")
      query = query.in("section_key", ["about", "newsletter", "copyright"]);
    if (id) query = query.eq("id", id);
    query =
      p.state === "trash"
        ? query.not("deleted_at", "is", null)
        : query.is("deleted_at", null);
    if (["draft", "published"].includes(p.state))
      query = query.eq("is_active", p.state === "published");
    const label = {
      settings: "key",
      pages: "page_slug",
      navigation: "label",
      social: "platform",
      footer: "section_key",
    }[kind];
    if (p.q)
      query = query.ilike(label, "%" + p.q.replace(/[%_\\]/g, "\\$&") + "%");
    const result = await query.range((p.page - 1) * 30, p.page * 30 - 1);
    checked(result);
    sendJson(
      response,
      200,
      {
        items: result.data.map((row) => ({ ...row, actions })),
        total: result.count,
        page: p.page,
        pageSize: 30,
      },
      requestId,
    );
    return true;
  }
  const body = await jsonBody(
    request,
    id
      ? request.method === "PATCH"
        ? z
            .object({ revision: z.number().int().min(1), record: schema })
            .strict()
        : z
            .object({
              revision: z.number().int().min(1),
              action:
                request.method === "DELETE"
                  ? z.literal("archive").default("archive")
                  : z.enum(["publish", "unpublish", "restore"]),
            })
            .strict()
      : z.object({ record: schema }).strict(),
    65536,
  );
  const action = !id
    ? "create"
    : request.method === "PATCH"
      ? "update"
      : body.action;
  if (id && action === "publish") {
    const existing = checked(
      await db.from(tables[kind]).select("*").eq("id", id).maybeSingle(),
    );
    if (!existing)
      throw new ApiError(404, "NOT_FOUND", "This content was not found.");
    // Existing legacy rows do not bypass the curated contract at publication.
    const keys = {
      settings: ["key", "value", "description"],
      pages: ["page_slug", "section_key", "content", "order_index"],
      navigation: ["label", "href", "icon", "order_index", "parent_id"],
      social: ["platform", "url", "icon", "order_index"],
      footer: ["section_key", "content", "order_index"],
    }[kind];
    parse(
      schema,
      Object.fromEntries(
        keys
          .filter((key) => existing[key] !== null)
          .map((key) => [key, existing[key]]),
      ),
    );
  }
  if (
    !(await can(
      action === "archive" || action === "restore"
        ? "delete"
        : action === "unpublish"
          ? "publish"
          : action,
    ))
  )
    throw new ApiError(
      403,
      "FORBIDDEN",
      "This content action is not permitted.",
    );
  const row = checked(
    await db.rpc("mutate_site_content", {
      p_actor: session.user.id,
      p_kind: kind,
      p_id: id,
      p_action: action,
      p_revision: body.revision || null,
      p_document: body.record || {},
      p_request: requestId,
    }),
  );
  sendJson(response, 200, { record: row }, requestId);
  return true;
}
