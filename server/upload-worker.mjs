import { randomUUID } from "node:crypto";
import { serverDatabase } from "./db/client.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
import { tokenHash } from "./lib/security.mjs";
import { objectStorage } from "./lib/object-storage.mjs";
import { scanBuffer } from "./lib/scanner.mjs";
import { normalizeUpload } from "./lib/upload-content.mjs";
import { normalizeMedia } from "./lib/media-content.mjs";
import { ApiError } from "./lib/http.mjs";
export async function runUploadWorker({
  env = process.env,
  db = serverDatabase(env),
  limit = 5,
  media = false,
} = {}) {
  const storage = objectStorage(env),
    jobs = checked(
      await db.rpc("claim_worker_jobs", {
        p_limit: limit,
        p_kinds: [media ? "media_upload_scan" : "upload_scan"],
      }),
    ),
    result = {
      claimed: jobs.length,
      clean: 0,
      rejected: 0,
      retried: 0,
      lostLease: 0,
    };
  try {
    for (const job of jobs) {
      let cleanKey;
      try {
        const record = checked(
          await db
            .from("upload_intents")
            .select("*")
            .eq("id", job.payload.uploadId)
            .maybeSingle(),
        );
        if (!record || record.deleted_at || record.state !== "queued") {
          checked(
            await db.rpc("finish_delivery_job", {
              p_id: job.id,
              p_lease: job.lease_token,
              p_success: true,
              p_provider_id: null,
              p_error_code: null,
            }),
          );
          continue;
        }
        const bytes = await storage.bytes(
          record.bucket,
          record.quarantine_key,
          record.expected_bytes,
        );
        if (
          bytes.length !== record.expected_bytes ||
          tokenHash(bytes) !== record.expected_sha256
        )
          throw new ApiError(
            400,
            "CHECKSUM_MISMATCH",
            "File checksum mismatch.",
          );
        const scan = await scanBuffer(bytes, env);
        if (!scan.clean)
          throw new ApiError(
            400,
            "MALWARE_DETECTED",
            "The uploaded file failed scanning.",
          );
        const normalized = await (media ? normalizeMedia : normalizeUpload)(
          bytes,
          record.filename,
          record.declared_mime,
          env,
        );
        cleanKey = media
          ? checked(
              await db.rpc("reserve_media_scan_object", {
                p_job: job.id,
                p_lease: job.lease_token,
              }),
            )
          : "clean/" + record.id + "/" + randomUUID();
        if (!cleanKey) {
          result.lostLease++;
          continue;
        }
        await storage.put(
          record.bucket,
          cleanKey,
          normalized.bytes,
          normalized.mime,
        );
        const committed = checked(
          await db.rpc(
            media ? "finish_media_upload_scan" : "finish_upload_scan",
            {
              p_job: job.id,
              p_lease: job.lease_token,
              p_clean_key: cleanKey,
              p_mime: normalized.mime,
              p_bytes: normalized.bytes.length,
              p_sha256: tokenHash(normalized.bytes),
              p_reject: null,
              ...(media
                ? {
                    p_metadata: {
                      width: normalized.width,
                      height: normalized.height,
                      duration: normalized.duration,
                    },
                  }
                : {}),
            },
          ),
        );
        if (!committed) {
          await storage.delete(record.bucket, cleanKey);
          result.lostLease++;
        } else result.clean++;
      } catch (error) {
        const permanent = error instanceof ApiError && error.status === 400,
          code = error instanceof ApiError ? error.code : "SCAN_RETRY";
        let committed;
        if (permanent)
          committed = checked(
            await db.rpc(
              media ? "finish_media_upload_scan" : "finish_upload_scan",
              {
                p_job: job.id,
                p_lease: job.lease_token,
                p_clean_key: null,
                p_mime: null,
                p_bytes: null,
                p_sha256: null,
                p_reject: code,
                ...(media ? { p_metadata: {} } : {}),
              },
            ),
          );
        else
          committed = checked(
            await db.rpc("finish_delivery_job", {
              p_id: job.id,
              p_lease: job.lease_token,
              p_success: false,
              p_provider_id: null,
              p_error_code: code,
            }),
          );
        if (!committed) result.lostLease++;
        else if (permanent) result.rejected++;
        else result.retried++;
      }
    }
  } finally {
    storage.close();
  }
  return result;
}
