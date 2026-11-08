import { ApiError } from "./http.mjs";
import { tokenHash } from "./security.mjs";

const unavailable = () => new ApiError(503, "SCANNER_UNAVAILABLE", "The private file scanner could not complete this scan.");
export async function scanQueuedObject(bytes, env, context, fetcher = fetch) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  if (!uuid.test(context?.jobId || "") || !uuid.test(context?.leaseToken || "") ||
      typeof env.CRON_SECRET !== "string" || env.CRON_SECRET.length < 32) throw unavailable();
  let origin;
  try { origin = new URL(env.APP_ORIGIN); } catch { throw unavailable(); }
  if (origin.protocol !== "https:" || origin.href !== origin.origin + "/" || origin.username || origin.password) throw unavailable();
  const sha256 = tokenHash(bytes);
  let response;
  try {
    response = await fetcher(origin.origin + "/api/scanner", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(230000),
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.CRON_SECRET },
      // File bytes stay in private Storage. The isolated scanner rechecks the
      // active lease and checksum before reading that exact quarantined object.
      body: JSON.stringify({ mode: "job", jobId: context.jobId, leaseToken: context.leaseToken, sha256 }),
    });
  } catch { throw unavailable(); }
  if (!response.ok) throw unavailable();
  let result;
  try { result = (await response.json()).data; } catch { throw unavailable(); }
  if (!result || result.sha256 !== sha256 || typeof result.clean !== "boolean" ||
      !/^\d+$/.test(String(result.signatureVersion)) || (!result.clean && result.code !== "MALWARE_DETECTED")) throw unavailable();
  return result.clean ? { clean: true } : { clean: false, code: "MALWARE_DETECTED" };
}
