import { ApiError, allowMethod, sendJson } from "./lib/http.mjs";
import { tokenHash, equalHashes } from "./lib/security.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
import { cleanupUploads } from "./upload-cleanup.mjs";
import { runDelivery } from "./delivery.mjs";
export function authorizeJob(request, env = process.env) {
  if (
    request.headers.origin ||
    request.headers.cookie ||
    (request.headers["sec-fetch-site"] &&
      request.headers["sec-fetch-site"] !== "none")
  )
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Scheduled jobs do not accept browser requests.",
    );
  if (!env.CRON_SECRET || env.CRON_SECRET.length < 32)
    throw new ApiError(
      503,
      "JOBS_NOT_CONFIGURED",
      "Scheduled jobs are not configured.",
    );
  const authorization = request.headers.authorization;
  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ") ||
    authorization.length > 1024 ||
    !equalHashes(tokenHash(authorization.slice(7)), tokenHash(env.CRON_SECRET))
  )
    throw new ApiError(
      401,
      "UNAUTHORIZED",
      "Valid job authorization is required.",
    );
}
export async function jobRoutes(request, response, { db, config, requestId }) {
  const match = new URL(request.url, config.origin).pathname.match(
    /^\/api\/v1\/jobs\/([a-z-]+)$/,
  );
  if (!match) return false;
  allowMethod(request, response, ["POST"]);
  authorizeJob(request);
  if (
    ![
      "form-schedules",
      "form-cleanup",
      "delivery",
      "task-overdue",
      "announcements",
    ].includes(match[1])
  )
    throw new ApiError(404, "NOT_FOUND", "This job is not available.");
  const run = checked(
    await db.rpc("begin_scheduled_job", {
      p_name: match[1],
      p_request: requestId,
    }),
  );
  if (run.skipped) {
    sendJson(response, 200, { skipped: run.skipped }, requestId);
    return true;
  }
  let counts;
  try {
    if (match[1] === "form-schedules")
      counts = checked(await db.rpc("advance_form_schedules"));
    else if (match[1] === "task-overdue")
      counts = checked(await db.rpc("advance_overdue_tasks"));
    else if (match[1] === "announcements")
      counts = checked(await db.rpc("advance_chapter_announcements"));
    else if (match[1] === "form-cleanup") {
      const drafts = checked(
          await db.rpc("expire_form_drafts", { p_limit: 1000 }),
        ),
        responses = checked(await db.rpc("expire_form_responses", { p_limit: 500 })),
        files = await cleanupUploads({ db, limit: 50 });
      counts = { drafts, ...responses, ...files };
      if (files.retried)
        throw new ApiError(
          503,
          "CLEANUP_RETRY",
          "Some upload cleanup operations need retry.",
        );
    } else {
      counts = await runDelivery({ db, limit: 25 });
      if (counts.retried || counts.lostLease)
        throw new ApiError(
          503,
          "DELIVERY_RETRY",
          "Some delivery operations need retry.",
        );
    }
    const finished = checked(
      await db.rpc("finish_scheduled_job", {
        p_id: run.runId,
        p_lease: run.lease,
        p_success: true,
        p_counts: counts,
        p_error: null,
      }),
    );
    if (!finished)
      throw new ApiError(
        409,
        "JOB_LEASE_LOST",
        "This job run no longer owns its lease.",
      );
    sendJson(response, 200, { runId: run.runId, counts }, requestId);
  } catch (error) {
    checked(
      await db.rpc("finish_scheduled_job", {
        p_id: run.runId,
        p_lease: run.lease,
        p_success: false,
        p_counts: counts || {},
        p_error: error instanceof ApiError ? error.code : "JOB_RETRY",
      }),
    );
    throw error;
  }
  return true;
}
