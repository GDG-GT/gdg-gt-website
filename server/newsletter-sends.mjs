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
import { riskHash, token, tokenHash, verifySecret } from "./lib/security.mjs";
import {
  sendReview,
  sendCommit,
  sendCancel,
  sendTest,
  newsletterPreview,
} from "../shared/newsletter.mjs";
export async function newsletterSendRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/newsletter\/campaigns\/([^/]+)\/(send-review|send|cancel|test)$/,
    );
  if (!match) return false;
  allowMethod(request, response, ["POST"]);
  queryValues(url.searchParams, z.object({}).strict());
  const session = await requireSession(request, store, config);
  await requireCsrf(request, session, store);
  const campaign = parse(uuid, match[1]),
    action = match[2],
    rate = await store.rateLimit(
      "newsletter.send." + action,
      riskHash(session.user.id, config.riskSecret),
      action === "test" ? 10 : 30,
      3600,
    );
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfter));
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Wait before reviewing or sending more campaigns.",
    );
  }
  const body = await jsonBody(
      request,
      {
        "send-review": sendReview,
        send: sendCommit,
        cancel: sendCancel,
        test: sendTest,
      }[action],
      8192,
    ),
    args = {
      p_actor: session.user.id,
      p_session: session.sessionId,
      p_campaign: campaign,
      p_request_id: requestId,
    };
  if (action === "send-review") {
    const raw = token(),
      result = checked(
        await db.rpc("review_newsletter_send", {
          ...args,
          p_revision: body.revision,
          p_token_hash: tokenHash(raw),
        }),
      );
    sendJson(
      response,
      200,
      {
        ...result,
        reviewToken: raw,
        html: newsletterPreview(result.subject, result.content),
      },
      requestId,
    );
    return true;
  }
  const { currentPassword, ...document } = body,
    account = await store.accountByEmail(session.user.email);
  if (!(await verifySecret(currentPassword, account?.password_hash)))
    throw new ApiError(
      403,
      "PASSWORD_REQUIRED",
      "Confirm your current password before sending or cancelling.",
    );
  let result;
  if (action === "cancel")
    result = checked(
      await db.rpc("cancel_newsletter_send", {
        ...args,
        p_revision: document.revision,
        p_verified_hash: account.password_hash,
      }),
    );
  else {
    const retry = {
      p_key_hash: tokenHash(`${session.user.id}:${idempotency(request)}`),
      p_request_hash: tokenHash(JSON.stringify(document)),
    };
    result = checked(
      await db.rpc(
        action === "send" ? "commit_newsletter_send" : "create_newsletter_test",
        {
          ...args,
          ...retry,
          p_verified_hash: account.password_hash,
          ...(action === "send"
            ? {
                p_review: document.reviewId,
                p_token_hash: tokenHash(document.reviewToken),
                p_confirmation: document.confirmation,
                p_scheduled_at: document.scheduledAt,
              }
            : { p_revision: document.revision }),
        },
      ),
    );
  }
  sendJson(response, 200, result, requestId);
  return true;
}
