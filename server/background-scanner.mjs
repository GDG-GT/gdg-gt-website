import { z } from "zod";
import { ApiError, apiBoundary, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import { authorizeJob } from "./lib/job-authorization.mjs";
import { serverDatabase } from "./db/client.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
import { objectStorage } from "./lib/object-storage.mjs";
import { tokenHash } from "./lib/security.mjs";
import { scanBuffer } from "./lib/scanner.mjs";
import { ensureServerlessScanner, nativeScannerEnvironment } from "./lib/serverless-scanner.mjs";

const requestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("job"), jobId: z.string().uuid(), leaseToken: z.string().uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ mode: z.literal("self-test") }).strict(),
]);
export function createBackgroundScanner({ env = process.env, database = serverDatabase,
  storageFactory = objectStorage, ensure = ensureServerlessScanner, scan = scanBuffer } = {}) {
  return (request, response) => apiBoundary(request, response, async requestId => {
    allowMethod(request, response, ["POST"]);
    authorizeJob(request, env);
    if (new URL(request.url, env.APP_ORIGIN).search) throw new ApiError(400, "VALIDATION_ERROR", "Scanner requests do not accept query controls.");
    const body = await jsonBody(request, requestSchema, 4096);
    const native = nativeScannerEnvironment(env);
    if (body.mode === "self-test") {
      const health = await ensure(native);
      const clean = await scan(Buffer.from("Owned clean technical scanner verification.\n"), native);
      const eicar = Buffer.from("WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=", "base64");
      const rejected = await scan(eicar, native);
      if (!clean.clean || rejected.clean || rejected.code !== "MALWARE_DETECTED") throw new ApiError(503, "SCANNER_UNAVAILABLE", "Scanner verification did not pass.");
      return sendJson(response, 200, { verified: true, cleanAccepted: true, antivirusTestRejected: true, signatureVersion: health.signatureVersion }, requestId);
    }
    const db = database(env), job = checked(await db.from("delivery_jobs")
      .select("id,kind,payload,state,lease_token,locked_until").eq("id", body.jobId).maybeSingle());
    const purposes = { upload_scan: ["form", "blog", "finance"], contact_upload_scan: ["contact"], media_upload_scan: ["media"] };
    if (!job || !Object.hasOwn(purposes, job.kind) || job.state !== "running" ||
        job.lease_token !== body.leaseToken || !Number.isFinite(Date.parse(job.locked_until)) ||
        Date.parse(job.locked_until) <= Date.now()) throw new ApiError(409, "JOB_LEASE_LOST", "This scan no longer owns its queued work.");
    const upload = checked(await db.from("upload_intents").select("purpose,state,deleted_at,bucket,quarantine_key,expected_bytes,expected_sha256")
      .eq("id", job.payload.uploadId).maybeSingle());
    if (!upload || upload.deleted_at || upload.state !== "queued" || !purposes[job.kind].includes(upload.purpose) ||
        !Number.isSafeInteger(upload.expected_bytes) || upload.expected_bytes < 1 || upload.expected_bytes > 52428800 ||
        upload.expected_sha256 !== body.sha256) throw new ApiError(409, "INVALID_UPLOAD", "The queued file changed.");
    const storage = storageFactory(env);
    try {
      const bytes = await storage.bytes(upload.bucket, upload.quarantine_key, upload.expected_bytes);
      if (bytes.length !== upload.expected_bytes || tokenHash(bytes) !== body.sha256) throw new ApiError(409, "CHECKSUM_MISMATCH", "The queued file changed.");
      const health = await ensure(native), result = await scan(bytes, native);
      // A result never promotes a file. The queue consumer retains the original
      // lease and performs normalization and fenced publication independently.
      return sendJson(response, 200, { ...result, sha256: body.sha256, signatureVersion: health.signatureVersion }, requestId);
    } finally { storage.close(); }
  });
}
