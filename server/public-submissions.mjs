import { z } from "zod";
import { allowMethod, jsonBody, sendJson, ApiError } from "./lib/http.mjs";
import {
  text,
  idempotency,
  databaseResult as checked,
} from "./lib/validation.mjs";
import {
  token,
  tokenHash,
  validToken,
  riskHash,
  verifySecret,
} from "./lib/security.mjs";
import { encryptPayload } from "./lib/encryption.mjs";
import { checkGateAttempt, createGateAccess } from "./auth.mjs";
import { contactSubmission } from "../shared/contact.mjs";
export async function publicSubmissionRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const path = new URL(request.url, config.origin).pathname;
  if (
    ![
      "/api/v1/newsletter/subscriptions",
      "/api/v1/newsletter/confirm",
      "/api/v1/newsletter/unsubscribe",
      "/api/v1/newsletter/confirm/validate",
      "/api/v1/newsletter/unsubscribe/validate",
      "/api/v1/contact",
    ].includes(path)
  )
    return false;
  allowMethod(request, response, ["POST"]);
  const risk = riskHash(
      request.socket?.remoteAddress || "unknown",
      config.riskSecret,
    ),
    // This endpoint also recognizes email-shaped gate entries. Cap that public
    // guessing surface at five requests per risk window, not the contact limit.
    limit = await store.rateLimit(
      "public:" + path,
      risk,
      path.endsWith("/subscriptions") ? 5 : 20,
      900,
    );
  if (!limit.allowed) {
    response.setHeader("Retry-After", String(limit.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Please wait before trying again.");
  }
  if (path.endsWith("/subscriptions")) {
    const body = await jsonBody(
      request,
      z
        .object({
          email: z.string().trim().toLowerCase().email().max(255),
          name: text(100).optional(),
          website: text(200).default(""),
        })
        .strict(),
      4096,
    );
    const raw = token(),
      key = idempotency(request);
    if (body.website)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "This submission could not be accepted.",
      );
    const gate = await store.gateConfiguration(config.initialGateHash);
    if (await verifySecret(body.email, gate.gate_hash)) {
      await checkGateAttempt({ store, response, risk, requestId });
      await createGateAccess({ store, config, response, settings: gate });
      sendJson(response, 200, { gateValid: true }, requestId);
      return true;
    }
    const emailLimit = await store.rateLimit(
      "newsletter.email",
      riskHash(body.email, config.riskSecret),
      5,
      900,
    );
    if (emailLimit.allowed)
      checked(
        await db.rpc("subscribe_newsletter", {
          p_email: body.email,
          p_name: body.name || null,
          p_key_hash: tokenHash(key),
          p_request_hash: tokenHash(
            JSON.stringify({ email: body.email, name: body.name || "" }),
          ),
          p_token_hash: tokenHash(raw),
          p_secret_payload: encryptPayload(
            { token: raw },
            config.encryptionSecret,
          ),
        }),
      );
    sendJson(
      response,
      200,
      {
        accepted: true,
        message:
          "If this address needs confirmation, you’ll receive an email with the next step.",
      },
      requestId,
    );
    return true;
  }
  const tokenAction = path.match(
    /^\/api\/v1\/newsletter\/(confirm|unsubscribe)(\/validate)?$/,
  );
  if (tokenAction) {
    const body = await jsonBody(
      request,
      z.object({ token: z.string().refine(validToken) }).strict(),
      4096,
    );
    if (tokenAction[2]) {
      const result = checked(
        await db.rpc("inspect_newsletter_token", {
          p_hash: tokenHash(body.token),
          p_purpose: tokenAction[1],
        }),
      );
      sendJson(
        response,
        200,
        {
          valid: result.valid === true,
          applied: result.valid === true && result.applied === true,
        },
        requestId,
      );
      return true;
    }
    const success = checked(
      await db.rpc("consume_newsletter_token", {
        p_hash: tokenHash(body.token),
        p_purpose: tokenAction[1],
      }),
    );
    if (!success)
      throw new ApiError(
        410,
        "TOKEN_EXPIRED",
        "This link is no longer available. Please request a new one.",
      );
    sendJson(response, 200, { updated: true }, requestId);
    return true;
  }
  const body = await jsonBody(request, contactSubmission, 32768);
  if (body.website)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "This submission could not be accepted.",
    );
  const key = idempotency(request),
    document = {
      name: body.name,
      email: body.email,
      type: body.type,
      message: body.message,
      interests: body.interests,
      ...(body.attachment
        ? {
            uploadId: body.attachment.uploadId,
            uploadProof: tokenHash(body.attachment.uploadToken),
          }
        : {}),
    };
  checked(
    await db.rpc("submit_contact", {
      p_document: document,
      p_key_hash: tokenHash(key),
      p_request_hash: tokenHash(JSON.stringify(document)),
    }),
  );
  sendJson(
    response,
    200,
    {
      accepted: true,
      message: "Your message has been saved. The chapter will be in touch.",
    },
    requestId,
  );
  return true;
}
