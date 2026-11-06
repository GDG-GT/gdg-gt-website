import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  uuid,
  queryValues,
  idempotency,
} from "./lib/validation.mjs";
import {
  token,
  tokenHash,
  validToken,
  riskHash,
  verifySecret,
} from "./lib/security.mjs";
export const formDeletionReviewInput = z
  .object({ revision: z.number().int().min(1) })
  .strict();
export const formDeletionInput = formDeletionReviewInput
  .extend({
    reviewId: uuid,
    reviewToken: z.string().refine(validToken),
    confirmation: z.string().max(100),
    exportWarningAcknowledged: z.literal(true),
    currentPassword: z.string().min(1).max(1024),
  })
  .strict();
export async function formDeletionRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/forms\/([^/]+)\/(deletion-review|permanent-deletion)(?:\/(recovery))?$/,
    );
  if (!match) return false;
  const reviewing = match[2] === "deletion-review";
  allowMethod(
    request,
    response,
    match[3] ? ["GET"] : reviewing ? ["GET", "POST"] : ["POST"],
  );
  const query = queryValues(
    url.searchParams,
    match[3] ? z.object({ reviewId: uuid }).strict() : z.object({}).strict(),
  );
  const session = await requireSession(request, store, config),
    formId = parse(uuid, match[1]),
    args = {
      p_actor: session.user.id,
      p_session: session.sessionId,
      p_form: formId,
    };
  if (match[3]) {
    if (reviewing)
      throw new ApiError(404, "NOT_FOUND", "This record was not found.");
    const value = checked(
      await db.rpc("inspect_form_deletion_write", {
        ...args,
        p_review: query.reviewId,
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: null,
      }),
    );
    sendJson(
      response,
      200,
      {
        formId: value.formId,
        reviewId: value.reviewId,
        committed: value.committed,
        canRetry: value.canRetry,
        revision: value.revision,
        reviewExpiresAt: value.reviewExpiresAt,
        receipt: value.receipt
          ? {
              formId: value.receipt.formId,
              reviewId: value.receipt.reviewId,
              deleted: value.receipt.deleted,
            }
          : null,
      },
      requestId,
    );
    return true;
  }
  if (request.method === "GET") {
    sendJson(
      response,
      200,
      checked(await db.rpc("read_form_deletion", args)),
      requestId,
    );
    return true;
  }
  await requireCsrf(request, session, store);
  // Check the role before password work or generating a review capability. The
  // database rechecks the current role/session under its mutation lock.
  if (session.user.role !== "super_admin")
    throw new ApiError(404, "NOT_FOUND", "This record was not found.");
  const rate = await store.rateLimit(
    "forms.deletion.review",
    riskHash(session.user.id, config.riskSecret),
    10,
    900,
  );
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfter));
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Wait before reviewing permanent deletion again.",
    );
  }
  if (reviewing) {
    const document = await jsonBody(request, formDeletionReviewInput, 1024),
      reviewToken = token(),
      result = checked(
        await db.rpc("review_form_deletion", {
          ...args,
          p_revision: document.revision,
          p_token_hash: tokenHash(reviewToken),
          p_request_id: requestId,
        }),
      );
    sendJson(response, 200, { ...result, reviewToken }, requestId);
    return true;
  }
  const {
    currentPassword,
    reviewToken,
    reviewId,
    revision,
    confirmation,
    exportWarningAcknowledged,
  } = await jsonBody(request, formDeletionInput, 4096);
  if (confirmation !== `DELETE FORM ${formId}`)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Type the displayed permanent-deletion reference.",
    );
  const account = await store.accountByEmail(session.user.email);
  if (!(await verifySecret(currentPassword, account?.password_hash)))
    throw new ApiError(
      403,
      "PASSWORD_REQUIRED",
      "Confirm your current password.",
    );
  const result = checked(
    await db.rpc("permanently_delete_form", {
      ...args,
      p_verified_hash: account.password_hash,
      p_revision: revision,
      p_review: reviewId,
      p_token_hash: tokenHash(reviewToken),
      p_confirmation: confirmation,
      p_export_warning: exportWarningAcknowledged,
      p_key_hash: tokenHash(idempotency(request)),
      p_request_hash: tokenHash(
        JSON.stringify({
          reviewId,
          revision,
          confirmation,
          exportWarningAcknowledged,
        }),
      ),
      p_request_id: requestId,
    }),
  );
  sendJson(response, 200, result, requestId);
  return true;
}
