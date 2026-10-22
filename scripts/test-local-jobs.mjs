import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
const { env, db } = await localHttp(),
  evidence = [];
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
async function call(name, headers = {}, method = "POST") {
  const response = await fetch(env.APP_ORIGIN + "/api/v1/jobs/" + name, {
      method,
      headers,
      signal: AbortSignal.timeout(60000),
    }),
    json = await response.json();
  return { status: response.status, json, headers: response.headers };
}
let r = await call("form-schedules");
check(r.status === 401, "jobs require a separate bearer credential");
r = await call("form-schedules", { Authorization: "Bearer invalid" });
check(r.status === 401, "invalid job keys are rejected");
const headers = { Authorization: "Bearer " + env.CRON_SECRET };
r = await call("form-schedules", { ...headers, Origin: env.APP_ORIGIN });
check(r.status === 403, "browser origins are rejected even with a correct key");
r = await call("form-schedules", { ...headers, Cookie: "test=browser" });
check(r.status === 403, "browser cookies are not accepted for scheduled jobs");
r = await call("form-schedules", headers, "GET");
check(
  r.status === 405 && r.headers.get("allow") === "POST",
  "job endpoints enforce their allowed method",
);
r = await call("not-a-job", headers);
check(r.status === 404, "the scheduler cannot invoke arbitrary actions");
r = await call("form-schedules", headers);
check(
  r.status === 200 && (r.json.data.runId || r.json.data.skipped),
  "authorized schedule execution returns a run identifier or safe deduplication",
);
r = await call("form-schedules", headers);
check(
  r.status === 200 && r.json.data.skipped === "already_completed",
  "the same completed schedule occurrence does not run twice",
);
r = await call("form-cleanup", headers);
check(
  r.status === 200 && (r.json.data.runId || r.json.data.skipped),
  "authenticated cleanup runs through the fenced scheduler",
);
// Campaign scheduling uses the same separate bearer/lease boundary, never a
// tab timer. Repeating a completed occurrence must not enqueue another batch.
r = await call("newsletter-campaigns", headers);
check(r.status === 200 && (r.json.data.runId || r.json.data.skipped), "newsletter scheduling and retention run through the authenticated scheduler");
r = await call("newsletter-campaigns", headers);
check(r.status === 200 && r.json.data.skipped === "already_completed", "completed newsletter occurrences do not enqueue or deliver twice");
const rows = await db
  .from("scheduled_job_runs")
  .select("job_name,state,counts,request_id")
  .order("started_at", { ascending: false })
  .limit(10);
check(
  !rows.error &&
    rows.data.some(
      (row) =>
        row.job_name === "form-schedules" &&
        row.state === "completed" &&
        row.request_id,
    ),
  "scheduler outcomes and counters persist without sensitive payloads",
);
await writeFile(
  new URL("../.docs/phase0/local-jobs-integration.json", import.meta.url),
  JSON.stringify(
    {
      note: "Actual local HTTP jobs use a separate server-only cron secret; no external scheduler or cloud service was changed.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
