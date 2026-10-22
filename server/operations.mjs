import { z } from "zod";
import { requireSession } from "./auth.mjs";
import {
  ApiError,
  allowMethod,
  checkOrigin,
  jsonBody,
  sendJson,
} from "./lib/http.mjs";
import { databaseResult as checked, queryValues } from "./lib/validation.mjs";
import { riskHash } from "./lib/security.mjs";
const directive = z.enum([
  "default-src",
  "script-src",
  "script-src-elem",
  "script-src-attr",
  "style-src",
  "style-src-elem",
  "style-src-attr",
  "font-src",
  "img-src",
  "connect-src",
  "frame-src",
  "frame-ancestors",
  "base-uri",
  "form-action",
  "object-src",
  "worker-src",
  "media-src",
  "manifest-src",
]);
export const cspReport = z.union([
  z
    .object({
      "csp-report": z.object({ "effective-directive": directive }).strip(),
    })
    .strip(),
  z
    .array(
      z
        .object({
          type: z.literal("csp-violation"),
          body: z.object({ effectiveDirective: directive }).strip(),
        })
        .strip(),
    )
    .min(1)
    .max(10),
]);
export async function operationsRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin);
  if (
    !["/api/v1/admin/operations", "/api/v1/csp-reports"].includes(url.pathname)
  )
    return false;
  checkOrigin(request, config.origin);
  queryValues(url.searchParams, z.object({}).strict());
  if (url.pathname === "/api/v1/csp-reports") {
    allowMethod(request, response, ["POST"]);
    checkOrigin(request, config.origin);
    const limit = await store.rateLimit(
      "csp.reports",
      riskHash(request.socket?.remoteAddress || "unknown", config.riskSecret),
      10,
      60,
    );
    if (!limit.allowed) {
      response.setHeader("Retry-After", String(limit.retryAfter));
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Wait before sending more reports.",
      );
    }
    const report = await jsonBody(request, cspReport, 16384, {
      contentTypes: ["application/csp-report", "application/reports+json"],
    });
    checked(
      await db.rpc("record_operational_metrics", {
        p_counts: { csp_violations: Array.isArray(report) ? report.length : 1 },
      }),
    );
    sendJson(response, 200, { received: true }, requestId);
    return true;
  }
  allowMethod(request, response, ["GET"]);
  const session = await requireSession(request, store, config);
  if (session.user.role !== "super_admin")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Operational monitoring requires a Super Admin.",
    );
  const status = checked(
    await db.rpc("read_operational_status", {
      p_actor: session.user.id,
      p_session: session.sessionId,
    }),
  );
  sendJson(response, 200, status, requestId);
  return true;
}
