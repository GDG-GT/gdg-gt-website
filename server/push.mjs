import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import { databaseResult as checked, queryValues } from "./lib/validation.mjs";
import { token, tokenHash, riskHash } from "./lib/security.mjs";
import { encryptPayload } from "./lib/encryption.mjs";
import { pushConfig, validatePushSubscription } from "./lib/push-transport.mjs";
import {
  pushDeviceAction,
  pushSubscribe,
  pushVerificationRequest,
  pushVerificationProof,
} from "../shared/push.mjs";
export async function pushRoutes(
  request,
  response,
  { db, store, config, requestId, env = process.env },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/push\/(config|verify-registration|inspect-verification|subscribe|status|unsubscribe)$/,
    );
  if (!match) return false;
  const action = match[1];
  allowMethod(request, response, action === "config" ? ["GET"] : ["POST"]);
  queryValues(url.searchParams, z.object({}).strict());
  const settings = pushConfig(env);
  if (action === "config") {
    sendJson(
      response,
      200,
      {
        enabled: settings.enabled,
        deliveryEnabled: settings.deliveryEnabled,
        ...(settings.enabled ? { publicKey: settings.publicKey } : {}),
      },
      requestId,
    );
    return true;
  }
  // Status/unsubscribe remain available if delivery is disabled later.
  if (!settings.enabled && !["status", "unsubscribe"].includes(action))
    throw new ApiError(
      503,
      "PUSH_DISABLED",
      "Event reminders are not available yet.",
    );
  const network = request.socket?.remoteAddress || "unknown",
    limit = action === "verify-registration" ? 5 : 100;
  const rate = await store.rateLimit(
    "push." + action,
    riskHash(network, config.riskSecret),
    limit,
    900,
  );
  if (!rate.allowed)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Wait before trying event reminders again.",
    );
  if (action === "verify-registration") {
    const body = await jsonBody(request, pushVerificationRequest, 2048);
    if (!body.website) {
      const proof = token();
      checked(
        await db.rpc("request_event_push_verification", {
          p_slug: body.slug,
          p_email_hash: tokenHash(body.email),
          p_token_hash: tokenHash(proof),
          p_secret: encryptPayload({ token: proof }, config.encryptionSecret),
        }),
      );
    }
    sendJson(
      response,
      200,
      {
        accepted: true,
        message:
          "If this address has a current registration, a private verification link will be emailed. Check your inbox; the link expires in 24 hours.",
      },
      requestId,
    );
    return true;
  }
  if (action === "inspect-verification") {
    const body = await jsonBody(request, pushVerificationProof, 1024);
    sendJson(
      response,
      200,
      checked(
        await db.rpc("inspect_event_push_verification", {
          p_token_hash: tokenHash(body.token),
        }),
      ),
      requestId,
    );
    return true;
  }
  const body = await jsonBody(
      request,
      action === "subscribe" ? pushSubscribe : pushDeviceAction,
      10000,
    ),
    subscription = validatePushSubscription(body.subscription);
  let actor = null,
    sid = null;
  if (action === "subscribe" && !body.registrationToken) {
    const session = await requireSession(request, store, config);
    await requireCsrf(request, session, store);
    actor = session.user.id;
    sid = session.sessionId;
  }
  sendJson(
    response,
    200,
    checked(
      await db.rpc("mutate_push_subscription", {
        p_actor: actor,
        p_session: sid,
        p_token_hash: body.registrationToken
          ? tokenHash(body.registrationToken)
          : null,
        p_event: body.eventId,
        p_endpoint_hash: tokenHash(subscription.endpoint),
        p_management_hash: riskHash(
          subscription.endpoint + "\0" + subscription.keys.auth,
          config.riskSecret,
        ),
        p_encrypted:
          action === "subscribe"
            ? encryptPayload(subscription, config.encryptionSecret)
            : null,
        p_action: action,
        p_request_id: requestId,
      }),
    ),
    requestId,
  );
  return true;
}
