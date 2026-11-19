// Public configuration supplied by GT IAM for SCTASK0363981.
// Test instance only. Never store client credentials in this module.
export const gtOidcTest = Object.freeze({
  identifier: "custom:gatech",
  provider_type: "oidc",
  name: "Georgia Tech",
  issuer: "https://sso-upgrade.a.iam.gatech.edu/cas/oidc",
  discovery_url: "https://sso-upgrade.a.iam.gatech.edu/cas/oidc/.well-known",
  scopes: Object.freeze(["openid", "profile", "email"]),
  pkce_enabled: true,
  skip_nonce_check: false,
  email_optional: false,
  enabled: false,
});
export const gtProviderCallback =
  "https://gyzrciokgqwxjrlqrklz.supabase.co/auth/v1/callback";
export const gtApplicationCallbacks = Object.freeze([
  "https://leaderboards.gdggt.dev/api/v1/rewards/callback",
]);

export function validateGtDiscovery(document) {
  const requireValue = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  requireValue(document?.issuer === gtOidcTest.issuer, "GT issuer mismatch");
  for (const [key, suffix] of Object.entries({
    authorization_endpoint: "/oidcAuthorize",
    token_endpoint: "/oidcAccessToken",
    userinfo_endpoint: "/oidcProfile",
    jwks_uri: "/jwks",
  })) {
    requireValue(document[key] === gtOidcTest.issuer + suffix, `Unexpected GT ${key}`);
  }
  for (const scope of gtOidcTest.scopes) {
    requireValue(document.scopes_supported?.includes(scope), `Missing GT scope: ${scope}`);
  }
  requireValue(document.response_types_supported?.includes("code"), "GT code flow unavailable");
  requireValue(document.grant_types_supported?.includes("authorization_code"), "GT authorization code grant unavailable");
  requireValue(document.code_challenge_methods_supported?.includes("S256"), "GT S256 PKCE unavailable");
  requireValue(document.id_token_signing_alg_values_supported?.includes("RS256"), "GT RS256 signatures unavailable");
  requireValue(document.token_endpoint_auth_methods_supported?.includes("client_secret_basic"), "GT client secret authentication unavailable");
  for (const claim of ["sub", "email", "email_verified"]) {
    requireValue(document.claims_supported?.includes(claim), `Missing GT claim: ${claim}`);
  }
  return true;
}

export function validateGtSigningKeys(document) {
  if (!document?.keys?.some((key) =>
    key.kty === "RSA" && key.use === "sig" && key.kid && key.n && key.e &&
    (!key.alg || key.alg === "RS256") && !key.d && !key.p && !key.q
  )) throw new Error("GT public RSA signing key unavailable");
  return true;
}
