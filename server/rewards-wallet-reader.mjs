import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createDecipheriv,
  diffieHellman,
  ECDH,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { walletConfiguration } from "./rewards-wallet.mjs";
import { encryptPayload, decryptPayload } from "./lib/encryption.mjs";
import { token, tokenHash } from "./lib/security.mjs";
import { ApiError, allowMethod, jsonBody } from "./lib/http.mjs";
import { databaseResult } from "./lib/validation.mjs";
const sha = (value) => createHash("sha256").update(value).digest();
const invalid = () =>
  new ApiError(
    400,
    "INVALID_WALLET_SCAN",
    "This Wallet scan could not be verified. Scan the pass again.",
  );
const unavailable = () =>
  new ApiError(
    503,
    "WALLET_READER_UNAVAILABLE",
    "Wallet NFC is awaiting Apple approval and reader configuration.",
  );
const lifetime = 75000;
const epoch = Date.UTC(2001, 0, 1);
export function walletReaderConfiguration(env = process.env) {
  if (env.APPLE_WALLET_VAS_READER_ENABLED !== "true") return null;
  const issuer = walletConfiguration(env);
  if (!issuer?.nfcEnabled) return null;
  try {
    const privateKey = createPrivateKey({
      key: (env.APPLE_WALLET_VAS_PRIVATE_KEY || "").replaceAll("\\n", "\n"),
      passphrase: env.APPLE_WALLET_VAS_KEY_PASSPHRASE,
    });
    if (
      privateKey.asymmetricKeyType !== "ec" ||
      privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1"
    )
      return null;
    const publicKey = createPublicKey(privateKey);
    const publicDer = publicKey.export({ format: "der", type: "spki" });
    const issuerDer = Buffer.from(issuer.encryptionPublicKey, "base64");
    if (
      publicDer.length !== issuerDer.length ||
      !timingSafeEqual(publicDer, issuerDer)
    )
      return null;
    const jwk = publicKey.export({ format: "jwk" });
    return {
      privateKey,
      keyId: sha(Buffer.from(jwk.x, "base64url")).subarray(0, 4),
      passTypeIdentifier: issuer.passTypeIdentifier,
    };
  } catch {
    return null;
  }
}
/** Apple VAS protocol: P-256 ECDH, X9.63 SHA-256, authenticated AES-256-GCM.
 * Protocol references and hardware acceptance requirements are in the scanner guide.
 * Decryption stays server-side. Both known KDF/AAD variants require a valid GCM tag.
 */
export function decryptWalletData(data, config, now = Date.now()) {
  try {
    if (typeof data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(data))
      throw invalid();
    const bytes = Buffer.from(data, "base64");
    // This issuer uses exactly 4 timestamp + 43 ASCII credential bytes.
    if (
      bytes.length !== 99 ||
      bytes.toString("base64") !== data ||
      !timingSafeEqual(bytes.subarray(0, 4), config.keyId)
    )
      throw invalid();
    const point = ECDH.convertKey(
      Buffer.concat([Buffer.from([2]), bytes.subarray(4, 36)]),
      "prime256v1",
      undefined,
      undefined,
      "uncompressed",
    );
    const spki = Buffer.concat([
      Buffer.from(
        "3059301306072a8648ce3d020106082a8648ce3d030107034200",
        "hex",
      ),
      point,
    ]);
    const shared = diffieHellman({
      privateKey: config.privateKey,
      publicKey: createPublicKey({ key: spki, type: "spki", format: "der" }),
    });
    const merchant = sha(config.passTypeIdentifier),
      context = Buffer.from("ApplePay encrypted VAS data", "ascii");
    const variants = [
      {
        info: Buffer.concat([
          Buffer.from([13]),
          Buffer.from("id-aes256-GCM", "ascii"),
          context,
          merchant,
        ]),
        aad: Buffer.alloc(0),
      },
      { info: context, aad: merchant },
    ];
    let plain;
    for (const variant of variants) {
      try {
        const key = sha(
          Buffer.concat([shared, Buffer.from([0, 0, 0, 1]), variant.info]),
        );
        const cipher = createDecipheriv("aes-256-gcm", key, Buffer.alloc(16));
        cipher.setAAD(variant.aad);
        cipher.setAuthTag(bytes.subarray(-16));
        plain = Buffer.concat([
          cipher.update(bytes.subarray(36, -16)),
          cipher.final(),
        ]);
        key.fill(0);
        break;
      } catch {
        /* An authenticated result is required; never fall back to plaintext. */
      }
    }
    shared.fill(0);
    if (!plain || plain.length !== 47) throw invalid();
    const at = epoch + plain.readUInt32BE(0) * 1000;
    const credential = plain.subarray(4).toString("ascii");
    // Reject high-bit bytes too; Node's ASCII decoder masks those bits.
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(credential) ||
      !Buffer.from(credential, "ascii").equals(plain.subarray(4)) ||
      at > now + 5000 ||
      now - at > lifetime
    )
      throw invalid();
    return { credential, cryptogramHash: tokenHash(data) };
  } catch {
    throw invalid();
  }
}
export function createWalletChallenge(
  session,
  config,
  reader,
  now = Date.now(),
) {
  return encryptPayload(
    {
      purpose: "gdg-wallet-read-v1",
      actor: session.user.id,
      session: session.sessionId,
      pass: reader.passTypeIdentifier,
      nonce: token(),
      issued: now,
      expires: now + lifetime,
    },
    config.encryptionSecret,
  );
}
export function verifyWalletChallenge(
  value,
  session,
  config,
  reader,
  now = Date.now(),
) {
  try {
    const c = decryptPayload(value, config.encryptionSecret);
    if (
      c.purpose !== "gdg-wallet-read-v1" ||
      c.actor !== session.user.id ||
      c.session !== session.sessionId ||
      c.pass !== reader.passTypeIdentifier ||
      !/^[A-Za-z0-9_-]{43}$/.test(c.nonce) ||
      !Number.isSafeInteger(c.issued) ||
      !Number.isSafeInteger(c.expires) ||
      c.expires !== c.issued + lifetime ||
      c.issued > now ||
      c.expires <= now
    )
      throw invalid();
    return c;
  } catch {
    throw invalid();
  }
}
export async function walletReaderRoute(
  route,
  request,
  { session, config, db, env, reply, response },
) {
  if (!["/wallet-reader", "/wallet-challenge", "/wallet-read"].includes(route))
    return false;
  const reader = walletReaderConfiguration(env);
  if (route === "/wallet-reader") {
    allowMethod(request, response, ["GET"]);
    return reply({ available: !!reader });
  }
  if (!reader) throw unavailable();
  allowMethod(request, response, ["POST"]);
  if (route === "/wallet-challenge") {
    await jsonBody(request, z.object({}).strict(), 64);
    return reply({
      challenge: createWalletChallenge(session, config, reader),
      passTypeIdentifier: reader.passTypeIdentifier,
    });
  }
  const body = await jsonBody(
    request,
    z
      .object({
        challenge: z.string().min(100).max(2048),
        data: z.string().min(100).max(256),
      })
      .strict(),
    4096,
  );
  verifyWalletChallenge(body.challenge, session, config, reader);
  const scan = decryptWalletData(body.data, reader);
  databaseResult(
    await db.rpc("reward_wallet_read", {
      p_actor: session.user.id,
      p_session: session.sessionId,
      p_cryptogram_hash: scan.cryptogramHash,
      p_challenge_hash: tokenHash(body.challenge),
      p_credential_hash: tokenHash(scan.credential),
    }),
  );
  return reply({ credential: scan.credential });
}
