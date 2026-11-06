import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  uuid,
  queryValues,
  idempotency,
  text,
} from "./lib/validation.mjs";
import { tokenHash, riskHash, verifySecret } from "./lib/security.mjs";
const shape = {
  revision: z.number().int().min(0),
  held: z.boolean(),
  reason: text(500, 5),
  confirmation: z.string().max(100),
  currentPassword: z.string().min(1).max(1024),
};
export const formPrivacyInput = z
  .object({ ...shape, draftDays: z.number().int().min(1).max(30) })
  .strict();
export const responsePrivacyInput = z.object(shape).strict();
export async function formPrivacyRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/forms\/([^/]+)(?:\/responses\/([^/]+))?\/privacy(?:\/(recovery))?$/,
    );
  if (!match) return false;
  allowMethod(request, response, match[3] ? ["GET"] : ["GET", "POST"]);
  queryValues(url.searchParams, z.object({}).strict());
  const session = await requireSession(request, store, config),
    formId = parse(uuid, match[1]),
    responseId = match[2] ? parse(uuid, match[2]) : null,
    args = {
      p_actor: session.user.id,
      p_session: session.sessionId,
      p_form: formId,
      p_response: responseId,
    };
  if (match[3]) {
    const value = checked(
      await db.rpc("inspect_form_privacy_write", {
        ...args,
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: null,
      }),
    );
    sendJson(
      response,
      200,
      {
        committed: value.committed,
        canRetry: value.canRetry,
        formId: value.formId,
        responseId: value.responseId,
        currentRevision: value.currentRevision,
        held: value.held,
        canRelease: value.canRelease,
        targetExists: value.targetExists,
        receipt: value.receipt
          ? {
              formId: value.receipt.formId,
              responseId: value.receipt.responseId,
              revision: value.receipt.revision,
            }
          : null,
      },
      requestId,
    );
    return true;
  }
  // The read RPC checks the same current account/session and resource scope as
  // the write, before password work or disclosure of retention counters.
  const state = checked(await db.rpc("read_form_privacy", args));
  if (request.method === "GET") {
    sendJson(response, 200, state, requestId);
    return true;
  }
  await requireCsrf(request, session, store);
  const rate = await store.rateLimit(
    "forms.privacy.review",
    riskHash(session.user.id, config.riskSecret),
    10,
    900,
  );
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfter));
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Wait before reviewing privacy controls again.",
    );
  }
  const { currentPassword, revision, ...document } = await jsonBody(
    request,
    responseId ? responsePrivacyInput : formPrivacyInput,
    4096,
  );
  if (document.confirmation !== `HOLD ${responseId || formId}`)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Type the displayed hold reference.",
    );
  const account = await store.accountByEmail(session.user.email);
  if (!(await verifySecret(currentPassword, account?.password_hash)))
    throw new ApiError(
      403,
      "PASSWORD_REQUIRED",
      "Confirm your current password.",
    );
  const result = checked(
    await db.rpc("review_form_privacy", {
      ...args,
      p_verified_hash: account.password_hash,
      p_revision: revision,
      p_document: document,
      p_key_hash: tokenHash(idempotency(request)),
      p_request_hash: tokenHash(JSON.stringify({ revision, ...document })),
      p_request_id: requestId,
    }),
  );
  sendJson(response, 200, result, requestId);
  return true;
}
