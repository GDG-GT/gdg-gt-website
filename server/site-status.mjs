import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  queryValues,
  idempotency,
} from "./lib/validation.mjs";
import { tokenHash, riskHash, verifySecret } from "./lib/security.mjs";
import { siteStatusChange, publicSiteStatus } from "../shared/site-status.mjs";
export async function siteStatusRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    path = url.pathname;
  if (
    ![
      "/api/v1/site-status",
      "/api/v1/admin/site-status",
      "/api/v1/health",
    ].includes(path)
  )
    return false;
  const privateRoute = path === "/api/v1/admin/site-status";
  allowMethod(request, response, privateRoute ? ["GET", "PATCH"] : ["GET"]);
  queryValues(url.searchParams, z.object({}).strict());
  const reply = (data) => {
    sendJson(response, 200, data, requestId);
    return true;
  };
  if (path === "/api/v1/health") return reply({ ok: true });
  const session = privateRoute
    ? await requireSession(request, store, config)
    : null;
  if (request.method === "GET") {
    const result = checked(
      await db.rpc("read_site_status", {
        p_actor: session?.user.id || null,
        p_private: privateRoute,
      }),
    );
    if (!privateRoute) {
      // Project only known public fields and revalidate configuration on reads.
      const safe = publicSiteStatus.safeParse(result);
      if (!safe.success)
        throw new ApiError(
          503,
          "TEMPORARILY_UNAVAILABLE",
          "Site availability could not be checked.",
        );
      return reply(safe.data);
    }
    return reply(result);
  }
  await requireCsrf(request, session, store);
  const rate = await store.rateLimit(
    "site_status.update",
    riskHash(session.user.id, config.riskSecret),
    20,
    900,
  );
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Please wait before trying again.");
  }
  const body = await jsonBody(request, siteStatusChange, 16384),
    { currentPassword, ...document } = body;
  if (
    !checked(
      await db.rpc("can_operate_site_status", {
        p_actor: session.user.id,
        p_action: "update",
      }),
    )
  )
    throw new ApiError(
      403,
      "FORBIDDEN",
      "This site-wide setting is not available.",
    );
  const account = await store.accountByEmail(session.user.email);
  if (!(await verifySecret(currentPassword, account?.password_hash)))
    throw new ApiError(
      403,
      "PASSWORD_REQUIRED",
      "Confirm your current password.",
    );
  return reply(
    checked(
      await db.rpc("mutate_site_status", {
        p_actor: session.user.id,
        p_session: session.sessionId,
        p_verified_hash: account.password_hash,
        p_revision: document.revision,
        p_document: document,
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: tokenHash(JSON.stringify(document)),
        p_request_id: requestId,
      }),
    ),
  );
}
