import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import { uuid, databaseResult as checked } from "./lib/validation.mjs";
import { riskHash } from "./lib/security.mjs";
import {
  realtimeConfiguration,
  signRealtimeGrant,
} from "./lib/realtime-token.mjs";
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("channel"), id: uuid }).strict(),
  z.object({ kind: z.literal("notifications") }).strict(),
]);
export async function realtimeRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  if (
    !["/api/v1/auth/realtime-token", "/api/v1/realtime/token"].includes(
      new URL(request.url, config.origin).pathname,
    )
  )
    return false;
  allowMethod(request, response, ["POST"]);
  const session = await requireSession(request, store, config);
  await requireCsrf(request, session, store);
  const limit = await store.rateLimit(
    "realtime.issue",
    riskHash(session.user.id, config.riskSecret),
    100,
    900,
  );
  if (!limit.allowed) {
    response.setHeader("Retry-After", String(limit.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Please wait before reconnecting.");
  }
  const body = await jsonBody(request, schema, 2048),
    transport = realtimeConfiguration();
  const grant = checked(
    await db.rpc("issue_realtime_grant", {
      p_actor: session.user.id,
      p_session: session.sessionId,
      p_kind: body.kind,
      p_target: body.kind === "channel" ? body.id : session.user.id,
      p_request_id: requestId,
    }),
  );
  const token = signRealtimeGrant(
    transport,
    grant,
    session.user.id,
    session.sessionId,
    config.origin + "/api/v1/realtime",
  );
  sendJson(
    response,
    200,
    {
      token,
      expiresAt: grant.expiresAt,
      topic: grant.topic,
      url: transport.url,
      key: transport.key,
    },
    requestId,
  );
  return true;
}
