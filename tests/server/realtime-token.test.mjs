import { describe, it, expect } from "vitest";
import { createHmac, generateKeyPairSync, verify } from "node:crypto";
import {
  realtimeConfiguration,
  signRealtimeGrant,
} from "../../server/lib/realtime-token.mjs";
const env = {
  NODE_ENV: "development",
  SUPABASE_URL: "http://127.0.0.1:54361",
  APP_ORIGIN: "http://127.0.0.1:8080",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_fixture_only",
  ALLOW_LOCAL_REALTIME_HS256: "true",
  REALTIME_LOCAL_JWT_SECRET: "fictional-local-signing-secret-".repeat(2),
};
const grant = {
  id: "da000000-0000-4000-8000-000000000001",
  issuedAt: 1800000000,
  expiresAt: 1800000300,
  permissionVersion: 3,
  topic: "gdg:channel:da000000-0000-4000-8000-000000000001",
};
describe("scoped Realtime token boundary", () => {
  it("never accepts local symmetric signing in production or on a remote project", () => {
    for (const change of [
      { NODE_ENV: "production" },
      { SUPABASE_URL: "https://project.supabase.co" },
      { APP_ORIGIN: "https://chapter.example.org" },
    ])
      expect(() => realtimeConfiguration({ ...env, ...change })).toThrow();
  });
  it("rejects a server-role key as browser transport material", () => {
    const key =
      "header." +
      Buffer.from(JSON.stringify({ role: "service_role" })).toString(
        "base64url",
      ) +
      ".signature";
    expect(() =>
      realtimeConfiguration({ ...env, SUPABASE_PUBLISHABLE_KEY: key }),
    ).toThrow();
  });
  it("emits only scoped socket claims, with no chapter role or account password", () => {
    const c = realtimeConfiguration(env),
      token = signRealtimeGrant(
        c,
        grant,
        "user-fixture",
        "session-fixture",
        "https://chapter.example.org/api/v1/realtime",
      ),
      [h, p, s] = token.split(".");
    const claims = JSON.parse(Buffer.from(p, "base64url"));
    expect(claims.role).toBe("gdg_realtime");
    expect(claims.exp - claims.iat).toBe(300);
    expect(claims.session_id).toBe("session-fixture");
    expect(claims.permission_version).toBe(3);
    expect(claims.topics).toEqual([grant.topic]);
    expect(
      createHmac("sha256", env.REALTIME_LOCAL_JWT_SECRET)
        .update(h + "." + p)
        .digest("base64url"),
    ).toBe(s);
    expect(claims).not.toHaveProperty("email");
  });
  it("refuses overlong or reversed token lifetimes", () => {
    for (const expiresAt of [grant.issuedAt, grant.issuedAt + 301])
      expect(() =>
        signRealtimeGrant(
          realtimeConfiguration(env),
          { ...grant, expiresAt },
          "user",
          "session",
          "issuer",
        ),
      ).toThrow();
  });
  it("supports imported P-256 signing material with an explicit key id", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
        namedCurve: "prime256v1",
      }),
      c = realtimeConfiguration({
        ...env,
        NODE_ENV: "production",
        SUPABASE_URL: "https://project.supabase.co",
        REALTIME_JWT_PRIVATE_JWK: JSON.stringify(
          privateKey.export({ format: "jwk" }),
        ),
        REALTIME_JWT_KEY_ID: "fixture-imported-key",
      });
    const token = signRealtimeGrant(c, grant, "user", "session", "issuer"),
      [h, p, s] = token.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url")).alg).toBe("ES256");
    expect(
      verify(
        "sha256",
        Buffer.from(h + "." + p),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(s, "base64url"),
      ),
    ).toBe(true);
  });
});
