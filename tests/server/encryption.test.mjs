import { describe, it, expect } from "vitest";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import {
  encryptPayload,
  decryptPayload,
} from "../../server/lib/encryption.mjs";
const secret = "fictional-encryption-test-secret-".repeat(2);
describe("SEC encrypted delivery payload authentication", () => {
  it("round-trips JSON and unicode with independent nonces and no plaintext payload", () => {
    for (const value of [
      null,
      false,
      0,
      "Fictional café 🐝",
      { recipient: "fictional@example.test", values: [1, true, null] },
    ]) {
      const a = encryptPayload(value, secret),
        b = encryptPayload(value, secret);
      expect(a).not.toBe(b);
      expect(decryptPayload(a, secret)).toEqual(value);
      expect(a).not.toContain("fictional@example.test");
    }
  });
  it("fails closed for missing, non-string and short configuration in both directions", () => {
    const encrypted = encryptPayload({ fictional: true }, secret);
    for (const key of [undefined, null, 42, "", "short"]) {
      expect(() => encryptPayload({}, key)).toThrow(
        expect.objectContaining({ status: 503 }),
      );
      expect(() => decryptPayload(encrypted, key)).toThrow(
        expect.objectContaining({ status: 503 }),
      );
    }
  });
  it("rejects missing frame parts, unknown versions, surplus parts, corrupt tags and wrong keys", () => {
    const encrypted = encryptPayload({ fixture: true }, secret),
      [version, iv, tag, data] = encrypted.split(".");
    for (const value of [
      undefined,
      null,
      "",
      "v0.a.b.c",
      `${version}..${tag}.${data}`,
      `${version}.${iv}..${data}`,
      `${version}.${iv}.${tag}.`,
      encrypted + ".extra",
      `${version}.${iv}.invalid.${data}`,
    ])
      expect(() => decryptPayload(value, secret)).toThrow();
    expect(() => decryptPayload(encrypted, secret + "wrong")).toThrow();
  });
  it("authenticates its domain AAD and rejects authenticated but invalid JSON", () => {
    const frame = (plaintext, aad) => {
      const iv = randomBytes(12),
        key = createHash("sha256")
          .update("gdg-gt/encrypted-delivery/v1\0" + secret)
          .digest(),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(aad));
      const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return [
        "v1",
        iv.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
        body.toString("base64url"),
      ].join(".");
    };
    expect(() => decryptPayload(frame("{}", "wrong-domain"), secret)).toThrow();
    expect(() =>
      decryptPayload(frame("not JSON", "gdg-gt-delivery-v1"), secret),
    ).toThrow();
  });
});
