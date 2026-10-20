import { z } from "zod";
import { allowMethod, jsonBody, sendJson, ApiError } from "./lib/http.mjs";
import {
  text,
  idempotency,
  databaseResult as checked,
} from "./lib/validation.mjs";
import { token, tokenHash, validToken, riskHash } from "./lib/security.mjs";
import { encryptPayload } from "./lib/encryption.mjs";
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
      "/api/v1/contact",
    ].includes(path)
  )
    return false;
  allowMethod(request, response, ["POST"]);
  const risk = riskHash(
      request.socket?.remoteAddress || "unknown",
      config.riskSecret,
    ),
    limit = await store.rateLimit("public:" + path, risk, 20, 900);
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
  if (path.endsWith("/confirm") || path.endsWith("/unsubscribe")) {
    const body = await jsonBody(
      request,
      z.object({ token: z.string().refine(validToken) }).strict(),
      4096,
    );
    const success = checked(
      await db.rpc("consume_newsletter_token", {
        p_hash: tokenHash(body.token),
        p_purpose: path.endsWith("/confirm") ? "confirm" : "unsubscribe",
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
  const body = await jsonBody(
    request,
    z
      .object({
        name: text(100, 2),
        email: z.string().trim().toLowerCase().email().max(255),
        type: z.enum([
          "general",
          "membership",
          "event",
          "sponsorship",
          "speaker",
          "accessibility",
        ]),
        message: text(5000, 20),
        interests: z.array(text(100)).max(20).default([]),
        website: text(200).default(""),
      })
      .strict(),
    32768,
  );
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
