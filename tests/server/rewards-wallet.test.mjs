import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
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
    expect(pass).not.toHaveProperty("balance");
    expect(archive.signature.byteLength).toBeGreaterThan(100);
    expect(archive["icon@3x.png"].byteLength).toBeGreaterThan(100);
    expect(archive["manifest.json"]).toBeDefined();
  });
});
