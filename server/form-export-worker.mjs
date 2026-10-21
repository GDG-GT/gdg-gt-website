import { serverDatabase } from "./db/client.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
import { tokenHash } from "./lib/security.mjs";
import { objectStorage } from "./lib/object-storage.mjs";
import { ApiError } from "./lib/http.mjs";
import { responseCsv, responseXlsx, safeCell } from "../shared/form-export.ts";

export function flattenExportResponse(r) {
  return {
    formId: r.formId, version: r.version, responseId: r.responseId,
    submittedAt: r.submittedAt, completionState: r.completionState,
    ...Object.fromEntries(Object.entries(r.answers).map(([id, answer]) => [
      `${answer.label || id} [${id}] v${r.version}`, answer.value,
    ])),
  };
}
export function createExportBytes(format, rows) {
  if (format === "xlsx" && rows.some((row) => Object.entries(row).some(([key, value]) => key.length > 32767 || safeCell(value).length > 32767)))
    throw new ApiError(413, "EXPORT_TOO_LARGE", "A cell exceeds Excel's text limit. Use CSV or JSON instead.");
  const content = format === "xlsx" ? responseXlsx(rows)
    : format === "json" ? JSON.stringify(rows, null, 2) : "\uFEFF" + responseCsv(rows);
  const bytes = Buffer.from(content);
  if (bytes.length > 64 * 1024 * 1024)
    throw new ApiError(413, "EXPORT_TOO_LARGE", "Narrow the export filters.");
  return bytes;
}
export async function runFormExportWorker({
  env = process.env, db = serverDatabase(env), storage: suppliedStorage, limit = 1,
} = {}) {
  const storage = suppliedStorage || objectStorage(env),
    counts = { claimed: 0, ready: 0, failed: 0, retried: 0, lostLease: 0, purged: 0, cleanupRetried: 0 };
  try {
    const jobs = checked(await db.rpc("claim_form_exports", { p_limit: limit }));
    counts.claimed = jobs.length;
    for (const job of jobs) {
      const key = `exports/${job.id}/${job.lease_token}.${job.format}`;
      try {
        const rows = [];
        let sourceBytes = 0, cells = 0;
        for (let offset = 0; offset < job.response_count; offset += 100) {
          const batch = checked(await db.rpc("read_form_export_batch", { p_job: job.id, p_lease: job.lease_token, p_offset: offset }));
          if (!batch.length) throw new ApiError(409, "FORM_EXPORT_CHANGED", "The responses changed.");
          sourceBytes += Buffer.byteLength(JSON.stringify(batch));
          for (const row of batch) {
            cells += Object.keys(row.answers).length + 5;
            rows.push(flattenExportResponse(row));
          }
          if (sourceBytes > 32 * 1024 * 1024 || cells > 200000)
            throw new ApiError(413, "EXPORT_TOO_LARGE", "Narrow the export filters.");
        }
        if (rows.length !== job.response_count) throw new ApiError(409, "FORM_EXPORT_CHANGED", "The responses changed.");
        // Version-specific columns may differ on every row. Bound the complete
        // rectangular workbook, not just the sparse source values.
        const columns = new Set(rows.flatMap((row) => Object.keys(row)));
        if (columns.size * Math.max(1, rows.length) > 200000)
          throw new ApiError(413, "EXPORT_TOO_LARGE", "Choose fewer columns or versions.");
        const bytes = createExportBytes(job.format, rows);
        await storage.put("form-exports", key, bytes, "application/octet-stream");
        const promoted = checked(await db.rpc("finish_form_export", {
          p_job: job.id, p_lease: job.lease_token, p_bytes: bytes.length,
          p_checksum: tokenHash(bytes), p_error: null,
        }));
        if (promoted) counts.ready++;
        else { await storage.delete("form-exports", key); counts.lostLease++; }
      } catch (error) {
        // A failed RPC response may follow a committed promotion. Never delete
        // the artifact on an ambiguous result; state-fenced cleanup owns it.
        const code = error instanceof ApiError && ["EXPORT_TOO_LARGE", "FORM_EXPORT_CHANGED", "NOT_FOUND"].includes(error.code)
          ? error.code === "NOT_FOUND" ? "SOURCE_OR_ACCESS_CHANGED" : error.code : "EXPORT_RETRY";
        checked(await db.rpc("finish_form_export", { p_job: job.id, p_lease: job.lease_token, p_bytes: null, p_checksum: null, p_error: code }));
        if (code === "EXPORT_RETRY") counts.retried++; else counts.failed++;
      }
    }
    const artifacts = checked(await db.rpc("claim_form_export_cleanup", { p_limit: 25 }));
    for (const artifact of artifacts) {
      try {
        await storage.delete("form-exports", artifact.object_key);
        checked(await db.from("form_export_artifacts").update({ purged_at: new Date().toISOString() })
          .eq("job_id", artifact.job_id).eq("lease_token", artifact.lease_token));
        counts.purged++;
      } catch { counts.cleanupRetried++; }
    }
  } finally { if (!suppliedStorage) storage.close(); }
  return counts;
}
