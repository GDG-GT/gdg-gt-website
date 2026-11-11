import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  uuid,
  queryValues,
  idempotency,
} from "./lib/validation.mjs";
import { riskHash, token, tokenHash } from "./lib/security.mjs";
import { encryptPayload } from "./lib/encryption.mjs";
import {
  newsletterList,
  subscriberCreate,
  subscriberMutation,
  templateCreate,
  templateMutation,
  campaignCreate,
  campaignMutation,
  newsletterPreview,
} from "../shared/newsletter.mjs";
export async function newsletterRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/newsletter\/(capabilities|subscribers|templates|campaigns)(?:\/([^/]+))?(?:\/(preview))?$/,
    );
  if (!match) return false;
  const kind = match[1],
    id = match[2] ? parse(uuid, match[2]) : null,
    preview = !!match[3];
  if (
    (kind === "capabilities" && id) ||
    (preview && (!id || kind === "subscribers"))
  )
    throw new ApiError(404, "NOT_FOUND", "This endpoint was not found.");
  allowMethod(
    request,
    response,
    kind === "capabilities" || preview
      ? ["GET"]
      : id
        ? ["GET", "POST"]
        : ["GET", "POST"],
  );
  const session = await requireSession(request, store, config),
    args = { p_actor: session.user.id, p_session: session.sessionId };
  if (request.method === "POST") await requireCsrf(request, session, store);
  const rate = await store.rateLimit(
    request.method === "GET" ? "newsletter.read" : "newsletter.write",
    riskHash(session.user.id, config.riskSecret),
    request.method === "GET" ? 600 : 80,
    900,
  );
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfter));
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Wait before making more newsletter requests.",
    );
  }
  const reply = (data) => {
    sendJson(response, 200, data, requestId);
    return true;
  };
  if (kind === "capabilities") {
    queryValues(url.searchParams, z.object({}).strict());
    const actor = session.user.id,
      can = async (team, action) =>
        checked(
          await db.rpc("can_operate_newsletter", {
            p_actor: actor,
            p_team: team,
            p_action: action,
          }),
        ),
      chapterRead = await can(null, "read"),
      candidates = chapterRead
        ? checked(
            await db
              .from("admin_teams")
              .select("id,name")
              .eq("is_active", true)
              .is("deleted_at", null)
              .order("name")
              .limit(100),
          )
        : (await store.memberships(actor))
            .filter((m) => m.is_active && m.team?.is_active)
            .map((m) => ({ id: m.team_id, name: m.team.name })),
      teams = [];
    for (const team of candidates)
      if (await can(team.id, "read"))
        teams.push({
          ...team,
          canCreate: await can(team.id, "create"),
          canSend: await can(team.id, "send_email"),
        });
    if (!chapterRead && !teams.length)
      throw new ApiError(404, "NOT_FOUND", "This workspace was not found.");
    return reply({
      chapterRead,
      chapterCreate: await can(null, "create"),
      chapterSend: await can(null, "send_email"),
      teams,
    });
  }
  if (request.method === "GET") {
    const values = queryValues(
        url.searchParams,
        id ? z.object({}).strict() : newsletterList,
      ),
      { team, page, ...rest } = values;
    const result = checked(
      await db.rpc("read_newsletter_workspace", {
        ...args,
        p_kind: kind,
        p_id: id,
        p_filters: {
          ...rest,
          ...(team !== undefined
            ? { teamId: team === "chapter" ? null : team }
            : {}),
        },
        p_page: page ?? 1,
      }),
    );
    if (preview)
      return reply({
        subject: result.record.subject || result.record.name,
        text: result.record.content,
        html: newsletterPreview(
          result.record.subject || result.record.name,
          result.record.content,
        ),
        revision: result.record.revision,
      });
    return reply(result);
  }
  queryValues(url.searchParams, z.object({}).strict());
  const schema =
      kind === "subscribers"
        ? id
          ? subscriberMutation
          : subscriberCreate
        : kind === "templates"
          ? id
            ? templateMutation
            : templateCreate
          : id
            ? campaignMutation
            : campaignCreate,
    body = await jsonBody(request, schema, 131072),
    { action, revision, ...document } = body;
  const key = tokenHash(`${session.user.id}:${idempotency(request)}`),
    hash = tokenHash(JSON.stringify(body));
  if (kind === "subscribers" && !id) {
    const secret = token();
    document.tokenHash = tokenHash(secret);
    document.secretPayload = encryptPayload(
      { token: secret, source: "admin_invitation" },
      config.encryptionSecret,
    );
  }
  return reply(
    checked(
      await db.rpc("mutate_newsletter_record", {
        ...args,
        p_kind: kind,
        p_id: id,
        p_action: id ? action : "create",
        p_revision: revision ?? null,
        p_document: document,
        p_key_hash: key,
        p_request_hash: hash,
        p_request_id: requestId,
      }),
    ),
  );
}
