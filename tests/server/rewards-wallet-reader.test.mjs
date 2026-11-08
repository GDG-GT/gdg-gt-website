import {
  createCipheriv,
  createHash,
  diffieHellman,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import { describe, it, expect, vi } from "vitest";
const { issuer } = vi.hoisted(() => ({ issuer: { value: null } }));
vi.mock("../../server/rewards-wallet.mjs", () => ({
  walletConfiguration: () => issuer.value,
}));
import {
  walletReaderConfiguration,
  decryptWalletData,
  createWalletChallenge,
  verifyWalletChallenge,
  walletReaderRoute,
} from "../../server/rewards-wallet-reader.mjs";
import { encryptPayload } from "../../server/lib/encryption.mjs";
const sha = (v) => createHash("sha256").update(v).digest();
const pass = "pass.dev.gdggt.membership";
const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const reader = {
  privateKey: pair.privateKey,
  keyId: sha(
    Buffer.from(pair.publicKey.export({ format: "jwk" }).x, "base64url"),
  ).subarray(0, 4),
  passTypeIdentifier: pass,
};
const now = Date.now(),
  credential = "R".repeat(43);
function cryptogram(
  variant = 1,
  time = now,
  message = Buffer.from(credential),
) {
  const ephemeral = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const z = diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: pair.publicKey,
  });
  const merchant = sha(pass),
    context = Buffer.from("ApplePay encrypted VAS data");
  const sharedInfo =
    variant === 1
      ? Buffer.concat([
          Buffer.from([0x0d]),
          Buffer.from("id-aes256-GCM"),
          context,
          merchant,
        ])
      : context;
  const kdf = createHash("sha256");
  kdf.update(z);
  kdf.update(Buffer.from("00000001", "hex"));
  kdf.update(sharedInfo);
  const aes = createCipheriv("aes-256-gcm", kdf.digest(), Buffer.alloc(16));
  if (variant === 2) aes.setAAD(merchant);
  const timestamp = Buffer.alloc(4);
  timestamp.writeUInt32BE(Math.floor((time - Date.UTC(2001, 0, 1)) / 1000));
  const ciphertext = Buffer.concat([
    aes.update(Buffer.concat([timestamp, message])),
    aes.final(),
  ]);
  return Buffer.concat([
    reader.keyId,
    Buffer.from(ephemeral.publicKey.export({ format: "jwk" }).x, "base64url"),
    ciphertext,
    aes.getAuthTag(),
  ]).toString("base64");
}
const session = { user: { id: "actor" }, sessionId: "session" },
  config = { encryptionSecret: "fictional-reader-encryption-secret-32" };
describe("Wallet VAS authentication and freshness", () => {
  it.each([1, 2])("decrypts authenticated protocol variant %s", (variant) =>
    expect(decryptWalletData(cryptogram(variant), reader, now).credential).toBe(
      credential,
    ),
  );
  it.each([-80000, 10000])(
    "rejects a stale or future cryptogram (%s ms)",
    (offset) =>
      expect(() =>
        decryptWalletData(cryptogram(1, now + offset), reader, now),
      ).toThrow(),
  );
  it("rejects tampered tags, ciphertext, key IDs, malformed points and payloads", () => {
    const valid = Buffer.from(cryptogram(), "base64");
    for (const offset of [0, 10, 38, 98]) {
      const modified = Buffer.from(valid);
      modified[offset] ^= 128;
      expect(() =>
        decryptWalletData(modified.toString("base64"), reader, now),
      ).toThrow();
    }
    for (const value of [
      "",
      valid.toString("base64") + "=",
      randomBytes(99).toString("base64"),
      cryptogram(1, now, Buffer.alloc(43, 0xff)),
      cryptogram(1, now, Buffer.from("short")),
    ])
      expect(() => decryptWalletData(value, reader, now)).toThrow();
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    expect(() =>
      decryptWalletData(
        valid.toString("base64"),
        { ...reader, privateKey: other.privateKey },
        now,
      ),
    ).toThrow();
  });
  it("binds encrypted challenges to purpose, session, actor, issuer and expiry", () => {
    const challenge = createWalletChallenge(session, config, reader, now);
    expect(
      verifyWalletChallenge(challenge, session, config, reader, now).purpose,
    ).toBe("gdg-wallet-read-v1");
    for (const [s, r, t] of [
      [{ ...session, sessionId: "other" }, reader, now],
      [{ user: { id: "other" }, sessionId: "session" }, reader, now],
      [session, { ...reader, passTypeIdentifier: "other" }, now],
      [session, reader, now + 75000],
      [session, reader, now - 1],
    ])
      expect(() => verifyWalletChallenge(challenge, s, config, r, t)).toThrow();
    expect(() =>
      verifyWalletChallenge(
        challenge.slice(0, -3) + "abc",
        session,
        config,
        reader,
        now,
      ),
    ).toThrow();
    const data = verifyWalletChallenge(challenge, session, config, reader, now);
    for (const change of [
      { purpose: "other" },
      { nonce: "short" },
      { expires: now + 1000000 },
      { issued: null },
    ])
      expect(() =>
        verifyWalletChallenge(
          encryptPayload({ ...data, ...change }, config.encryptionSecret),
          session,
          config,
          reader,
          now,
        ),
      ).toThrow();
  });
  it("requires explicit flags, active NFC issuer and matching P256 keys", () => {
    const env = {
      APPLE_WALLET_VAS_READER_ENABLED: "true",
      APPLE_WALLET_VAS_PRIVATE_KEY: pair.privateKey.export({
        type: "pkcs8",
        format: "pem",
      }),
    };
    issuer.value = null;
    expect(walletReaderConfiguration(env)).toBeNull();
    issuer.value = {
      nfcEnabled: true,
      encryptionPublicKey: pair.publicKey
        .export({ type: "spki", format: "der" })
        .toString("base64"),
      passTypeIdentifier: pass,
    };
    expect(walletReaderConfiguration(env)?.keyId).toEqual(reader.keyId);
    expect(
      walletReaderConfiguration({
        ...env,
        APPLE_WALLET_VAS_READER_ENABLED: "false",
      }),
    ).toBeNull();
    expect(
      walletReaderConfiguration({
        ...env,
        APPLE_WALLET_VAS_PRIVATE_KEY: "bad",
      }),
    ).toBeNull();
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    expect(
      walletReaderConfiguration({
        ...env,
        APPLE_WALLET_VAS_PRIVATE_KEY: other.privateKey.export({
          type: "pkcs8",
          format: "pem",
        }),
      }),
    ).toBeNull();
    issuer.value = null;
  });
  it("leaves the unconfigured reader unavailable without a database write", async () => {
    issuer.value = null;
    const reply = vi.fn(() => true),
      db = { rpc: vi.fn() },
      response = { setHeader: vi.fn() },
      ctx = { session, config, db, env: {}, reply, response };
    expect(
      await walletReaderRoute("/wallet-reader", { method: "GET" }, ctx),
    ).toBe(true);
    expect(reply).toHaveBeenCalledWith({ available: false });
    await expect(
      walletReaderRoute("/wallet-challenge", { method: "POST" }, ctx),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      walletReaderRoute("/wallet-reader", { method: "POST" }, ctx),
    ).rejects.toMatchObject({ status: 405 });
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe("Wallet reader route protocol", () => {
  const env = {
    APPLE_WALLET_VAS_READER_ENABLED: "true",
    APPLE_WALLET_VAS_PRIVATE_KEY: pair.privateKey.export({
      type: "pkcs8",
      format: "pem",
    }),
  };
  function setup() {
    issuer.value = {
      nfcEnabled: true,
      encryptionPublicKey: pair.publicKey
        .export({ type: "spki", format: "der" })
        .toString("base64"),
      passTypeIdentifier: pass,
    };
    return {
      session,
      config,
      env,
      response: { setHeader: vi.fn() },
      db: {
        rpc: vi.fn(async () => ({ data: { verified: true }, error: null })),
      },
      reply: vi.fn((v) => v),
    };
  }
  it("issues a bound challenge, decrypts and consumes the replay receipt before returning the credential", async () => {
    const ctx = setup();
    const response = await walletReaderRoute(
      "/wallet-challenge",
      {
        method: "POST",
        body: {},
        headers: { "content-type": "application/json" },
      },
      ctx,
    );
    const data = cryptogram(1, Date.now());
    expect(response.passTypeIdentifier).toBe(pass);
    expect(
      await walletReaderRoute(
        "/wallet-read",
        {
          method: "POST",
          body: { challenge: response.challenge, data },
          headers: { "content-type": "application/json" },
        },
        ctx,
      ),
    ).toEqual({ credential });
    expect(ctx.db.rpc).toHaveBeenCalledWith(
      "reward_wallet_read",
      expect.objectContaining({
        p_actor: session.user.id,
        p_session: session.sessionId,
        p_cryptogram_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_challenge_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_credential_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });
  it("rejects bad challenge and database replay/conflict before exposing a credential", async () => {
    const ctx = setup();
    const data = cryptogram(1, Date.now());
    const req = (challenge) => ({
      method: "POST",
      body: { challenge, data },
      headers: { "content-type": "application/json" },
    });
    await expect(
      walletReaderRoute("/wallet-read", req("x".repeat(150)), ctx),
    ).rejects.toMatchObject({ status: 400 });
    expect(ctx.db.rpc).not.toHaveBeenCalled();
    const challenge = createWalletChallenge(session, config, reader);
    ctx.db.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "CONFLICT" },
    });
    await expect(
      walletReaderRoute("/wallet-read", req(challenge), ctx),
    ).rejects.toMatchObject({ status: 409 });
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
