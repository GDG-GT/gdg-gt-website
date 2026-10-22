import { serverDatabase } from "./db/client.mjs";
import { serverConfig } from "./config.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
import { decryptPayload } from "./lib/encryption.mjs";
import { createPushTransport, pushConfig } from "./lib/push-transport.mjs";
export async function runPushWorker({
  db = serverDatabase(),
  env = process.env,
  limit = 10,
  transport,
} = {}) {
  const settings = pushConfig(env),
    outcome = {
      claimed: 0,
      accepted: 0,
      skipped: 0,
      expired: 0,
      retried: 0,
      failed: 0,
      lostLease: 0,
    };
  if (!settings.enabled || !settings.deliveryEnabled) return outcome;
  const config = serverConfig(env),
    sender = transport || createPushTransport(env),
    jobs = checked(
      await db.rpc("claim_event_push_jobs", {
        p_limit: limit,
      }),
    );
  outcome.claimed = jobs.length;
  for (const job of jobs) {
    let result = "retry",
      status = null;
    try {
      const notice = checked(
        await db.rpc("prepare_event_push", {
          p_job: job.id,
          p_lease: job.lease_token,
        }),
      );
      if (!notice) result = "skipped";
      else {
        status = await sender.send(
          decryptPayload(notice.encrypted, config.encryptionSecret),
          {
            type: "event-reminder",
            slug: notice.slug,
            occurrence: notice.eventStart,
          },
          notice.deliveryId,
        );
        result = [200, 201, 202].includes(status)
          ? "accepted"
          : [404, 410].includes(status)
            ? "expired"
            : status === 429 || status >= 500
              ? "retry"
              : "failed";
      }
    } catch {
      /* A sanitized result only; provider errors may contain endpoints. */
    }
    if (result === "retry" && job.attempt_count >= 6) result = "failed";
    if (
      !checked(
        await db.rpc("finish_event_push", {
          p_job: job.id,
          p_lease: job.lease_token,
          p_result: result,
          p_provider_status: status,
        }),
      )
    ) {
      outcome.lostLease++;
      continue;
    }
    outcome[result === "retry" ? "retried" : result]++;
  }
  return outcome;
}
