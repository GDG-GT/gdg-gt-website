import sharp from "sharp";
import { serverDatabase } from "./db/client.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
import { tokenHash } from "./lib/security.mjs";
import { objectStorage } from "./lib/object-storage.mjs";
import { ApiError } from "./lib/http.mjs";
export async function runMediaPublicationWorker({
  env = process.env,
  db = serverDatabase(env),
  limit = 1,
} = {}) {
  const storage = objectStorage(env),
    result = { claimed: 0, published: 0, invalidated: 0, retried: 0 };
  try {
    const jobs = checked(
      await db.rpc("claim_worker_jobs", {
        p_limit: limit,
        p_kinds: ["media_publish"],
      }),
    );
    result.claimed = jobs.length;
    for (const job of jobs) {
      try {
        const source = checked(
          await db.rpc("prepare_media_publication", {
            p_job: job.id,
            p_lease: job.lease_token,
          }),
        );
        if (!source) {
          result.invalidated++;
          continue;
        }
        const original = await storage.bytes(
          "media",
          source.sourceKey,
          source.bytes,
        );
        if (
          original.length !== source.bytes ||
          tokenHash(original) !== source.sha256
        )
          throw new ApiError(
            400,
            "CHECKSUM_MISMATCH",
            "The approved source changed.",
          );
        const variants = [];
        for (const variant of source.variants) {
          const { data, info } = await sharp(original, {
            limitInputPixels: 40000000,
            failOn: "warning",
          })
            .rotate()
            .resize({
              width: variant.widthKey,
              height: 16000,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 82, effort: 4 })
            .toBuffer({ resolveWithObject: true });
          if (data.length > 3670016)
            throw new ApiError(
              400,
              "MEDIA_VARIANT_TOO_LARGE",
              "An image derivative exceeds its safe response budget.",
            );
          // Keys were reserved durably before writing bytes. Lost leases and
          // unknown commit outcomes are cleaned only after DB state review.
          await storage.put("media", variant.key, data, "image/webp");
          variants.push({
            widthKey: variant.widthKey,
            width: info.width,
            height: info.height,
            bytes: data.length,
            sha256: tokenHash(data),
          });
        }
        const committed = checked(
          await db.rpc("finish_media_publication", {
            p_job: job.id,
            p_lease: job.lease_token,
            p_variants: variants,
            p_error: null,
          }),
        );
        if (committed) result.published++;
        else result.invalidated++;
      } catch (error) {
        if (error instanceof ApiError && error.status === 400) {
          checked(
            await db.rpc("finish_media_publication", {
              p_job: job.id,
              p_lease: job.lease_token,
              p_variants: [],
              p_error: error.code,
            }),
          );
          result.invalidated++;
        } else {
          checked(
            await db.rpc("finish_delivery_job", {
              p_id: job.id,
              p_lease: job.lease_token,
              p_success: false,
              p_provider_id: null,
              p_error_code: "MEDIA_PUBLICATION_RETRY",
            }),
          );
          result.retried++;
        }
      }
    }
  } finally {
    storage.close();
  }
  return result;
}
