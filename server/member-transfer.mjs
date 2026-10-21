import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import { databaseResult as checked, queryValues, idempotency } from "./lib/validation.mjs";
import { token, tokenHash, riskHash, verifySecret } from "./lib/security.mjs";
import { csvRow } from "./lib/csv.mjs";
import { memberCsvColumns, memberExportInput, memberImportInput, memberImportCommit } from "../shared/member-transfer.mjs";
export function memberCsv(records, includePrivate) {
  const columns = ["id", "team_id", "revision", ...memberCsvColumns.filter((c) => includePrivate || !["email", "phone", "year", "major", "interests"].includes(c))];
  return "\uFEFF" + csvRow(columns) + records.map((row) => csvRow(columns.map((key) => Array.isArray(row[key]) ? JSON.stringify(row[key]) : row[key]))).join("");
}
export async function memberTransferRoutes(request, response, { db, store, config, requestId }) {
  const url = new URL(request.url, config.origin), match = url.pathname.match(/^\/api\/v1\/admin\/members\/(export|import-preview|import)$/);
  if (!match) return false;
  allowMethod(request, response, ["POST"]);
  queryValues(url.searchParams, z.object({}).strict());
  const session = await requireSession(request, store, config);
  await requireCsrf(request, session, store);
  const rate = await store.rateLimit("members.transfer." + match[1], riskHash(session.user.id, config.riskSecret), 10, 900);
  if (!rate.allowed) { response.setHeader("Retry-After", String(rate.retryAfter)); throw new ApiError(429, "RATE_LIMITED", "Wait before another member transfer."); }
  const args = { p_actor: session.user.id, p_session: session.sessionId, p_request_id: requestId };
  if (match[1] === "export") {
    const body = await jsonBody(request, memberExportInput, 4096),
      rows = checked(await db.rpc("export_community_members", { ...args, p_filters: body.filters, p_private: body.includePrivate })),
      result = { csv: memberCsv(rows, body.includePrivate), filename: "community-members.csv", count: rows.length, privateFields: body.includePrivate };
    if (Buffer.byteLength(JSON.stringify(result)) > 3 * 1024 * 1024) throw new ApiError(409, "MEMBER_EXPORT_RANGE", "Narrow the filters to create a smaller export.");
    sendJson(response, 200, result, requestId); return true;
  }
  if (match[1] === "import-preview") {
    const document = await jsonBody(request, memberImportInput, 1048576), reviewToken = token(),
      review = checked(await db.rpc("preview_member_import", { ...args, p_document: document,
        p_hash: tokenHash(JSON.stringify(document)), p_token_hash: tokenHash(reviewToken) }));
    sendJson(response, 200, { ...review, reviewToken }, requestId); return true;
  }
  const { document, reviewId, reviewToken, confirmation, currentPassword } = await jsonBody(request, memberImportCommit, 1048576),
    account = await store.accountByEmail(session.user.email);
  if (!(await verifySecret(currentPassword, account?.password_hash))) throw new ApiError(403, "PASSWORD_REQUIRED", "Confirm your current password before importing.");
  const result = checked(await db.rpc("commit_member_import", { ...args, p_document: document,
    p_verified_hash: account.password_hash, p_hash: tokenHash(JSON.stringify(document)), p_review: reviewId,
    p_token_hash: tokenHash(reviewToken), p_confirmation: confirmation, p_key_hash: tokenHash(idempotency(request)),
    p_request_hash: tokenHash(JSON.stringify({ document, reviewId, reviewTokenHash: tokenHash(reviewToken), confirmation })) }));
  sendJson(response, 200, result, requestId); return true;
}
