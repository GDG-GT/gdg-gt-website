import { serverDatabase } from "./db/client.mjs";
import { objectStorage } from "./lib/object-storage.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
export async function cleanupUploads({
  env = process.env,
  db = serverDatabase(env),
  limit = 50,
} = {}) {
  const storage = objectStorage(env),
    records = [
      ...checked(await db.rpc("claim_upload_cleanup", { p_limit: limit })),
      ...checked(
        await db.rpc("claim_finance_upload_cleanup", { p_limit: limit }),
      ),
      ...checked(await db.rpc("claim_blog_upload_cleanup", { p_limit: limit })),
    ],
    result = { claimed: records.length, purged: 0, retried: 0 };
  try {
    for (const record of records) {
      try {
        // Only server-generated intent keys can be selected; no caller-supplied path.
        if (
          !(
            (record.purpose === "form" && record.bucket === "form-uploads") ||
            (record.purpose === "finance" &&
              record.bucket === "finance-attachments" &&
              record.state !== "clean") ||
            (record.purpose === "blog" &&
              record.bucket === "blog-submissions" &&
              record.state !== "clean")
          ) ||
          !record.quarantine_key.startsWith("quarantine/") ||
          (record.clean_key && !record.clean_key.startsWith("clean/"))
        )
          throw new Error("Invalid stored key");
        await storage.delete(record.bucket, record.quarantine_key);
        if (record.clean_key)
          await storage.delete(record.bucket, record.clean_key);
        checked(
          await db
            .from("upload_intents")
            .update({ purged_at: new Date().toISOString() })
            .eq("id", record.id)
            .not("deleted_at", "is", null),
        );
        result.purged++;
      } catch {
        result.retried++;
      }
    }
  } finally {
    storage.close();
  }
  return result;
}
