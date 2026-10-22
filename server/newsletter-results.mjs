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
import { riskHash, verifySecret, tokenHash } from "./lib/security.mjs";
import { csvRow } from "./lib/csv.mjs";
import { newsletterList, subscriberBulk } from "../shared/newsletter.mjs";
export function newsletterCsv(rows) {
  const columns = [
    "id",
    "email",
    "name",
    "state",
    "teamId",
    "consentAt",
    "confirmedAt",
    "unsubscribedAt",
    "suppressedAt",
    "suppressionReason",
    "deletedAt",
  ];
  return (
    "\uFEFF" +
    csvRow(columns) +
    rows.map((row) => csvRow(columns.map((key) => row[key]))).join("")
  );
}
export async function newsletterResultRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/newsletter\/(?:subscribers\/(export|bulk)|campaigns\/([^/]+)\/delivery)$/,
    );
  if (!match) return false;
  const exporting = match[1] === "export",
    bulk = match[1] === "bulk",
    mutation = exporting || bulk;
  allowMethod(request, response, mutation ? ["POST"] : ["GET"]);
  const session = await requireSession(request, store, config);
  if (mutation) await requireCsrf(request, session, store);
  const rate = await store.rateLimit(
    mutation ? "newsletter.transfer" : "newsletter.delivery",
    riskHash(session.user.id, config.riskSecret),
    mutation ? 10 : 300,
    900,
  );
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfter));
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Wait before another newsletter request.",
    );
  }
  const args = { p_actor: session.user.id, p_session: session.sessionId };
  if (bulk) {
    queryValues(url.searchParams, z.object({}).strict());
    const { currentPassword, ...document } = await jsonBody(
        request,
        subscriberBulk,
        16384,
      ),
      account = await store.accountByEmail(session.user.email);
    if (!(await verifySecret(currentPassword, account?.password_hash)))
      throw new ApiError(
        403,
        "PASSWORD_REQUIRED",
        "Confirm your current password before changing selected subscribers.",
      );
    sendJson(
      response,
      200,
      checked(
        await db.rpc("bulk_newsletter_subscribers", {
          ...args,
          p_verified_hash: account.password_hash,
          p_action: document.action,
          p_records: document.records,
          p_confirmation: document.confirmation,
          p_key_hash: tokenHash(`${session.user.id}:${idempotency(request)}`),
          p_request_hash: tokenHash(JSON.stringify(document)),
          p_request_id: requestId,
        }),
      ),
      requestId,
    );
  } else if (exporting) {
    queryValues(url.searchParams, z.object({}).strict());
    const { team, ...filters } = await jsonBody(
      request,
      newsletterList.omit({ page: true }),
      4096,
    );
    const rows = checked(
      await db.rpc("export_newsletter_subscribers", {
        ...args,
        p_filters: {
          ...filters,
          ...(team !== undefined
            ? { teamId: team === "chapter" ? null : team }
            : {}),
        },
        p_request_id: requestId,
      }),
    );
    sendJson(
      response,
      200,
      {
        csv: newsletterCsv(rows),
        filename: "newsletter-subscribers.csv",
        count: rows.length,
      },
      requestId,
    );
  } else {
    const { page } = queryValues(
      url.searchParams,
      z
        .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
        .strict(),
    );
    sendJson(
      response,
      200,
      checked(
        await db.rpc("newsletter_delivery_status", {
          ...args,
          p_campaign: parse(uuid, match[2]),
          p_page: page,
        }),
      ),
      requestId,
    );
  }
  return true;
}
