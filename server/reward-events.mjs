import { parsePresentedCredential } from "../shared/card-presentation.mjs";
import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import { databaseResult as checked, idempotency } from "./lib/validation.mjs";
import { token, tokenHash, riskHash, readCookie } from "./lib/security.mjs";
import { encryptPayload, decryptPayload } from "./lib/encryption.mjs";
import { eventAdminInputs } from "../shared/reward-events.mjs";
import { eventAdapterRequest } from "./reward-event-transport.mjs";
const id = z.string().uuid();
export async function rewardEventRoutes(
  request,
  response,
  { db, store, config, requestId, adapter = eventAdapterRequest },
) {
  const path = new URL(request.url, config.origin).pathname;
  if (
    !path.startsWith("/api/v1/admin/reward-events") &&
    !path.startsWith("/api/v1/rewards/event-links") &&
    !path.startsWith("/api/v1/integrations/membership/")
  )
    return false;
  const reply = (data) => {
    sendJson(response, 200, data, requestId);
    return true;
  };
  const risk = riskHash(
    String(
      request.socket?.remoteAddress ||
        request.headers["x-real-ip"] ||
        "unknown",
    ),
    config.riskSecret,
  );
  const quota = await store.rateLimit("reward-events", risk, 120, 60);
  if (!quota.allowed)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Too many requests. Try again shortly.",
    );
  if (path.startsWith("/api/v1/integrations/membership/")) {
    allowMethod(request, response, ["POST"]);
    // Integration keys are exclusively server-to-server, never browser cookies/CORS.
    if (
      request.headers.origin ||
      request.headers.cookie ||
      request.headers["sec-fetch-site"]
    )
      throw new ApiError(403, "FORBIDDEN", "Use a server-to-server request.");
    const auth = /^Bearer ([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(
      request.headers.authorization || "",
    );
    if (!auth || !id.safeParse(auth[1]).success)
      throw new ApiError(
        401,
        "UNAUTHENTICATED",
        "A valid event credential is required.",
      );
    const action = path.slice("/api/v1/integrations/membership/".length);
    let d;
    if (action === "redeem") {
      const input = await jsonBody(
        request,
        z
          .object({
            code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
            accountId: z.string().min(1).max(120),
          })
          .strict(),
        1024,
      );
      d = {
        codeHash: tokenHash(input.code),
        accountHash: tokenHash(auth[1] + "\0" + input.accountId),
      };
    } else if (action === "verify")
      d = await jsonBody(request, z.object({ memberRef: id }).strict(), 1024);
    else
      throw new ApiError(
        404,
        "NOT_FOUND",
        "This integration action was not found.",
      );
    return reply(
      checked(
        await db.rpc("reward_event_external", {
          p_event: auth[1],
          p_key_hash: tokenHash(auth[2]),
          p_action: action === "verify" ? "membership" : "redeem",
          p_document: d,
        }),
      ),
    );
  }
  if (path.startsWith("/api/v1/rewards/event-links")) {
    const raw = readCookie(
      request.headers.cookie,
      config.secureCookies ? "__Host-gdg_rewards" : "gdg_dev_rewards",
    );
    if (!raw)
      throw new ApiError(
        401,
        "AUTH_REQUIRED",
        "Sign in with Georgia Tech first.",
      );
    if (path === "/api/v1/rewards/event-links" && request.method === "GET")
      return reply(
        checked(
          await db.rpc("reward_event_member", {
            p_hash: tokenHash(raw),
            p_csrf: null,
            p_action: "list",
            p_document: {},
          }),
        ),
      );
    allowMethod(request, response, ["POST"]);
    const action = path.split("/").at(-1);
    if (!["code", "unlink"].includes(action))
      throw new ApiError(404, "NOT_FOUND", "This action was not found.");
    const csrf = readCookie(
      request.headers.cookie,
      config.secureCookies ? "__Host-gdg_rewards_csrf" : "gdg_dev_rewards_csrf",
    );
    if (!csrf || request.headers["x-rewards-csrf"] !== csrf)
      throw new ApiError(
        403,
        "CSRF_INVALID",
        "Reload your membership and try again.",
      );
    const input = await jsonBody(
        request,
        z.object({ eventId: id }).strict(),
        1024,
      ),
      code = token();
    const result = checked(
      await db.rpc("reward_event_member", {
        p_hash: tokenHash(raw),
        p_csrf: tokenHash(csrf),
        p_action: action,
        p_document: {
          ...input,
          ...(action === "code"
            ? {
                tokenHash: tokenHash(code),
                encryptedCode: encryptPayload(
                  { code },
                  config.encryptionSecret,
                ),
              }
            : {}),
        },
      }),
    );
    if (action === "code")
      return reply({
        code: decryptPayload(result.encryptedCode, config.encryptionSecret)
          .code,
        expiresAt: result.expiresAt,
      });
    return reply(result);
  }
  const session = await requireSession(request, store, config);
  if (session.user.role !== "super_admin")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only Super Admins can manage event connections.",
    );
  const rpc = async (action, d, key, hash) =>
    checked(
      await db.rpc("reward_event_admin", {
        p_actor: session.user.id,
        p_session: session.sessionId,
        p_action: action,
        p_document: d,
        p_key_hash: key || null,
        p_request_hash: hash || null,
      }),
    );
  if (path === "/api/v1/admin/reward-events" && request.method === "GET")
    return reply(await rpc("list", {}));
  allowMethod(request, response, ["POST"]);
  await requireCsrf(request, session, store);
  const action = path.split("/").at(-1);
  if (action === "health") {
    const input = await jsonBody(request, z.object({ id }).strict(), 1024);
    const event = await rpc("connection", { id: input.id });
    const secret = decryptPayload(
      event.encrypted_key,
      config.encryptionSecret,
    ).secret;
    return reply(await adapter(event, secret, "health", {}));
  }
  const schema = eventAdminInputs[action];
  if (!schema)
    throw new ApiError(404, "NOT_FOUND", "This action was not found.");
  const input = await jsonBody(request, schema, 4096),
    key = tokenHash(idempotency(request)),
    hash = tokenHash(JSON.stringify({ action, input }));
  if (action === "lookup") {
    const presented=parsePresentedCredential(input.credential);
    const cardProof=presented.uid?{cardUidHash:tokenHash(presented.uid)}:{};
    const resolved = await rpc("lookup", {
        eventId: input.eventId,
        credentialHash: tokenHash(presented.credential),
        ...cardProof,
      }),
      e = resolved.event;
    if (!resolved.memberRef)
      return reply({
        member: resolved.member,
        registration: { status: "unlinked", checkedIn: false },
        reviewId: null,
      });
    const registration = await adapter(
      e,
      decryptPayload(e.encrypted_key, config.encryptionSecret).secret,
      "lookup",
      { memberRef: resolved.memberRef },
    );
    let reviewId = null;
    if (registration.status === "registered")
      reviewId = (
        await rpc(
          "review",
          {
            eventId: e.id,
            eventRevision: e.revision,
            credentialHash: tokenHash(presented.credential),
        ...cardProof,
            memberRef: resolved.memberRef,
          },
          key,
          hash,
        )
      ).reviewId;
    return reply({ member: resolved.member, registration, reviewId });
  }
  if (action === "confirm") {
    const pending = await rpc("begin", input, key, hash);
    if (pending.state === "completed") return reply(pending);
    const registration = await adapter(
      pending.event,
      decryptPayload(pending.event.encrypted_key, config.encryptionSecret)
        .secret,
      pending.recoveryOnly ? "lookup" : "checkin",
      {
        memberRef: pending.memberRef,
        ...(pending.recoveryOnly ? {} : { checkinId: pending.id }),
      },
    );
    if (!registration.checkedIn || !registration.checkinId)
      throw new ApiError(
        409,
        "CHECKIN_NOT_CONFIRMED",
        "This check-in was not recorded. Tap the card again during event check-in hours.",
      );
    return reply(
      await rpc(
        "finish",
        { ...input, externalId: registration.checkinId },
        key,
        hash,
      ),
    );
  }
  let d = input;
  if (
    action === "rotate" ||
    action === "revoke" ||
    (action === "save" && !input.id)
  ) {
    const secret = token();
    d = {
      ...input,
      keyHash: tokenHash(secret),
      encryptedKey: encryptPayload({ secret }, config.encryptionSecret),
    };
  }
  const result = await rpc(action, d, key, hash);
  if (result.encryptedKey) {
    const { secret } = decryptPayload(
      result.encryptedKey,
      config.encryptionSecret,
    );
    delete result.encryptedKey;
    return reply({ ...result, credential: result.id + "." + secret });
  }
  return reply(result);
}
