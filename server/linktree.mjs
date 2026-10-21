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
  linktreeCreate,
  linktreeMutation,
  linktreeUsername,
  embedUrl,
  linktreeProfile,
  linktreeLink,
} from "../shared/linktree.mjs";
async function quota(store, response, scope, key, limit, seconds = 900) {
  const r = await store.rateLimit(scope, key, limit, seconds);
  if (!r.allowed) {
    response.setHeader("Retry-After", String(r.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Please wait before trying again.");
  }
}
export async function linktreeRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    pub = url.pathname.match(
      /^\/api\/v1\/linktree\/([^/]+)(?:\/(views|links\/([^/]+)\/click))?$/,
    ),
    admin = url.pathname.match(
      /^\/api\/v1\/admin\/linktree\/(profiles|links|analytics|capabilities)(?:\/([^/]+))?$/,
    );
  if (!pub && !admin) return false;
  const reply = (data) => {
    sendJson(response, 200, data, requestId);
    return true;
  };
  if (pub) {
    allowMethod(request, response, pub[2] ? ["POST"] : ["GET"]);
    const username = parse(linktreeUsername, pub[1]);
    queryValues(url.searchParams, z.object({}).strict());
    if (!pub[2]) {
      const profile = checked(
        await db.rpc("public_linktree_profile", { p_username: username }),
      );
      if (!profile)
        throw new ApiError(404, "NOT_FOUND", "This page was not found.");
      const safeProfile = linktreeProfile.safeParse({
        username: profile.username,
        displayName: profile.displayName,
        bio: profile.bio || "",
        avatarUrl: profile.avatarUrl || "",
        background: profile.background,
        theme: profile.theme,
      });
      if (!safeProfile.success)
        throw new ApiError(404, "NOT_FOUND", "This page was not found.");
      const links = profile.links.flatMap((link) => {
        const safeLink = linktreeLink.safeParse({
          title: link.title,
          url: link.url,
          description: link.description || "",
          icon: link.icon,
          buttonStyle: link.buttonStyle,
          buttonColor: link.buttonColor,
          textColor: link.textColor,
          embedType: link.embedType,
          showClickCount: link.showClickCount,
        });
        return safeLink.success
          ? [
              {
                ...safeLink.data,
                id: link.id,
                clickCount: safeLink.data.showClickCount
                  ? link.clickCount
                  : null,
                embedUrl: embedUrl(safeLink.data.url, safeLink.data.embedType),
              },
            ]
          : [];
      });
      return reply({
        profile: {
          ...safeProfile.data,
          id: profile.id,
          links,
        },
      });
    }
    await jsonBody(request, z.object({}).strict(), 1024);
    const linkId = pub[3] ? parse(uuid, pub[3]) : null;
    const day = new Date().toISOString().slice(0, 10),
      peer = request.socket?.remoteAddress || "unknown",
      risk = riskHash(`linktree:${day}:${peer}`, config.riskSecret);
    await quota(store, response, "linktree.activity", risk, 60);
    // Rate-window keys are hashed; analytics itself stores daily aggregates only.
    await quota(
      store,
      response,
      "linktree.activity.target",
      riskHash(`${risk}:${username}:${linkId || "view"}`, config.riskSecret),
      1,
      60,
    );
    checked(
      await db.rpc("record_linktree_activity", {
        p_username: username,
        p_link: linkId,
      }),
    );
    return reply({ counted: true });
  }
  const kind = admin[1],
    id = admin[2];
  allowMethod(
    request,
    response,
    ["analytics", "capabilities"].includes(kind)
      ? ["GET"]
      : id
        ? ["GET", "POST", "PATCH"]
        : ["GET", "POST"],
  );
  const session = await requireSession(request, store, config),
    actor = session.user;
  if (!["admin", "super_admin", "team_member"].includes(actor.role))
    throw new ApiError(403, "FORBIDDEN", "This workspace is not available.");
  const can = async (team, action) =>
    checked(
      await db.rpc("can_operate_linktree", {
        p_actor: actor.id,
        p_team: team,
        p_action: action,
      }),
    );
  if (kind === "capabilities") {
    if (id)
      throw new ApiError(404, "NOT_FOUND", "This endpoint was not found.");
    queryValues(url.searchParams, z.object({}).strict());
    const globalCreate = await can(null, "create");
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
      : (await store.memberships(actor.id))
          .filter((m) => m.is_active && m.team?.is_active)
          .map((m) => ({ id: m.team_id, name: m.team.name }));
    const teams = [];
    for (const team of candidates)
      if ((await can(team.id, "create")) && (await can(team.id, "read")))
        teams.push(team);
    return reply({ globalCreate, teams });
  }
  if (kind === "analytics") {
    if (id)
      throw new ApiError(404, "NOT_FOUND", "This endpoint was not found.");
    const p = queryValues(
      url.searchParams,
      z
        .object({
          profileId: uuid,
          days: z.coerce
            .number()
            .refine((v) => [7, 30, 90].includes(v))
            .default(30),
        })
        .strict(),
    );
    return reply(
      checked(
        await db.rpc("linktree_analytics_report", {
          p_actor: actor.id,
          p_profile: p.profileId,
          p_days: p.days,
        }),
      ),
    );
  }
  if (request.method === "GET") {
    if (kind === "links" && id) {
      queryValues(url.searchParams, z.object({}).strict());
      const linkId = parse(uuid, id),
        parent = checked(
          await db
            .from("linktree_links")
            .select("profile_id")
            .eq("id", linkId)
            .maybeSingle(),
        );
      if (
        !parent ||
        !checked(
          await db.rpc("linktree_profile_projection", {
            p_actor: actor.id,
            p_id: parent.profile_id,
          }),
        )
      )
        throw new ApiError(404, "NOT_FOUND", "This link was not found.");
      return reply({
        link: checked(
          await db.rpc("linktree_link_projection", {
            p_id: linkId,
            p_public: false,
          }),
        ),
      });
    }
    if (kind === "profiles" && !id) {
      const p = queryValues(
        url.searchParams,
        z
          .object({
            q: text(100).default(""),
            page: z.coerce.number().int().min(1).max(10000).default(1),
            state: z
              .enum(["current", "active", "draft", "trash"])
              .default("current"),
          })
          .strict(),
      );
      return reply(
        checked(
          await db.rpc("list_linktree_profiles", {
            p_actor: actor.id,
            p_page: p.page,
            p_query: p.q,
            p_state: p.state,
          }),
        ),
      );
    }
    const p = queryValues(
      url.searchParams,
      z
        .object({
          ...(kind === "links" ? { profileId: uuid } : {}),
          page: z.coerce.number().int().min(1).max(10000).default(1),
          state: z.enum(["current", "trash"]).default("current"),
        })
        .strict(),
    );
    const profileId = kind === "profiles" ? parse(uuid, id) : p.profileId;
    const detail = checked(
      await db.rpc("linktree_profile_detail", {
        p_actor: actor.id,
        p_id: profileId,
        p_page: p.page,
        p_trash: p.state === "trash",
      }),
    );
    return reply(
      kind === "links"
        ? {
            items: detail.links,
            total: detail.linkTotal,
            pageSize: detail.linkPageSize,
          }
        : detail,
    );
  }
  await requireCsrf(request, session, store);
  await quota(
    store,
    response,
    "linktree.mutation",
    riskHash(actor.id, config.riskSecret),
    120,
    60,
  );
  let profileId, body;
  if (kind === "links") {
    const parsed = await jsonBody(
      request,
      z.object({ profileId: uuid, mutation: linktreeMutation }).strict(),
      32768,
    );
    profileId = parsed.profileId;
    body = parsed.mutation;
    if (
      !(body.action.startsWith("link_") || body.action === "move") ||
      (id && body.linkId !== parse(uuid, id)) ||
      (!id && body.action !== "link_create")
    )
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Choose the matching link endpoint.",
      );
  } else {
    profileId = id ? parse(uuid, id) : null;
    body = await jsonBody(
      request,
      profileId ? linktreeMutation : linktreeCreate,
      32768,
    );
  }
  const { currentPassword, ...document } = body;
  let verified = null;
  if (currentPassword !== undefined) {
    await quota(
      store,
      response,
      "linktree.confirm",
      riskHash(actor.id, config.riskSecret),
      30,
    );
    const account = await store.accountByEmail(actor.email);
    if (!(await verifySecret(currentPassword, account?.password_hash)))
      throw new ApiError(
        403,
        "PASSWORD_REQUIRED",
        "Confirm your current password.",
      );
    verified = account.password_hash;
  }
  return reply(
    checked(
      await db.rpc("mutate_linktree", {
        p_actor: actor.id,
        p_session: session.sessionId,
        p_verified_hash: verified,
        p_id: profileId,
        p_action: profileId ? document.action : "create",
        p_revision: document.revision || null,
        p_document: document,
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: tokenHash(JSON.stringify(document)),
        p_request_id: requestId,
      }),
    ),
  );
}
