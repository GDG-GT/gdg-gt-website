import { authorizeJob } from "./lib/job-authorization.mjs";
import { ApiError, allowMethod, sendJson } from "./lib/http.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
import { cleanupUploads } from "./upload-cleanup.mjs";
import { cleanupMedia } from "./media-cleanup.mjs";
import { runDelivery } from "./delivery.mjs";
import { runNewsletterWorker } from "./newsletter-worker.mjs";
import { runPushWorker } from "./push-worker.mjs";
import { pushConfig } from "./lib/push-transport.mjs";
import { drainOperationalRetention } from "./lib/retention-worker.mjs";
export { authorizeJob } from "./lib/job-authorization.mjs";
export async function jobRoutes(request, response, { db, config, requestId }) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(/^\/api\/v1\/jobs\/([a-z-]+)$/);
  if (!match) return false;
  allowMethod(request, response, ["POST"]);
  authorizeJob(request);
  if (url.search)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Scheduled jobs do not accept query controls.",
    );
  if (
    ![
      "form-schedules",
      "form-cleanup",
      "delivery",
      "task-overdue",
      "announcements",
      "newsletter-campaigns",
      "event-push",
      "session-cleanup",
      "notification-cleanup",
      "report-cache-cleanup",
      "operations-monitor",
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
    if (match[1] === "operations-monitor")
      counts = checked(
        await db.rpc("evaluate_operational_alerts", {
          p_run: run.runId,
          p_lease: run.lease,
        }),
      );
    else if (
      [
        "session-cleanup",
        "notification-cleanup",
        "report-cache-cleanup",
      ].includes(match[1])
    )
      counts = await drainOperationalRetention(db, run);
    else if (match[1] === "form-schedules")
      counts = checked(await db.rpc("advance_form_schedules"));
    else if (match[1] === "task-overdue")
      counts = checked(await db.rpc("advance_overdue_tasks"));
    else if (match[1] === "announcements")
      counts = checked(await db.rpc("advance_chapter_announcements"));
    else if (match[1] === "event-push") {
      const settings = pushConfig(),
        queued =
          settings.enabled && settings.deliveryEnabled
            ? checked(await db.rpc("advance_event_push"))
            : { queued: 0 },
        delivery = await runPushWorker({ db }),
        cleanup = checked(await db.rpc("cleanup_event_push"));
      counts = { ...queued, ...delivery, ...cleanup };
      if (delivery.retried || delivery.lostLease)
        throw new ApiError(
          503,
          "PUSH_RETRY",
          "Some event reminders need retry.",
        );
    } else if (match[1] === "newsletter-campaigns") {
      const schedules = checked(await db.rpc("advance_newsletter_campaigns")),
        delivery = await runNewsletterWorker({ db, limit: 25 }),
        providerEventsApplied = checked(
          await db.rpc("apply_newsletter_provider_events"),
        ),
        cleanup = checked(await db.rpc("cleanup_newsletter_records"));
      counts = {
        ...schedules,
        ...delivery,
        providerEventsApplied,
        ...cleanup,
        tokensExpired: checked(await db.rpc("cleanup_newsletter_tokens")),
      };
      if (delivery.retried || delivery.lostLease)
        throw new ApiError(
          503,
          "DELIVERY_RETRY",
          "Some newsletter deliveries need retry.",
        );
    } else if (match[1] === "form-cleanup") {
      const drafts = checked(
          await db.rpc("expire_form_drafts", { p_limit: 1000 }),
        ),
        responses = checked(
          await db.rpc("expire_form_responses", { p_limit: 500 }),
        ),
        files = await cleanupUploads({ db, limit: 50 }),
        media = await cleanupMedia({ db, limit: 50 });
      counts = {
        drafts,
        ...responses,
        ...files,
        mediaClaimed: media.claimed,
        mediaPurged: media.purged,
        mediaRetried: media.retried,
        eventMailReviewsExpired: checked(
          await db.rpc("cleanup_event_mail_reviews"),
        ),
        privacyReviewsExpired: checked(
          await db.rpc("cleanup_person_privacy_reviews"),
        ),
      };
      if (files.retried || media.retried)
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
    if (counts?.backlogRemaining)
      throw new ApiError(503, 'RETENTION_BACKLOG_REMAINING', 'Retention made progress and will retry its remaining backlog.');
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
