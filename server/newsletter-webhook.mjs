import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError, allowMethod, sendJson } from "./lib/http.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
import { riskHash, tokenHash } from "./lib/security.mjs";
// Resend/Svix signs id.timestamp.raw-body, with the base64 whsec_ secret.
// References: https://resend.com/docs/webhooks/verify-webhooks-requests and
// https://www.svix.com/guides/receiving/receive-webhooks-with-javascript-express/
export function verifyNewsletterWebhook(
  bytes,
  headers,
  secret,
  now = Date.now(),
) {
  const id = headers["svix-id"],
    timestamp = headers["svix-timestamp"],
    signatures = headers["svix-signature"];
  if (
    typeof secret !== "string" ||
    !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret) ||
    Buffer.from(secret.slice(6), "base64").length < 16
  )
    throw new ApiError(
      503,
      "WEBHOOK_NOT_CONFIGURED",
      "Provider callbacks are not configured.",
    );
  if (
    !Buffer.isBuffer(bytes) ||
    !bytes.length ||
    bytes.length > 262144 ||
    typeof id !== "string" ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(id) ||
    typeof timestamp !== "string" ||
    !/^\d{9,12}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    typeof signatures !== "string" ||
    signatures.length > 4096
  )
    throw new ApiError(
      401,
      "INVALID_WEBHOOK",
      "The callback signature is invalid or expired.",
    );
  const expected = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(id + "." + timestamp + ".")
    .update(bytes)
    .digest();
  const valid = signatures.split(" ").some((value) => {
    const [version, signature, ...extra] = value.split(",");
    if (
      version !== "v1" ||
      extra.length ||
      !/^[A-Za-z0-9+/]{43}=$/.test(signature || "")
    )
      return false;
    const candidate = Buffer.from(signature, "base64");
    return (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    );
  });
  if (!valid)
    throw new ApiError(
      401,
      "INVALID_WEBHOOK",
      "The callback signature is invalid or expired.",
    );
  return { eventHash: tokenHash(id), payloadHash: tokenHash(bytes) };
}
const eventSchema = z
  .object({
    type: z.enum([
      "email.sent",
      "email.delivered",
      "email.delivery_delayed",
      "email.bounced",
      "email.complained",
      "email.failed",
      "email.opened",
      "email.clicked",
      "email.suppressed",
    ]),
    created_at: z.string().datetime({ offset: true }),
    data: z.object({ email_id: z.string().min(1).max(200) }).passthrough(),
  })
  .passthrough();
export async function newsletterWebhookRoutes(
  request,
  response,
  { db, store, config, requestId, env = process.env },
) {
  if (
    new URL(request.url, config.origin).pathname !== "/api/v1/webhooks/resend"
  )
    return false;
  allowMethod(request, response, ["POST"]);
  if (
    request.headers.origin ||
    request.headers.cookie ||
    (request.headers["sec-fetch-site"] &&
      request.headers["sec-fetch-site"] !== "none")
  )
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Provider callbacks do not accept browser credentials.",
    );
  if (!env.RESEND_WEBHOOK_SECRET)
    throw new ApiError(
      503,
      "WEBHOOK_NOT_CONFIGURED",
      "Provider callbacks are not configured.",
    );
  const rate = await store.rateLimit(
    "newsletter.webhook",
    riskHash(request.socket?.remoteAddress || "unknown", config.riskSecret),
    1200,
    60,
  );
  if (!rate.allowed)
    throw new ApiError(429, "RATE_LIMITED", "Retry this callback later.");
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers["content-type"] || "",
    )
  )
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send a JSON callback.");
  let bytes;
  if (Buffer.isBuffer(request.body)) bytes = request.body;
  else if (typeof request.body === "string") bytes = Buffer.from(request.body);
  else if (request.body !== undefined)
    throw new ApiError(
      503,
      "RAW_BODY_REQUIRED",
      "The callback endpoint requires its original request bytes.",
    );
  else {
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 262144)
        throw new ApiError(
          413,
          "PAYLOAD_TOO_LARGE",
          "This callback is too large.",
        );
      chunks.push(Buffer.from(chunk));
    }
    bytes = Buffer.concat(chunks, length);
  }
  const verified = verifyNewsletterWebhook(
    bytes,
    request.headers,
    env.RESEND_WEBHOOK_SECRET,
  );
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "This callback could not be read.");
  }
  const event = eventSchema.safeParse(value);
  if (!event.success) {
    sendJson(response, 200, { accepted: true }, requestId);
    return true;
  }
  checked(
    await db.rpc("record_newsletter_provider_event", {
      p_event_hash: verified.eventHash,
      p_payload_hash: verified.payloadHash,
      p_provider: event.data.data.email_id,
      p_type: event.data.type,
      p_occurred: event.data.created_at,
    }),
  );
  sendJson(response, 200, { accepted: true }, requestId);
  return true;
}
