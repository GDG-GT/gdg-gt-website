import { ApiError } from "./http.mjs";
import { tokenHash, equalHashes } from "./security.mjs";

// Shared by the lightweight scheduler and isolated background functions.
export function authorizeJob(request, env = process.env) {
  if (request.headers.origin || request.headers.cookie ||
      (request.headers["sec-fetch-site"] && request.headers["sec-fetch-site"] !== "none"))
    throw new ApiError(403, "FORBIDDEN", "Scheduled jobs do not accept browser requests.");
  if (!env.CRON_SECRET || env.CRON_SECRET.length < 32)
    throw new ApiError(503, "JOBS_NOT_CONFIGURED", "Scheduled jobs are not configured.");
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ") ||
      authorization.length > 1024 || !equalHashes(tokenHash(authorization.slice(7)), tokenHash(env.CRON_SECRET)))
    throw new ApiError(401, "UNAUTHORIZED", "Valid job authorization is required.");
}
