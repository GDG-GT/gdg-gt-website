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
    activation: "Metadata preflight only. Confirm hosted provider configuration and real sign-in acceptance before enabling member login; this test issuer is separate from production IAM.",
  }, null, 2));
} catch (error) {
  console.error("GT SSO preflight failed:", error.message);
  process.exitCode = 1;
}
