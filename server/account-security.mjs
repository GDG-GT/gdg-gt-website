import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import { databaseResult as checked, queryValues, idempotency } from "./lib/validation.mjs";
import { hashSecret, verifySecret, riskHash, tokenHash } from "./lib/security.mjs";

export async function accountSecurityRoutes(request, response, { db, store, config, requestId }) {
  const url = new URL(request.url, config.origin);
  if (!["/api/v1/admin/security", "/api/v1/admin/security/gate"].includes(url.pathname)) return false;
  const gate = url.pathname.endsWith("/gate");
  allowMethod(request, response, gate ? ["GET", "POST"] : ["GET"]);
  const session = await requireSession(request, store, config);
  if (session.user.role !== "super_admin") throw new ApiError(403, "FORBIDDEN", "Account security requires a Super Admin.");
  const args = { p_actor: session.user.id, p_session: session.sessionId };
  if (request.method === "GET") {
    const query = queryValues(url.searchParams, z.object({ key: gate ? z.string().regex(/^[-A-Za-z0-9_]{16,128}$/) : z.never().optional() }).strict());
    const status = checked(await db.rpc("read_account_security", args));
    if (gate) {
      const receipt = checked(await db.from("idempotency_keys").select("result,expires_at")
        .eq("scope", `security.gate:${session.user.id}:${session.sessionId}`).eq("key_hash", tokenHash(query.key)).maybeSingle());
      sendJson(response, 200, { version: status.version, committed: !!receipt && new Date(receipt.expires_at).getTime() > Date.now(), receipt: receipt && new Date(receipt.expires_at).getTime() > Date.now() ? receipt.result : null }, requestId);
    } else sendJson(response, 200, status, requestId);
    return true;
  }
  await requireCsrf(request, session, store);
  queryValues(url.searchParams, z.object({}).strict());
  const limit = await store.rateLimit("security.gate", riskHash(session.user.id, config.riskSecret), 5, 900);
  if (!limit.allowed) {
    response.setHeader("Retry-After", String(limit.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Wait before trying another security change.");
  }
  const body = await jsonBody(request, z.object({
    code: z.string().min(24).max(128).refine((v) => !Array.from(v).some((c) => c.codePointAt(0) < 32 || c.codePointAt(0) === 127)),
    currentPassword: z.string().min(1).max(128),
    expectedVersion: z.number().int().positive(),
    confirmation: z.literal("ROTATE GATE"),
  }).strict(), 4096);
  const key = idempotency(request);
  const account = await store.accountByEmail(session.user.email);
  if (!(await verifySecret(body.currentPassword, account?.password_hash))) {
    await store.recordLoginFailure(account);
    await store.audit({ actorId: session.user.id, action: "security.confirmation_failed", requestId, result: "denied" });
    throw new ApiError(403, "PASSWORD_CONFIRMATION_FAILED", "Your password could not be confirmed.");
  }
  const result = checked(await db.rpc("rotate_gate_reviewed", {
    ...args, p_verified_hash: account.password_hash,
    p_expected_version: body.expectedVersion, p_hash: await hashSecret(body.code),
    p_key_hash: tokenHash(key), p_request_hash: riskHash(JSON.stringify({ code: body.code, version: body.expectedVersion }), config.riskSecret),
    p_request_id: requestId,
  }));
  sendJson(response, 200, result, requestId);
  return true;
}
