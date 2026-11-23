# Georgia Tech SSO configuration and remaining scope

GT IAM is preparing the test registration under **SCTASK0363981**. Jian Wang supplied the `sso-upgrade` discovery URL; the client ID and secret arrived on 2026-11-21. Jian confirmed the test service ready on 2026-11-23, and real GT login plus the Supabase code exchange/user verification succeeded that day. Google sign-in is excluded.

## Test-instance preparation — 2026-11-18

The live discovery document and public signing keys were checked successfully. The exact public provider settings are in [scripts/lib/gt-oidc.mjs](../../scripts/lib/gt-oidc.mjs). Run `node scripts/check-gt-sso.mjs` from the repository root to recheck the pinned issuer, endpoints, code flow, S256 support, scopes, claims and public signing keys. This command is read-only and does not enable authentication.

| Setting | Value |
| --- | --- |
| Supabase custom provider identifier | `custom:gatech` |
| Type | OIDC |
| Issuer | `https://sso-upgrade.a.iam.gatech.edu/cas/oidc` |
| Discovery URL override | `https://sso-upgrade.a.iam.gatech.edu/cas/oidc/.well-known` |
| GT-registered callback | `https://gyzrciokgqwxjrlqrklz.supabase.co/auth/v1/callback` |
| Supabase redirect allowlist entry | `https://leaderboards.gdggt.dev/api/v1/rewards/callback` |
| Scopes | `openid profile email` |
| PKCE / nonce checks | Enabled / required |
| Email optional | No |
| Initial provider state | Disabled |

The discovery override matters: GT uses `.well-known`, rather than the conventional `.well-known/openid-configuration` suffix. Choose **Custom OAuth/OIDC provider** in Supabase Auth, not a Third-Party Auth JWT integration. The latter is a different feature. Do not add GTCustomScope, arbitrary attributes or extra acceptable client IDs for this flow.

Supabase performs the OIDC signature, issuer, audience, expiry and nonce verification. The application exchanges the browser-bound PKCE code on the server and fetches the authenticated Supabase user. It then requires a recent, verified `custom:gatech` identity and an active directory member before creating its separate member session. The explicit scopes are also included when initiating login.

### Hosted activation still required

1. Issued client credentials are now saved in Supabase Auth. Jian confirmed test IDP readiness on 2026-11-23, and authorization succeeded. Never store the secret in Git, browser code or public deployment variables.
2. In the correct Supabase project, create the disabled custom OIDC provider with the settings above and the issued credentials. Preserve existing Auth URL settings and add only the exact application callback to its redirect allowlist. Keep `GT_MEMBER_SSO_ENABLED=false` while preparing it.
3. For a controlled sign-in test, enable the provider and set `GT_MEMBER_SSO_ENABLED=true` with `GT_MEMBER_SSO_PROVIDER=custom:gatech` in the test deployment. Test real GT sign-in, verified email and immutable subject claims, active/nonmember rejection, expired/reused attempts, sign-out and browser/PWA contexts. Revert the flag if testing fails. The mocked route tests and metadata preflight do not establish institutional sign-in acceptance.
4. This test issuer is not a production IAM registration. Obtain and validate the production configuration and repeat real sign-in acceptance before enabling campus-wide access.

After the owner signed in as `gdg@gatech.edu` on 2026-11-18, the exact leaderboard application callback above was added to Supabase's Auth redirect allowlist and verified after navigation. Supabase's provider creation screen also confirmed the provider callback sent to Jian. No custom provider was created and no sign-in flag enabled; IAM credentials remain pending. The existing Site URL and other Auth settings were preserved. Website preparation commit `941e87d` is deployed.

Reference: [Supabase custom OAuth/OIDC providers](https://supabase.com/docs/guides/auth/custom-oauth-providers). No reply to the IAM ticket was sent.

## Issued credentials configured — 2026-11-21

Created `custom:gatech` in the chapter Supabase project using the credentials Jian supplied, then disabled the provider pending IAM readiness. Reopened the saved provider after reloading and verified its OIDC type, exact test issuer/discovery override, `openid profile email` scopes and required email. The creation UI initially enables new providers; the provider was immediately disabled, and the website flag stayed off throughout. The live leaderboard API still reports `ssoAvailable: false`. No campus authentication was attempted, and no website push or iOS build was triggered. No client secret or client ID is retained in repository documentation. Include these operational notes with the next real change rather than deploying only documentation.

## Controlled authorization attempt — 2026-11-21

At the owner's request, briefly enabled the saved test provider and initiated one authorization-code flow through Supabase with S256 PKCE and the existing callback. GT's authorization endpoint returned **Application Login Failure: The application you attempted to authenticate to is not authorized to use CAS.** This occurred before the user login form. Verified that the outgoing client ID matched Jian's issued ID, `redirect_uri` was the Supabase callback above, and scopes were `openid profile email`. This does not test the client secret/token exchange or establish the exact missing IDP-side setting. Restored the provider to disabled; the website flag remained off. Wait for IAM to authorize this client/callback on `sso-upgrade`, then repeat the real sign-in test. No deployment or iOS build.

## Real GT login accepted — 2026-11-23

Jian confirmed `sso-upgrade` ready. Enabled the saved provider for a controlled PKCE authorization attempt. The owner completed GT login and returned to the configured leaderboard callback with a code. The server-side Supabase PKCE exchange and authenticated `/auth/v1/user` request both returned200. The campus provider returned a confirmed GT email, `email_verified:true`, immutable subject and current sign-in timestamp. The live member record already uses that verified campus email, so no member change, duplicate or alias mapping is needed. The owner explicitly confirmed that the username address and named email alias belong to the same GT account; do not ask them to reconfirm this. Exact identifiers are in the private operational acceptance record, not this public repository.

Corrected the application identity check to read Supabase's provider subject from identity `id`, not its database column name `provider_id` or the separate identity row UUID `identity_id`. Mocked callback and negative subject tests cover the actual wire format. Full 280-file /3,191-test suite passes, alongside typecheck, changed-file lint, production build and secret scan. No authorization or verified-email checks were weakened.

This was provider/token acceptance, not a full deployed website member-session test: public `GT_MEMBER_SSO_ENABLED` stayed off throughout. Restored the hosted provider to disabled, revoked the temporary Supabase test session and deleted temporary verifier/tokens. No member data or permissions changed. Obtain the production IAM configuration and complete real website/PWA session testing before campus-wide activation.

## Full website-session investigation — 2026-11-23

The owner requested the deployed member-session test. Temporarily enabled the test provider and the website flag on the existing production host. The first full return failed the application's freshness check: a direct authenticated Supabase user response showed fresh server `user.last_sign_in_at` and provider-verified `identity_data.iat`, but the identity row's `last_sign_in_at` remained at its original creation sign-in. The separate diagnostic session was revoked (204) and its verifier/tokens deleted.

The callback now requires both the server-owned account sign-in and selected provider's verified token issuance to be current for the PKCE flow, within ten seconds of allowed clock skew. Missing, stale, malformed and future timestamps are rejected; mutable user metadata is not trusted. The unchanged exact-provider, confirmed-email, immutable-subject and active-member checks still apply. Returning-identity and negative timestamp tests cover the real wire behavior. The sign-in button also avoids registering its intentional redirect as an unsaved member write; authenticated writes retain navigation protection.

These fixes require deployed browser verification before claiming a complete website session. Restore the website flag and test provider to disabled after acceptance. Production IAM registration remains separate; no native app source changed.

## Current implementation

- Member rewards implement the Supabase custom OIDC provider flow behind `GT_MEMBER_SSO_ENABLED`, with campus identity validation, PKCE/browser binding, active community membership matching and separate opaque member sessions. The provider remains disabled until configured and tested.
- Member account: `https://leaderboards.gdggt.dev/member`. The application return callback is `https://leaderboards.gdggt.dev/api/v1/rewards/callback`; the GT provider registration itself uses the Supabase provider callback. These are separate hops. See [member rewards operations](../operations/MEMBER_REWARDS_OPERATIONS.md).
- Admin email/password access remains operational. Admin SSO and respondent Forms SSO are separate planned workflows with disabled placeholders; the member flow does not activate them.
- The separate-event linking API verifies an event site's existing authenticated account and a code from the member's chapter session. It does not create another sign-in provider. See [event integration](../operations/EVENT_MEMBERSHIP_INTEGRATION.md).

The earlier pre-member-rewards statement that no SSO routes existed is superseded. The following activation requirements apply to the relevant workflow; they are not a claim that institutional acceptance is complete.

## Required before activation

1. Obtain approved institutional integration details: supported protocol,
   issuer/metadata, client registration, allowed callbacks, released attributes,
   environments, permitted audiences and any required review. Do not assume a
   generic Microsoft/Google login is equivalent to approved Georgia Tech SSO.
2. Implement the selected protocol through a reviewed server-side integration.
   Validate its signatures, issuer, audience, expiry and request binding; protect
   initiation/callback correlation and replay. Keep all credentials server-only.
3. Admin SSO remains behind the chapter gate. Verify an active gate at initiation
   and callback. Bind the verified institutional identity to an explicitly allowed
   chapter account; institutional affiliation or an email domain alone must never
   create an admin role, revive an archived account, or change permissions.
4. Issue the normal opaque HttpOnly application session after authorized login.
   Preserve CSRF, session rotation/revocation, current account/role checks, safe
   return paths, rate limits and redacted auditing. Keep the existing password
   path available while rollout and recovery behavior are verified.
5. Form verification is a separate respondent workflow, not an admin session.
   Bind verification to the intended form/version and approved institutional
   identity. Define eligibility and one-response rules explicitly; do not grant
   chapter/admin access. Only a validated server-issued proof may unlock a form.
6. Add consent/privacy copy, minimal attribute retention, identity-link/recovery
   procedures and negative tests for replay, wrong issuer/audience, denied campus
   identities, disabled chapter accounts, account-link collisions and forged form
   verification. Verify the production-like integration before enabling the UI.

Test-instance GT authentication and token/identity verification passed on 2026-11-23. Full website-session acceptance and production IAM registration remain pending.
