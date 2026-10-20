import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { unavailable } from "./http.mjs";
function key(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw unavailable();
  return createHash("sha256")
    .update("gdg-gt/encrypted-delivery/v1\0" + secret)
    .digest();
}
export function encryptPayload(value, secret) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from("gdg-gt-delivery-v1"));
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    bytes.toString("base64url"),
  ].join(".");
}
export function decryptPayload(value, secret) {
  const [version, iv, tag, data, ...extra] = String(value).split(".");
  if (version !== "v1" || extra.length || !iv || !tag || !data)
    throw unavailable();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(secret),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from("gdg-gt-delivery-v1"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  );
}
