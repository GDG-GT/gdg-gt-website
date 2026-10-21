import { readFile, chmod } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { scannerHealth } from "../server/lib/scanner.mjs";
const { db, env } = await localHttp();
await scannerHealth(env);
for (const [id, max] of [
  ["form-uploads", 26214400],
  ["form-exports", 67108864],
  ["contact-attachments", 10485760],
  ["finance-attachments", 10485760],
  ["blog-submissions", 20971520],
  ["media", 262144000],
]) {
  const found = await db.storage.getBucket(id);
  if (found.error) {
    const created = await db.storage.createBucket(id, {
      public: false,
      fileSizeLimit: max,
    });
    if (created.error)
      throw new Error("Could not create private bucket: " + id);
  } else if (found.data.public)
    throw new Error("Refusing an unexpectedly public bucket: " + id);
  console.info("Private bucket ready: " + id);
}
// This script checks transport prerequisites only. Enabling the API remains an
// explicit local configuration change after integration verification.
const source = await readFile(
  new URL("../.env.server.local", import.meta.url),
  "utf8",
);
if (!source.includes("S3_ENDPOINT="))
  throw new Error("Missing server-only S3 configuration.");
await chmod(new URL("../.env.server.local", import.meta.url), 0o600);
