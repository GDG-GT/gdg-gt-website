import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { allowMethod, jsonBody, sendJson, ApiError } from "./lib/http.mjs";
import {
  databaseResult as checked,
  queryValues,
  idempotency,
  hasControlCharacters,
} from "./lib/validation.mjs";
import { riskHash, tokenHash } from "./lib/security.mjs";
export async function newsletterMemberImportRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin);
  if (url.pathname !== "/api/v1/admin/newsletter/member-import") return false;
  allowMethod(request, response, ["GET", "POST"]);
  queryValues(url.searchParams, z.object({}).strict());
  const session = await requireSession(request, store, config);
  if (session.user.role !== "super_admin")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only Super Admins can import member subscriptions.",
    );
  const rate = await store.rateLimit(
    "newsletter.member_import",
    riskHash(session.user.id, config.riskSecret),
    request.method === "GET" ? 120 : 20,
    900,
  );
  if (!rate.allowed)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Wait before another member import.",
    );
  const args = { p_actor: session.user.id, p_session: session.sessionId };
  if (request.method === "GET")
    sendJson(
      response,
      200,
      checked(await db.rpc("preview_newsletter_member_import", args)),
      requestId,
    );
  else {
    await requireCsrf(request, session, store);
    const body = await jsonBody(
      request,
      z
        .object({
          memberIds: z
            .array(z.string().uuid())
            .min(1)
            .max(1000)
            .refine((v) => new Set(v).size === v.length),
          consentAcknowledged: z.literal(true),
          consentNote: z
            .string()
            .trim()
            .min(10)
            .max(500)
            .refine((v) => !hasControlCharacters(v)),
        })
        .strict(),
      65536,
    );
    sendJson(
      response,
      200,
      checked(
        await db.rpc("import_newsletter_members", {
          ...args,
          p_member_ids: body.memberIds,
          p_consent_note: body.consentNote,
          p_key_hash: tokenHash(`${session.user.id}:${idempotency(request)}`),
          p_request_hash: tokenHash(JSON.stringify(body)),
          p_request_id: requestId,
        }),
      ),
      requestId,
    );
  }
  return true;
}
