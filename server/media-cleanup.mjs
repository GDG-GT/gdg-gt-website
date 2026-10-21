import { serverDatabase } from "./db/client.mjs";
import { objectStorage } from "./lib/object-storage.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
export async function cleanupMedia({
  env = process.env,
  db = serverDatabase(env),
  limit = 50,
} = {}) {
  const storage = objectStorage(env),
    result = { claimed: 0, purged: 0, retried: 0 };
  try {
    const files = checked(
      await db.rpc("claim_media_upload_cleanup", { p_limit: limit }),
    );
    result.claimed += files.length;
    for (const file of files) {
      try {
        if (
          file.purpose !== "media" ||
          file.bucket !== "media" ||
          !file.quarantine_key.startsWith("quarantine/") ||
          (file.clean_key && !file.clean_key.startsWith(`clean/${file.id}/`))
        )
          throw Error("Invalid stored media cleanup key");
        await storage.delete("media", file.quarantine_key);
        if (file.clean_key) await storage.delete("media", file.clean_key);
        if (
          !checked(
            await db.rpc("finish_media_upload_cleanup", { p_upload: file.id }),
          )
        )
          throw Error("Media cleanup acknowledgement did not commit");
        result.purged++;
      } catch {
        result.retried++;
      }
    }
    const objects = checked(
      await db.rpc("claim_media_object_cleanup", { p_limit: limit }),
    );
    result.claimed += objects.length;
    for (const object of objects) {
      try {
        if (
          !(
            (object.kind === "scan" &&
              /^clean\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(object.key)) ||
            (object.kind === "derivative" &&
              /^public\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/(360|960|1920)\.webp$/.test(
                object.key,
              ))
          )
        )
          throw Error("Invalid stored media artifact key");
        await storage.delete("media", object.key);
        if (
          !checked(
            await db.rpc("finish_media_object_cleanup", {
              p_object: object.id,
              p_kind: object.kind,
            }),
          )
        )
          throw Error("Media artifact cleanup acknowledgement did not commit");
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
