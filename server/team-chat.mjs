import { teamChatSetup } from "../shared/team-chat.mjs";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import { uuid, parse, databaseResult as checked } from "./lib/validation.mjs";
import { verifySecret, riskHash } from "./lib/security.mjs";
export async function teamChatRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const match = new URL(request.url, config.origin).pathname.match(
    /^\/api\/v1\/admin\/teams\/([^/]+)\/chat$/,
  );
  if (!match) return false;
  allowMethod(request, response, ["GET", "POST"]);
  const id = parse(uuid, match[1]),
    session = await requireSession(request, store, config),
    actor = session.user;
  const read = () =>
    db
      .rpc("team_chat_workspace", { p_actor: actor.id, p_team: id })
      .then(checked);
  if (request.method === "GET") {
    sendJson(response, 200, await read(), requestId);
    return true;
  }
  await requireCsrf(request, session, store);
  const workspace = await read();
  if (!workspace.canSetUp)
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only a current team lead or administrator can set up team chat.",
    );
  const quota = await store.rateLimit(
    "teams.chat.confirm",
    riskHash(actor.id, config.riskSecret),
    5,
    900,
  );
  if (!quota.allowed) {
    response.setHeader("Retry-After", String(quota.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Please wait before trying again.");
  }
  const body = await jsonBody(request, teamChatSetup, 4096),
    account = await store.accountByEmail(actor.email);
  if (!(await verifySecret(body.currentPassword, account?.password_hash)))
    throw new ApiError(
      403,
      "PASSWORD_REQUIRED",
      "Confirm your current password.",
    );
  const result = checked(
    await db.rpc("ensure_managed_team_chat", {
      p_actor: actor.id,
      p_session: session.sessionId,
      p_verified_hash: account.password_hash,
      p_team: id,
      p_confirmation: body.confirmation,
      p_request_id: requestId,
    }),
  );
  sendJson(response, 200, result, requestId);
  return true;
}
