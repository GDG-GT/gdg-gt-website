import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  queryValues,
  uuid,
  parse,
  idempotency,
} from "./lib/validation.mjs";
import { token, tokenHash, riskHash, verifySecret } from "./lib/security.mjs";
import { encryptPayload, decryptPayload } from "./lib/encryption.mjs";
import {
  personPrivacyReview,
  personPrivacyCommit,
} from "../shared/privacy.mjs";

// HMAC recipient identities were intentionally scoped to a form, so matching old
// verified/invited responses needs those exact scoped hashes, not answer search.
export async function privacyFormHashes(db, email, secret) {
  const hashes = [];
  for (let offset = 0; offset <= 10000; offset += 500) {
    const ids = checked(
      await db.rpc("person_privacy_form_keys", { p_offset: offset }),
    );
    for (const formId of ids)
      hashes.push({
        formId,
        emailHash: riskHash(`form-recipient:${formId}:${email}`, secret),
      });
    if (ids.length < 500) return hashes;
  }
  throw new ApiError(
    409,
    "PRIVACY_RECORD_LIMIT",
    "This installation exceeds the bounded privacy lookup. No incomplete review was created.",
  );
}

export async function personPrivacyRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/privacy(?:\/(review|commit|status)(?:\/([^/]+))?)?$/,
    );
  if (!match) return false;
  const operation = match[1];
  allowMethod(
    request,
    response,
    !operation || operation === "status" ? ["GET"] : ["POST"],
  );
  queryValues(url.searchParams, z.object({}).strict());
  const session = await requireSession(request, store, config);
  if (session.user.role !== "super_admin")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Person-data privacy requests require a Super Admin.",
    );
  if (operation === "status" && !match[2])
    throw new ApiError(404, "NOT_FOUND", "This privacy request was not found.");
  if (match[2] && operation !== "status")
    throw new ApiError(404, "NOT_FOUND", "This endpoint was not found.");
  if (!operation || operation === "status") {
    const items = checked(
      await db.rpc("read_person_privacy_requests", {
        p_actor: session.user.id,
        p_session: session.sessionId,
        p_review: match[2] ? parse(uuid, match[2]) : null,
      }),
    );
    sendJson(response, 200, { items }, requestId);
    return true;
  }
  await requireCsrf(request, session, store);
  const rate = await store.rateLimit(
    "person.privacy." + operation,
    riskHash(session.user.id, config.riskSecret),
    operation === "review" ? 10 : 20,
    900,
  );
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfter));
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Wait before another privacy review or approval.",
    );
  }
  const { currentPassword, ...document } = await jsonBody(
      request,
      operation === "review" ? personPrivacyReview : personPrivacyCommit,
      8192,
    ),
    account = await store.accountByEmail(session.user.email);
  if (!(await verifySecret(currentPassword, account?.password_hash)))
    throw new ApiError(
      403,
      "PASSWORD_REQUIRED",
      "Confirm your current password for this privacy request.",
    );
  const args = {
    p_actor: session.user.id,
    p_session: session.sessionId,
    p_password: account.password_hash,
    p_request_id: requestId,
  };
  if (operation === "review") {
    const reviewToken = token(),
      hashes = await privacyFormHashes(db, document.email, config.riskSecret),
      result = checked(
        await db.rpc("review_person_privacy", {
          ...args,
          p_email: document.email,
          p_encrypted_email: encryptPayload(
            { email: document.email },
            config.encryptionSecret,
          ),
          p_subject_hash: riskHash(
            "privacy-subject:" + document.email,
            config.riskSecret,
          ),
          p_action: document.action,
          p_ids: document.responseIds,
          p_hashes: hashes,
          p_sensitive: document.includeSensitive,
          p_token_hash: tokenHash(reviewToken),
          p_purpose_hash: riskHash(
            "privacy-purpose:" + document.purpose,
            config.riskSecret,
          ),
        }),
      );
    sendJson(response, 200, { ...result, reviewToken }, requestId);
    return true;
  }
  const review = checked(
    await db
      .from("person_privacy_reviews")
      .select("email_encrypted")
      .eq("id", document.reviewId)
      .eq("actor_id", session.user.id)
      .eq("session_id", session.sessionId)
      .eq("token_hash", tokenHash(document.reviewToken))
      .maybeSingle(),
  );
  if (!review)
    throw new ApiError(
      409,
      "PRIVACY_REVIEW_REQUIRED",
      "Generate another privacy review for this session.",
    );
  const result = checked(
    await db.rpc("commit_person_privacy", {
      ...args,
      p_review: document.reviewId,
      p_token_hash: tokenHash(document.reviewToken),
      p_email: review.email_encrypted
        ? decryptPayload(review.email_encrypted, config.encryptionSecret).email
        : null,
      p_confirmation: document.confirmation,
      p_key_hash: tokenHash(idempotency(request)),
      p_request_hash: tokenHash(
        JSON.stringify({
          reviewId: document.reviewId,
          tokenHash: tokenHash(document.reviewToken),
          confirmation: document.confirmation,
        }),
      ),
    }),
  );
  if (result.downloadExpired)
    throw new ApiError(
      409,
      "PRIVACY_REVIEW_REQUIRED",
      "The export was already prepared. Generate a fresh review instead of reusing an expired download.",
    );
  if (Buffer.byteLength(JSON.stringify(result)) > 3.5 * 1024 * 1024)
    throw new ApiError(
      413,
      "PRIVACY_EXPORT_LIMIT",
      "This export exceeds the safe response size.",
    );
  sendJson(response, 200, result, requestId);
  return true;
}
