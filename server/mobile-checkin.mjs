import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import { databaseResult as checked, idempotency } from "./lib/validation.mjs";
import { tokenHash, riskHash } from "./lib/security.mjs";
import { presentedCredential, parsePresentedCredential } from "../shared/card-presentation.mjs";
import { nativeEventCheckinStep } from "./reward-events.mjs";

export const fastCheckinInput = z.object({
  credential: presentedCredential,
  kind: z.enum(["activity", "event", "connection"]),
  targetId: z.string().uuid(),
  activityId: z.string().uuid().optional(),
}).strict().refine(
  value => value.kind === "event" || !value.activityId,
  "A separate activity can only be paired with a chapter event.",
);

export async function mobileCheckinRoutes(request, response, context) {
  const path = new URL(request.url, context.config.origin).pathname;
  if (path !== "/api/v1/admin/mobile/check-in") return false;
  allowMethod(request, response, ["GET", "POST"]);
  const { store, db, config, requestId } = context;
  const session = await requireSession(request, store, config);
  if (session.user.role !== "super_admin")
    throw new ApiError(403, "FORBIDDEN", "Check-in and points require a Super Admin account.");
  const quota = await store.rateLimit(
    "mobile.checkin", riskHash(session.user.id, config.riskSecret), 400, 60,
  );
  if (!quota.allowed) {
    response.setHeader("Retry-After", String(quota.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Pause scanning briefly and try again.");
  }
  if (request.method === "GET") {
    sendJson(response, 200, checked(await db.rpc("native_checkin_targets", {
      p_actor: session.user.id, p_session: session.sessionId,
    })), requestId);
    return true;
  }
  await requireCsrf(request, session, store);
  const input = await jsonBody(request, fastCheckinInput, 2048);
  const key = idempotency(request), hash = tokenHash(JSON.stringify(input));
  const proof = parsePresentedCredential(input.credential);
  let result;
  if (input.kind !== "connection") {
    result = checked(await db.rpc("native_member_checkin", {
      p_actor: session.user.id, p_session: session.sessionId,
      p_kind: input.kind, p_target: input.targetId,
      p_activity: input.activityId || null, p_hash: tokenHash(proof.credential),
      p_uid_hash: proof.uid ? tokenHash(proof.uid) : null,
      p_key_hash: tokenHash(key), p_request_hash: hash, p_request: requestId,
    }));
  } else {
    // Reuse the adapter's existing registration, recovery and deduplication protocol.
    // One client operation has separate stable receipts for its internal steps.
    const call = async (action, body) => {
      let data;
      const capture = {
        setHeader() {}, getHeader() {},
        end(value) { data = JSON.parse(value).data; },
      };
      await nativeEventCheckinStep({
        ...request, url: "/api/v1/admin/reward-events/" + action,
        method: "POST", body,
        headers: { ...request.headers, "idempotency-key": tokenHash(key + "\0" + action) },
      }, capture, context);
      return data;
    };
    const lookup = await call("lookup", { eventId: input.targetId, credential: input.credential });
    if (lookup.registration.status !== "registered" || !lookup.reviewId) {
      result = { status: lookup.registration.status, memberName: lookup.member.name, points: 0 };
    } else {
      const confirmed = await call("confirm", { reviewId: lookup.reviewId });
      const event = checked(await db.rpc("reward_event_admin", {
        p_actor: session.user.id, p_session: session.sessionId,
        p_action: "connection", p_document: { id: input.targetId },
        p_key_hash: null, p_request_hash: null,
      }));
      let points = 0;
      if (event.activity_id) {
        const credited = await call("points", { checkinId: confirmed.id });
        if (!credited.alreadyAwarded) points = credited.points || 0;
      }
      result = {
        status: points === 0 && (confirmed.alreadyCheckedIn || lookup.registration.checkedIn)
          ? "duplicate" : "checked_in",
        memberName: lookup.member.name, targetTitle: event.title, points,
      };
    }
  }
  sendJson(response, 200, result, requestId);
  return true;
}
