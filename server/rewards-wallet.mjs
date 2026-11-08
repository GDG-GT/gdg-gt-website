import {
  X509Certificate,
  createPrivateKey,
  createPublicKey,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { ApiError } from "./lib/http.mjs";
import { rewardsPagePaths } from "../shared/rewards-pages.mjs";
const unavailable = () =>
  new ApiError(
    503,
    "WALLET_UNAVAILABLE",
    "Apple Wallet is awaiting issuer certificate configuration.",
  );
const pem = (value) =>
  typeof value === "string" ? value.replaceAll("\\n", "\n") : "";
export function walletConfiguration(env = process.env) {
  const nfcEnabled = env.APPLE_WALLET_NFC_ENABLED === "true";
  if (env.APPLE_WALLET_QR_ENABLED !== "true" && !nfcEnabled) return null;
  // An explicitly requested contactless pass must never silently lose NFC.
  if (nfcEnabled && env.APPLE_WALLET_READER_VERIFIED !== "true") return null;
  try {
    if (
      !/^pass\.[a-zA-Z0-9.-]{3,150}$/.test(
        env.APPLE_WALLET_PASS_TYPE_ID || "",
      ) ||
      !/^[A-Z0-9]{10}$/.test(env.APPLE_WALLET_TEAM_ID || "")
    )
      return null;
    const signerCert = new X509Certificate(pem(env.APPLE_WALLET_SIGNER_CERT)),
      wwdr = new X509Certificate(pem(env.APPLE_WALLET_WWDR_CERT));
    const signerKey = createPrivateKey({
      key: pem(env.APPLE_WALLET_SIGNER_KEY),
      passphrase: env.APPLE_WALLET_KEY_PASSPHRASE,
    });
    if (
      !signerCert.checkPrivateKey(signerKey) ||
      !signerCert.checkIssued(wwdr) ||
      !signerCert.verify(wwdr.publicKey) ||
      Date.parse(signerCert.validFrom) > Date.now() ||
      Date.parse(signerCert.validTo) <= Date.now() ||
      Date.parse(wwdr.validFrom) > Date.now() ||
      Date.parse(wwdr.validTo) <= Date.now()
    )
      return null;
    if (
      !signerCert.subject
        .split("\n")
        .some((line) => line === "UID=" + env.APPLE_WALLET_PASS_TYPE_ID) ||
      !signerCert.subject
        .split("\n")
        .some((line) => line === "OU=" + env.APPLE_WALLET_TEAM_ID)
    )
      return null;
    let encryptionPublicKey;
    if (nfcEnabled) {
      const publicKey = createPublicKey({
        key: Buffer.from(env.APPLE_WALLET_NFC_PUBLIC_KEY || "", "base64"),
        type: "spki",
        format: "der",
      });
      if (
        publicKey.asymmetricKeyType !== "ec" ||
        publicKey.asymmetricKeyDetails?.namedCurve !== "prime256v1"
      )
        return null;
      encryptionPublicKey = publicKey
        .export({ type: "spki", format: "der" })
        .toString("base64");
    }
    return {
      passTypeIdentifier: env.APPLE_WALLET_PASS_TYPE_ID,
      teamIdentifier: env.APPLE_WALLET_TEAM_ID,
      wwdr: pem(env.APPLE_WALLET_WWDR_CERT),
      signerCert: pem(env.APPLE_WALLET_SIGNER_CERT),
      signerKey: pem(env.APPLE_WALLET_SIGNER_KEY),
      signerKeyPassphrase: env.APPLE_WALLET_KEY_PASSPHRASE,
      nfcEnabled,
      encryptionPublicKey,
    };
  } catch {
    return null;
  }
}
export async function generateMemberPass({
  credential,
  id,
  name,
  origin,
  env = process.env,
}) {
  const config = walletConfiguration(env);
  if (!config || !/^[A-Za-z0-9_-]{43}$/.test(credential)) throw unavailable();
  const [{ PKPass }, { default: sharp }] = await Promise.all([
    import("passkit-generator"),
    import("sharp"),
  ]);
  const image = await readFile(new URL("../public/logo.png", import.meta.url));
  const buffers = {};
  for (const [filename, size] of [
    ["icon.png", 29],
    ["icon@2x.png", 58],
    ["icon@3x.png", 87],
  ])
    buffers[filename] = await sharp(image)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  const pass = new PKPass(
    buffers,
    {
      wwdr: config.wwdr,
      signerCert: config.signerCert,
      signerKey: config.signerKey,
      signerKeyPassphrase: config.signerKeyPassphrase,
    },
    {
      formatVersion: 1,
      passTypeIdentifier: config.passTypeIdentifier,
      teamIdentifier: config.teamIdentifier,
      serialNumber: id,
      organizationName: "GDG at Georgia Tech",
      description: "GDG at Georgia Tech member card",
      logoText: "GDG@GT",
      backgroundColor: "rgb(250, 239, 229)",
      foregroundColor: "rgb(48, 44, 41)",
      labelColor: "rgb(166, 54, 39)",
      sharingProhibited: true,
    },
  );
  pass.type = "generic";
  if (config.nfcEnabled)
    pass.setNFC({
      message: credential,
      encryptionPublicKey: config.encryptionPublicKey,
      requiresAuthentication: true,
    });
  pass.primaryFields.push({
    key: "member",
    label: "CHAPTER MEMBER",
    value: name,
  });
  pass.secondaryFields.push({
    key: "program",
    label: "COMMUNITY",
    value: "Learn. Build. Give back.",
  });
  pass.backFields.push(
    {
      key: "account",
      label: "Your live balance and perks",
      value: new URL(
        rewardsPagePaths(new URL(origin).hostname)?.member || "/member",
        origin,
      ).href,
    },
    {
      key: "lost",
      label: "Lost or replaced card",
      value:
        "Contact the chapter to revoke this credential. Points remain in your member account.",
    },
  );
  pass.setBarcodes({
    format: "PKBarcodeFormatQR",
    message: credential,
    messageEncoding: "iso-8859-1",
    altText: "GDG chapter membership",
  });
  return pass.getAsBuffer();
}
