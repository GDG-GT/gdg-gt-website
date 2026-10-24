import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  uuid,
  text,
  queryValues,
} from "./lib/validation.mjs";
import {
  token,
  validToken,
  tokenHash,
  riskHash,
  verifySecret,
  hashSecret,
} from "./lib/security.mjs";
import { encryptPayload } from "./lib/encryption.mjs";
const email = z.string().trim().toLowerCase().email().max(255),
  capability = z.string().refine(validToken);
const inspect = z.object({ token: capability, email }).strict();
const accept = inspect
  .extend({
    displayName: text(100, 2).optional(),
    newPassword: z.string().min(14).max(128).optional(),
  })
  .strict();
const password = z.string().min(1).max(128);
const create = z
  .object({
    currentPassword: password,
    email,
    role: z.enum(["member", "co_lead", "lead"]),
  })
  .strict();
const mutate = z
  .object({
    currentPassword: password,
    revision: z.number().int().positive(),
    action: z.enum(["resend", "revoke"]),
  })
  .strict();
function reply(response, data, requestId) {
  sendJson(response, 200, data, requestId);
  return true;
}
export async function teamInvitationRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    publicMatch = url.pathname.match(
      /^\/api\/v1\/account\/team-invitations\/(inspect|accept|decline)$/,
    );
  if (publicMatch) {
    allowMethod(request, response, ["POST"]);
    const quota = await store.rateLimit(
      "team-invite.public",
      riskHash(request.socket?.remoteAddress || "unknown", config.riskSecret),
      40,
      900,
    );
    if (!quota.allowed) {
      response.setHeader("Retry-After", String(quota.retryAfter));
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Please wait before trying again.",
      );
    }
    const body = await jsonBody(
        request,
        publicMatch[1] === "accept" ? accept : inspect,
        4096,
      ),
      hash = tokenHash(body.token);
    const info = checked(
      await db.rpc("describe_team_invite", {
        p_hash: hash,
        p_email: body.email,
      }),
    );
    if (!info)
      throw new ApiError(
        400,
        "INVITE_INVALID",
        "This invitation is invalid, expired or no longer available. Ask the team lead for a new link.",
      );
    if (publicMatch[1] === "inspect") return reply(response, info, requestId);
    let session = null;
    if (info.requiresSignIn) {
      session = await requireSession(request, store, config);
      await requireCsrf(request, session, store);
      if (session.user.email !== body.email)
        throw new ApiError(
          403,
          "INVITE_SIGNIN_REQUIRED",
          "Sign in with the account that received this invitation.",
        );
      if (body.newPassword || body.displayName)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "An invitation cannot change an existing account's credentials.",
        );
    } else if (
      publicMatch[1] === "accept" &&
      (!body.newPassword || !body.displayName)
    )
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Provide your name and a password of at least 14 characters.",
      );
    if (publicMatch[1] === "decline")
      return reply(
        response,
        checked(
          await db.rpc("decline_team_invite", {
            p_hash: hash,
            p_email: body.email,
            p_actor: session?.user.id || null,
            p_session: session?.sessionId || null,
            p_request_id: requestId,
          }),
        ),
        requestId,
      );
    const accepted = checked(
      await db.rpc("accept_team_invite", {
        p_hash: hash,
        p_email: body.email,
        p_actor: session?.user.id || null,
        p_session: session?.sessionId || null,
        p_name: body.displayName || null,
        p_new_hash: body.newPassword
          ? await hashSecret(body.newPassword)
          : null,
        p_request_id: requestId,
      }),
    );
    return reply(response, accepted, requestId);
  }
  const match = url.pathname.match(
    /^\/api\/v1\/admin\/teams\/([^/]+)\/invitations(?:\/([^/]+))?$/,
  );
  if (!match) return false;
  allowMethod(request, response, match[2] ? ["POST"] : ["GET", "POST"]);
  const team = parse(uuid, match[1]),
    id = match[2] ? parse(uuid, match[2]) : null,
    session = await requireSession(request, store, config);
  if (
    !checked(
      await db.rpc("can_operate_team", {
        p_actor: session.user.id,
        p_team: team,
        p_action: "manage",
      }),
    )
  )
    throw new ApiError(404, "NOT_FOUND", "This team was not found.");
  if (request.method === "GET") {
    const q = queryValues(
      url.searchParams,
      z
        .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
        .strict(),
    );
    const result = await db
      .from("team_invites")
      .select(
        "id,team_id,email,role,status,expires_at,created_at,accepted_at,last_sent_at,revision,invited_by",
        { count: "exact" },
      )
      .eq("team_id", team)
      .order("created_at", { ascending: false })
      .order("id")
      .range((q.page - 1) * 20, q.page * 20 - 1);
    const items = checked(result).map((i) => ({
      ...i,
      status:
        i.status === "pending" && new Date(i.expires_at) <= new Date()
          ? "expired"
          : i.status,
    }));
    return reply(
      response,
      {
        items,
        total: result.count,
        page: q.page,
        pageSize: 20,
        actorId: session.user.id,
        canInviteOfficers: session.user.role !== "team_member",
      },
      requestId,
    );
  }
  await requireCsrf(request, session, store);
  const quota = await store.rateLimit(
    "teams.invitations",
    riskHash(session.user.id, config.riskSecret),
    30,
    900,
  );
  if (!quota.allowed) {
    response.setHeader("Retry-After", String(quota.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Please wait before trying again.");
  }
  const body = await jsonBody(request, id ? mutate : create, 4096),
    account = await store.accountByEmail(session.user.email);
  if (!(await verifySecret(body.currentPassword, account?.password_hash))) {
    await store.recordLoginFailure(account);
    await store.audit({
      actorId: session.user.id,
      action: "teams.invite_confirmation_failed",
      requestId,
      result: "denied",
    });
    throw new ApiError(
      403,
      "PASSWORD_CONFIRMATION_FAILED",
      "Your password could not be confirmed.",
    );
  }
  let recipient = body.email;
  if (id) {
    const row = checked(
      await db
        .from("team_invites")
        .select("email")
        .eq("id", id)
        .eq("team_id", team)
        .maybeSingle(),
    );
    if (!row)
      throw new ApiError(404, "NOT_FOUND", "This invitation was not found.");
    recipient = row.email;
  }
  const raw = token(),
    result = checked(
      await db.rpc("mutate_team_invite", {
        p_actor: session.user.id,
        p_session: session.sessionId,
        p_verified_hash: account.password_hash,
        p_team: team,
        p_id: id,
        p_revision: body.revision ?? null,
        p_action: id ? body.action : "create",
        p_email: recipient,
        p_role: body.role || null,
        p_hash: tokenHash(raw),
        p_secret: encryptPayload(
          { token: raw, email: recipient },
          config.encryptionSecret,
        ),
        p_request_id: requestId,
      }),
    );
  return reply(response, { record: result }, requestId);
}
