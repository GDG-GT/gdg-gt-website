import { serverDatabase } from "./db/client.mjs";
import { serverConfig } from "./config.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
import { decryptPayload } from "./lib/encryption.mjs";
import { createAppPushTransport, appPushConfig } from "./lib/app-push-transport.mjs";
import { appNotificationPayload } from "../shared/app-notifications.mjs";
export async function runAppPushWorker({ db = serverDatabase(), env = process.env, limit = 20, transport } = {}) {
  const settings = appPushConfig(env), result = { claimed: 0, accepted: 0, skipped: 0, expired: 0, retried: 0, failed: 0, lostLease: 0 };
  if (!settings.enabled || !settings.platforms.length) return result;
  const config = serverConfig(env), sender = transport || createAppPushTransport(env), jobs = checked(await db.rpc("claim_worker_jobs", { p_limit: limit, p_kinds: settings.platforms.map(platform => "app_push_" + platform) }));
  result.claimed = jobs.length;
  let next = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(5, jobs.length) }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++]; let status = "retry";
        try {
          const notice = checked(await db.rpc("prepare_app_push", { p_job: job.id, p_lease: job.lease_token }));
          status = notice ? await sender.send(notice, decryptPayload(notice.encrypted, config.encryptionSecret), appNotificationPayload(notice), job.id) : "skipped";
        } catch { /* Provider secrets and private notification content never enter logs. */ }
        if (!checked(await db.rpc("finish_app_push", { p_job: job.id, p_lease: job.lease_token, p_result: status }))) result.lostLease++;
        else result[status === "retry" ? "retried" : status]++;
      }
    }));
  } finally { sender.close?.(); }
  return result;
}
