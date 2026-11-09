import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";
import {
  googleWalletConfiguration,
  generateGoogleMemberPass,
} from "../../server/rewards-google-wallet.mjs";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const env = {
  GOOGLE_WALLET_ENABLED: "true",
  GOOGLE_WALLET_ISSUER_ID: "1234567890123456789",
  GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL:
    "wallet@example-test.iam.gserviceaccount.com",
  GOOGLE_WALLET_SERVICE_ACCOUNT_KEY: privateKey.export({
    type: "pkcs8",
    format: "pem",
  }),
};
const record = {
  credential: "A".repeat(43),
  id: "b2100000-0000-4000-8000-000000000001",
  name: "Test Member",
  env,
};
const calls = [];
let fetchImpl;
beforeEach(() => {
  calls.length = 0;
  fetchImpl = vi.fn(async (url, options) => {
    calls.push({ url, ...options });
    return new Response(
      JSON.stringify(
        url.includes("oauth2")
          ? { access_token: "fixture-oauth-token", expires_in: 3600 }
          : { id: record.id },
      ),
      { status: 200 },
    );
  });
});
describe("Google Wallet member passes", () => {
  it("is disabled until complete RSA issuer configuration exists", () => {
    expect(googleWalletConfiguration({})).toBeNull();
    expect(
      googleWalletConfiguration({
        ...env,
        GOOGLE_WALLET_ISSUER_ID: "https://evil.test",
      }),
    ).toBeNull();
    expect(
      googleWalletConfiguration({
        ...env,
        GOOGLE_WALLET_SERVICE_ACCOUNT_KEY: "not-a-key",
      }),
    ).toBeNull();
    expect(googleWalletConfiguration(env).approved).toBe(false);
    expect(
      googleWalletConfiguration({
        ...env,
        GOOGLE_WALLET_PUBLISHING_APPROVED: "true",
      }).approved,
    ).toBe(true);
  });
  it("signs a short save link referencing the same opaque member credential", async () => {
    const url = await generateGoogleMemberPass({ ...record, fetchImpl });
    expect(url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
    const token = url.split("/save/")[1],
      [header, payload, signature] = token.split(".");
    expect(token.length).toBeLessThan(1800);
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(header + "." + payload),
        publicKey,
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    const claims = JSON.parse(Buffer.from(payload, "base64url"));
    expect(claims.payload.genericObjects).toEqual([
      { id: "1234567890123456789.member_b2100000000040008000000000000001" },
    ]);
    expect(payload).not.toContain(record.credential);
    const object = JSON.parse(calls.find((c) => c.method === "PUT").body);
    expect(object.barcode.value).toBe(record.credential);
    expect(object.header.defaultValue.value).toBe(record.name);
    expect(calls.every((c) => c.redirect === "error" && c.signal)).toBe(true);
    expect(url).not.toContain("PRIVATE");
  });
  it("creates missing resources and safely handles a concurrent create", async () => {
    fetchImpl.mockImplementation(async (url, options) => {
      calls.push({ url, ...options });
      if (url.includes("oauth2"))
        return new Response(
          JSON.stringify({
            access_token: "fixture-oauth-token",
            expires_in: 3600,
          }),
        );
      if (options.method === "PUT")
        return new Response("{}", {
          status:
            calls.filter((c) => c.method === "PUT").length === 1 ? 404 : 200,
        });
      if (options.method === "POST") return new Response("{}", { status: 409 });
      return new Response("{}");
    });
    await generateGoogleMemberPass({ ...record, fetchImpl });
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(2);
  });
  it("does not issue a link when Google rejects the issuer or is offline", async () => {
    fetchImpl.mockResolvedValue(new Response("{}", { status: 403 }));
    await expect(
      generateGoogleMemberPass({ ...record, fetchImpl }),
    ).rejects.toMatchObject({ code: "GOOGLE_WALLET_UNAVAILABLE" });
    fetchImpl.mockRejectedValue(new Error("secret provider detail"));
    await expect(
      generateGoogleMemberPass({ ...record, fetchImpl }),
    ).rejects.toMatchObject({
      message: "Google Wallet could not be reached. Try again.",
    });
  });
  it("rejects malformed member data before contacting Google", async () => {
    await expect(
      generateGoogleMemberPass({
        ...record,
        credential: "not-valid",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "INVALID_WALLET_PASS" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
