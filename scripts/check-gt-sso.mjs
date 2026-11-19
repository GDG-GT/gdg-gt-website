import {
  gtOidcTest, gtProviderCallback, gtApplicationCallbacks,
  validateGtDiscovery, validateGtSigningKeys,
} from "./lib/gt-oidc.mjs";

// Read-only preflight. Does not create a provider, enable login or print secrets.
async function publicJson(url) {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`GT metadata returned HTTP ${response.status}`);
  return response.json();
}
try {
  const discovery = await publicJson(gtOidcTest.discovery_url);
  validateGtDiscovery(discovery);
  validateGtSigningKeys(await publicJson(discovery.jwks_uri));
  console.log(JSON.stringify({
    metadata: "verified",
    environment: "GT sso-upgrade test instance",
    provider: gtOidcTest,
    registerAtGt: gtProviderCallback,
    supabaseRedirectAllowlist: gtApplicationCallbacks,
    activation: "Waiting for IAM registration, client ID and client secret; real sign-in testing required before enabling member login.",
  }, null, 2));
} catch (error) {
  console.error("GT SSO preflight failed:", error.message);
  process.exitCode = 1;
}
