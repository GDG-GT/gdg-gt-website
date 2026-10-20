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
import { riskHash, tokenHash, verifySecret } from "./lib/security.mjs";

import {
  boardCreate,
  boardDocument,
  boardMutation,
} from "../shared/whiteboards.mjs";
export { boardCreate, boardDocument, boardMutation };
const metadata =
  "id,name,team_id,version,created_by,updated_by,created_at,updated_at,deleted_at";
export async function whiteboardRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/whiteboards(?:\/([^/]+))?(?:\/(export|collaborators))?$/,
    );
  if (!match) return false;
  allowMethod(request, response, match[2] ? ["GET"] : ["GET", "POST"]);
  const session = await requireSession(request, store, config),
    actor = session.user;
  const reply = (data) => {
    sendJson(response, 200, data, requestId);
    return true;
  };
  const can = async (id, action, team = null) =>
    checked(
      await db.rpc("can_operate_whiteboard", {
        p_actor: actor.id,
        p_board: id,
        p_action: action,
        p_team: team,
      }),
    );
  if (match[1] === "capabilities" && !match[2]) {
    allowMethod(request, response, ["GET"]);
    const globalCreate = ["super_admin", "admin"].includes(actor.role),
      memberships = await store.memberships(actor.id);
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
      : memberships
          .filter((m) => m.team?.is_active)
          .map((m) => ({ id: m.team_id, name: m.team.name }));
    const teams = [];
    for (const team of candidates)
      if (globalCreate || (await can(null, "create", team.id)))
        teams.push(team);
    return reply({ globalCreate, teams });
  }
  const id = match[1] ? parse(uuid, match[1]) : null;
  if (request.method === "GET") {
    if (!id) {
      const q = queryValues(
        url.searchParams,
        z
          .object({
            page: z.coerce.number().int().min(1).max(10000).default(1),
            q: text(100).default(""),
            archived: z.enum(["0", "1"]).default("0"),
          })
          .strict(),
      );
      return reply(
        checked(
          await db.rpc("list_whiteboards", {
            p_actor: actor.id,
            p_page: q.page,
            p_query: q.q,
            p_deleted: q.archived === "1",
          }),
        ),
      );
    }
    if (!(await can(id, match[2] === "export" ? "export" : "read")))
      throw new ApiError(404, "NOT_FOUND", "This board was not found.");
    if (match[2] === "collaborators") {
      if (!(await can(id, "manage")))
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Only board managers can inspect access.",
        );
      const q = queryValues(
        url.searchParams,
        z
          .object({
            page: z.coerce.number().int().min(1).max(10000).default(1),
          })
          .strict(),
      );
      const r = await db
        .from("whiteboard_collaborators")
        .select(
          "user_id,role,created_at,user:admin_users!whiteboard_collaborators_user_id_fkey(display_name,email)",
          { count: "exact" },
        )
        .eq("board_id", id)
        .eq("is_active", true)
        .order("created_at")
        .order("user_id")
        .range((q.page - 1) * 30, q.page * 30 - 1);
      return reply({ items: checked(r), total: r.count });
    }
    const record = checked(
      await db
        .from("whiteboards")
        .select(metadata + ",document")
        .eq("id", id)
        .single(),
    );
    const document = parse(
      boardDocument,
      record.document || {
        elements: [],
        appState: { viewBackgroundColor: "#f2f3f5" },
      },
    );
    if (match[2] === "export") {
      checked(
        await db.from("admin_actions").insert({
          actor_id: actor.id,
          action: "whiteboards.export",
          target_type: "whiteboard",
          target_id: id,
          request_id: requestId,
          metadata: { version: record.version },
        }),
      );
      return reply({
        name: record.name,
        document: {
          type: "excalidraw",
          version: 2,
          source: config.origin,
          elements: document.elements,
          appState: document.appState,
          files: {},
        },
      });
    }
    return reply({
      record: { ...record, document },
      actions: checked(
        await db.rpc("whiteboard_metadata", { p_actor: actor.id, p_board: id }),
      ).actions,
    });
  }
  await requireCsrf(request, session, store);
  const limit = await store.rateLimit(
    "whiteboards.write",
    riskHash(actor.id, config.riskSecret),
    180,
    60,
  );
  if (!limit.allowed) {
    response.setHeader("Retry-After", String(limit.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Please wait before saving again.");
  }
  const body = await jsonBody(
      request,
      id ? boardMutation : boardCreate,
      2100000,
    ),
    key = idempotency(request);
  let document = body,
    verifiedHash = null;
  if (id) {
    if (!(await can(id, "read")))
      throw new ApiError(404, "NOT_FOUND", "This board was not found.");
    const record = checked(
      await db.from("whiteboards").select(metadata).eq("id", id).single(),
    );
    if (
      ["archive", "restore"].includes(body.action) &&
      body.confirmation !== record.name
    )
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Type the board name to confirm.",
      );
    if (["share", "unshare"].includes(body.action)) {
      if (!(await can(id, "manage")))
        throw new ApiError(403, "FORBIDDEN", "Board sharing is restricted.");
      const confirmation = await store.rateLimit(
        "whiteboards.confirm",
        riskHash(actor.id, config.riskSecret),
        5,
        900,
      );
      if (!confirmation.allowed) {
        response.setHeader("Retry-After", String(confirmation.retryAfter));
        throw new ApiError(
          429,
          "RATE_LIMITED",
          "Please wait before confirming access again.",
        );
      }
      const user = await store.accountByEmail(actor.email);
      if (!(await verifySecret(body.currentPassword, user.password_hash)))
        throw new ApiError(
          403,
          "PASSWORD_REQUIRED",
          "Confirm your current password.",
        );
      verifiedHash = user.password_hash;
      document = { email: body.email, role: body.role };
    } else
      document =
        body.action === "save"
          ? body.document
          : body.action === "rename"
            ? { name: body.name }
            : {};
  }
  return reply({
    record: checked(
      await db.rpc("mutate_whiteboard", {
        p_actor: actor.id,
        p_session: session.sessionId,
        p_verified_hash: verifiedHash,
        p_id: id,
        p_action: id ? body.action : "create",
        p_version: id ? body.version : null,
        p_updated_at: id ? body.updatedAt : null,
        p_document: document,
        p_key_hash: tokenHash(key),
        p_request_hash: tokenHash(
          JSON.stringify({ ...body, currentPassword: undefined }),
        ),
        p_request_id: requestId,
      }),
    ),
  });
}
