import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash, createPrivateKey, generateKeyPairSync } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import {
  walletConfiguration,
  generateMemberPass,
} from "../../server/rewards-wallet.mjs";
let folder, env;
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "gdg-wallet-fixture-"));
  const r = spawnSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(folder, "key.pem"),
      "-out",
      join(folder, "cert.pem"),
      "-days",
      "1",
      "-subj",
      "/UID=pass.dev.gdggt.fixture/OU=ABCD123456/CN=Fictional Test Issuer",
    ],
    { encoding: "utf8" },
  );
  if (r.status) throw Error("Could not generate isolated signing fixture.");
  const cert = await readFile(join(folder, "cert.pem"), "utf8"),
    key = await readFile(join(folder, "key.pem"), "utf8");
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  env = {
    APPLE_WALLET_NFC_ENABLED: "true",
    APPLE_WALLET_READER_VERIFIED: "true",
    APPLE_WALLET_PASS_TYPE_ID: "pass.dev.gdggt.fixture",
    APPLE_WALLET_TEAM_ID: "ABCD123456",
    APPLE_WALLET_SIGNER_CERT: cert,
    APPLE_WALLET_SIGNER_KEY: key,
    APPLE_WALLET_WWDR_CERT: cert,
    APPLE_WALLET_NFC_PUBLIC_KEY: publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64"),
  };
});
afterAll(async () => {
  if (folder) await rm(folder, { recursive: true, force: true });
});
describe("Wallet server packaging boundary (fictional certificates, not Apple acceptance)", () => {
  it("stays unavailable until issuer and reader settings are explicitly present", () => {
    expect(walletConfiguration({})).toBeNull();
    expect(
      walletConfiguration({ ...env, APPLE_WALLET_READER_VERIFIED: "false" }),
    ).toBeNull();
    expect(
      walletConfiguration({ ...env, APPLE_WALLET_NFC_ENABLED: "false" }),
    ).toBeNull();
  });
  it("rejects mismatched issuer and malformed VAS key settings", () => {
    expect(
      walletConfiguration({
        ...env,
        APPLE_WALLET_PASS_TYPE_ID: "pass.different.issuer",
      }),
    ).toBeNull();
    expect(
      walletConfiguration({ ...env, APPLE_WALLET_NFC_PUBLIC_KEY: "invalid" }),
    ).toBeNull();
  });
  it("enables QR-only passes without NFC entitlement or reader settings", () => {
    const qr = {
      ...env,
      APPLE_WALLET_QR_ENABLED: "true",
      APPLE_WALLET_NFC_ENABLED: "false",
      APPLE_WALLET_READER_VERIFIED: "false",
      APPLE_WALLET_NFC_PUBLIC_KEY: "",
    };
    expect(walletConfiguration(qr)).toMatchObject({ nfcEnabled: false });
    expect(walletConfiguration(qr).encryptionPublicKey).toBeUndefined();
    expect(
      walletConfiguration({ ...qr, APPLE_WALLET_NFC_ENABLED: "true" }),
    ).toBeNull();
    expect(
      walletConfiguration({
        ...qr,
        APPLE_WALLET_PASS_TYPE_ID: "pass.wrong.issuer",
      }),
    ).toBeNull();
    expect(
      walletConfiguration({ ...qr, APPLE_WALLET_TEAM_ID: "XXXXXXXXXX" }),
    ).toBeNull();
    expect(
      walletConfiguration({ ...qr, APPLE_WALLET_SIGNER_KEY: "invalid" }),
    ).toBeNull();
  });
  it("packages and cryptographically verifies a QR-only pass with an encrypted signing key", async () => {
    const passphrase = "fictional-test-key-password";
    const encryptedKey = createPrivateKey(env.APPLE_WALLET_SIGNER_KEY)
      .export({
        format: "pem",
        type: "pkcs8",
        cipher: "aes-256-cbc",
        passphrase,
      })
      .toString();
    const qr = {
      ...env,
      APPLE_WALLET_QR_ENABLED: "true",
      APPLE_WALLET_NFC_ENABLED: "false",
      APPLE_WALLET_SIGNER_KEY: encryptedKey,
      APPLE_WALLET_KEY_PASSPHRASE: passphrase,
      APPLE_WALLET_NFC_PUBLIC_KEY: "",
    };
    expect(
      walletConfiguration({ ...qr, APPLE_WALLET_KEY_PASSPHRASE: "wrong" }),
    ).toBeNull();
    const bytes = await generateMemberPass({
      credential: "Q".repeat(43),
      id: "fictional-qr-pass",
      name: "Fictional QR Member",
      origin: "https://leaderboards.gdggt.dev",
      env: qr,
    });
    const archive = unzipSync(bytes);
    const pass = JSON.parse(strFromU8(archive["pass.json"]));
    expect(pass).not.toHaveProperty("nfc");
    expect(pass.barcodes[0]).toMatchObject({
      format: "PKBarcodeFormatQR",
      message: "Q".repeat(43),
    });
    expect(pass.generic.primaryFields[0].value).toBe("Fictional QR Member");
    const manifest = JSON.parse(strFromU8(archive["manifest.json"]));
    for (const [file, hash] of Object.entries(manifest))
      expect(createHash("sha1").update(archive[file]).digest("hex")).toBe(hash);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(folder, "signature.der"), archive.signature);
    await writeFile(join(folder, "manifest.json"), archive["manifest.json"]);
    const verified = spawnSync("openssl", [
      "smime",
      "-verify",
      "-inform",
      "DER",
      "-in",
      join(folder, "signature.der"),
      "-content",
      join(folder, "manifest.json"),
      "-noverify",
    ]);
    expect(verified.status).toBe(0);
    expect(verified.stdout.equals(Buffer.from(archive["manifest.json"]))).toBe(
      true,
    );
  });
  it("packages signed NFC and QR payloads that resolve to the same opaque credential", async () => {
    const credential = "F".repeat(43),
      bytes = await generateMemberPass({
        credential,
        id: "fictional-credential",
        name: "Fictional Member",
        origin: "https://leaderboards.gdggt.dev",
        env,
      });
    const archive = unzipSync(bytes),
      pass = JSON.parse(strFromU8(archive["pass.json"]));
    expect(pass.nfc.message).toBe(credential);
    expect(pass.nfc.requiresAuthentication).toBe(true);
    expect(pass.sharingProhibited).toBe(true);
    expect(pass.barcodes[0].message).toBe(credential);
    expect(pass.generic.primaryFields[0].value).toBe("Fictional Member");
    expect(
      pass.generic.backFields.find((field) => field.key === "account").value,
    ).toBe("https://leaderboards.gdggt.dev/member");
    expect(pass).not.toHaveProperty("balance");
    expect(archive.signature.byteLength).toBeGreaterThan(100);
    expect(archive["icon@3x.png"].byteLength).toBeGreaterThan(100);
    expect(archive["manifest.json"]).toBeDefined();
  });
});
