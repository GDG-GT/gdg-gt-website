import { describe, it, expect } from "vitest";
import { gtOidcTest, validateGtDiscovery, validateGtSigningKeys } from "../../scripts/lib/gt-oidc.mjs";
const discovery = () => ({
  issuer: gtOidcTest.issuer,
  authorization_endpoint: gtOidcTest.issuer + "/oidcAuthorize",
  token_endpoint: gtOidcTest.issuer + "/oidcAccessToken",
  userinfo_endpoint: gtOidcTest.issuer + "/oidcProfile",
  jwks_uri: gtOidcTest.issuer + "/jwks",
  scopes_supported: ["openid", "profile", "email"],
  response_types_supported: ["code"], grant_types_supported: ["authorization_code"],
  code_challenge_methods_supported: ["S256"],
  id_token_signing_alg_values_supported: ["RS256"],
  token_endpoint_auth_methods_supported: ["client_secret_basic"],
  claims_supported: ["sub", "email", "email_verified"],
});
describe("GT test metadata preflight", () => {
  it("accepts the pinned test issuer and required protocol support", () => {
    expect(validateGtDiscovery(discovery())).toBe(true);
  });
  it.each([
    { issuer: "https://other.test" }, { jwks_uri: "https://other.test/jwks" },
    { token_endpoint: "http://sso-upgrade.a.iam.gatech.edu/token" },
    { code_challenge_methods_supported: ["plain"] },
    { id_token_signing_alg_values_supported: ["none"] },
    { claims_supported: ["sub", "email"] }, { scopes_supported: ["openid"] },
    { response_types_supported: ["token"] },
  ])("rejects changed or insufficient metadata %j", (override) => {
    expect(() => validateGtDiscovery({ ...discovery(), ...override })).toThrow();
  });
  it("rejects empty and private signing-key documents", () => {
    expect(() => validateGtSigningKeys({ keys: [] })).toThrow();
    expect(() => validateGtSigningKeys({ keys: [{ kty: "RSA", use: "sig", kid: "test", n: "test", e: "AQAB", d: "private" }] })).toThrow();
  });
  it("keeps the provider disabled with nonce, PKCE and email verification required", () => {
    expect(gtOidcTest).toMatchObject({ enabled: false, pkce_enabled: true, skip_nonce_check: false, email_optional: false });
    expect(gtOidcTest).not.toHaveProperty("client_secret");
  });
});
