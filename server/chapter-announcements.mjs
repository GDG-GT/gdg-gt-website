import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  uuid,
  text,
  parse,
  queryValues,
  idempotency,
  databaseResult as checked,
} from "./lib/validation.mjs";
import { riskHash, tokenHash, verifySecret } from "./lib/security.mjs";
import {
  chapterAnnouncementCreate,
  chapterAnnouncementAction,
  chapterAnnouncementPreview,
  chapterAnnouncementConfirm,
} from "../shared/announcements.mjs";
export async function chapterAnnouncementRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/communications\/announcements(?:\/([^/]+))?(?:\/(preview|confirm))?$/,
    );
  if (!match) return false;
  allowMethod(request, response, match[2] ? ["POST"] : ["GET", "POST"]);
  const session = await requireSession(request, store, config),
    actor = session.user,
    manager = ["super_admin", "admin"].includes(actor.role);
  const reply = (data) => {
    sendJson(response, 200, data, requestId);
    return true;
  };
  async function quota(scope, limit, seconds = 60) {
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
  }
  if (match[1] === "capabilities" && !match[2]) {
    allowMethod(request, response, ["GET"]);
    return reply({
      canManage: manager,
      teams: manager
        ? checked(
            await db
              .from("admin_teams")
              .select("id,name")
              .eq("is_active", true)
              .is("deleted_at", null)
              .order("name")
              .limit(100),
          )
        : [],
    });
  }
  const id = match[1] ? parse(uuid, match[1]) : null;
  if (request.method === "GET") {
    await quota("announcements.read", 240);
    if (!id) {
      const q = queryValues(
        url.searchParams,
        z
          .object({
            page: z.coerce.number().int().min(1).max(10000).default(1),
            q: text(100).default(""),
            state: z
              .enum([
                "feed",
                "all",
                "Draft",
                "Scheduled",
                "Published",
                "Expired",
                "Archived",
              ])
              .default("feed"),
          })
          .strict(),
      );
      return reply(
        checked(
          await db.rpc("list_chapter_announcements", {
            p_actor: actor.id,
            p_page: q.page,
            p_query: q.q,
            p_state: q.state,
          }),
        ),
      );
    }
    queryValues(url.searchParams, z.object({}).strict());
    const record = checked(
      await db.rpc("chapter_announcement_projection", {
        p_actor: actor.id,
        p_id: id,
      }),
    );
    if (!record)
      throw new ApiError(404, "NOT_FOUND", "This announcement was not found.");
    return reply({ record });
  }
  await requireCsrf(request, session, store);
  await quota("announcements.write", 100);
  const scope = {
    p_actor: actor.id,
    p_session: session.sessionId,
    p_id: id,
    p_request_id: requestId,
  };
  if (match[2]) {
    if (!manager)
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Chapter publishing is restricted to administrators. Team announcements remain in the Teams workspace.",
      );
    const body = await jsonBody(
      request,
      match[2] === "preview"
        ? chapterAnnouncementPreview
        : chapterAnnouncementConfirm,
      4096,
    );
    if (match[2] === "preview") {
      await quota("announcements.preview", 20, 900);
      return reply(
        checked(
          await db.rpc("preview_chapter_announcement", {
            ...scope,
            p_revision: body.revision,
          }),
        ),
      );
    }
    await quota("announcements.confirm", 5, 900);
    const account = await store.accountByEmail(actor.email);
    if (!(await verifySecret(body.currentPassword, account?.password_hash)))
      throw new ApiError(
        403,
        "PASSWORD_REQUIRED",
        "Confirm your current password.",
      );
    const key = idempotency(request);
    return reply(
      checked(
        await db.rpc("confirm_chapter_announcement", {
          ...scope,
          p_verified_hash: account.password_hash,
          p_revision: body.revision,
          p_preview: body.previewId,
          p_confirmation: body.confirmation,
          p_key_hash: tokenHash(key),
          // Passwords must never be copied into stored idempotency records.
          p_request_hash: tokenHash(
            JSON.stringify({
              revision: body.revision,
              previewId: body.previewId,
              confirmation: body.confirmation,
            }),
          ),
        }),
      ),
    );
  }
  const body = await jsonBody(
    request,
    id ? chapterAnnouncementAction : chapterAnnouncementCreate,
    65536,
  );
  if ((!id || body.action !== "read") && !manager)
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Chapter announcement changes are restricted.",
    );
  if (
    id &&
    ["archive", "restore", "cancel_schedule", "unpublish"].includes(body.action)
  ) {
    const record = checked(
      await db.rpc("chapter_announcement_projection", {
        p_actor: actor.id,
        p_id: id,
      }),
    );
    if (!record)
      throw new ApiError(404, "NOT_FOUND", "This announcement was not found.");
    if (body.confirmation !== record.title)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Type the announcement title to confirm.",
      );
  }
  const key = idempotency(request);
  return reply(
    checked(
      await db.rpc("mutate_chapter_announcement", {
        ...scope,
        p_action: id ? body.action : "create",
        p_revision: body.revision || null,
        p_document: body.record || body,
        p_key_hash: tokenHash(key),
        p_request_hash: tokenHash(JSON.stringify(body)),
      }),
    ),
  );
}
