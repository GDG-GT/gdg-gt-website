import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyNewsletterWebhook } from "../../server/newsletter-webhook.mjs";
const secret = "whsec_" + Buffer.alloc(32, 7).toString("base64"),
  bytes = Buffer.from(
    '{"type":"email.bounced", "data":{"email_id":"fictional"}}',
  ),
  now = 1792627000000,
  headers = {
    "svix-id": "msg_fictional",
    "svix-timestamp": String(now / 1000),
  };
headers["svix-signature"] =
  "v1," +
  createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(headers["svix-id"] + "." + headers["svix-timestamp"] + ".")
    .update(bytes)
    .digest("base64");
describe("Signed provider callbacks", () => {
  it("verifies the exact original bytes with constant-time HMAC and bounded timestamp", () => {
    expect(verifyNewsletterWebhook(bytes, headers, secret, now)).toMatchObject({
      eventHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    for (const [body, h, time] of [
      [Buffer.from(JSON.stringify(JSON.parse(bytes))), headers, now],
      [bytes, { ...headers, "svix-id": "msg_other" }, now],
      [
        bytes,
        { ...headers, "svix-signature": "v1," + "a".repeat(43) + "=" },
        now,
      ],
      [bytes, headers, now + 301000],
      [bytes, headers, now - 301000],
    ])
      expect(() => verifyNewsletterWebhook(body, h, secret, time)).toThrow();
  });
  it("supports multiple rotation signatures but never unsigned or object-parsed bodies", () => {
    expect(() =>
      verifyNewsletterWebhook(
        bytes,
        {
          ...headers,
          "svix-signature": "v2,ignored " + headers["svix-signature"],
        },
        secret,
        now,
      ),
    ).not.toThrow();
    expect(() =>
      verifyNewsletterWebhook(JSON.parse(bytes), headers, secret, now),
    ).toThrow();
    expect(() => verifyNewsletterWebhook(bytes, headers, "", now)).toThrow();
    expect(() =>
      verifyNewsletterWebhook(Buffer.alloc(262145), headers, secret, now),
    ).toThrow();
  });
});
