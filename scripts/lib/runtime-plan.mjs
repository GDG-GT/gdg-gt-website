export const scheduledJobs = [
  ["form-schedules", 300000], ["form-cleanup", 3600000], ["delivery", 60000],
  ["task-overdue", 900000], ["announcements", 300000], ["newsletter-campaigns", 300000],
  ["event-push", 300000], ["session-cleanup", 86400000],
  ["notification-cleanup", 86400000], ["report-cache-cleanup", 86400000], ["operations-monitor", 300000],
];
export const workerGroups = ["uploads", "media", "exports", "newsletter"];
export function runtimeOrigin(env, confirmed) {
  const origin = new URL(env.APP_ORIGIN);
  if (env.NODE_ENV !== "production" || origin.protocol !== "https:" || origin.origin !== confirmed ||
      origin.href !== origin.origin + "/" || origin.username || origin.password ||
      ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) || env.ALLOW_INSECURE_LOCAL_COOKIES === "true")
    throw Error("Production execution requires the exact confirmed HTTPS application origin and secure cookies.");
  return origin.origin;
}
export function dueJobs(previous, now) {
  return scheduledJobs.filter(([name]) => (previous.get(name) || 0) <= now);
}
export async function invokeScheduledJob(name, { origin, secret, fetcher = fetch }) {
  if (!scheduledJobs.some(([job]) => job === name) || !secret || secret.length < 32) throw Error("Invalid scheduled job configuration.");
  const response = await fetcher(origin + "/api/v1/jobs/" + name, {
    method: "POST", redirect: "error", headers: { Authorization: "Bearer " + secret }, signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw Error("Scheduled job failed.");
  const result = await response.json();
  if (!result?.data || !(result.data.runId || result.data.skipped)) throw Error("Invalid scheduled job response.");
  return { runId: result.data.runId, skipped: result.data.skipped, counts: result.data.counts };
}
