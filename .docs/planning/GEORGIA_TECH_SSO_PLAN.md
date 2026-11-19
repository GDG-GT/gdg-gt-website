# Georgia Tech SSO configuration and remaining scope

GT IAM is preparing the test registration under **SCTASK0363981**. Jian Wang supplied the `sso-upgrade` discovery URL; the client ID, client secret and registration-ready confirmation have not arrived. Google sign-in is excluded.

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

1. Obtain Jian's real client ID and secret and confirmation that the above callback is registered. Do not use dummy credentials or store the secret in Git, browser code or public deployment variables.
2. In the correct Supabase project, create the disabled custom OIDC provider with the settings above and the issued credentials. Preserve existing Auth URL settings and add only the exact application callback to its redirect allowlist. Keep `GT_MEMBER_SSO_ENABLED=false` while preparing it.
3. For a controlled sign-in test, enable the provider and set `GT_MEMBER_SSO_ENABLED=true` with `GT_MEMBER_SSO_PROVIDER=custom:gatech` in the test deployment. Test real GT sign-in, verified email and immutable subject claims, active/nonmember rejection, expired/reused attempts, sign-out and browser/PWA contexts. Revert the flag if testing fails. The mocked route tests and metadata preflight do not establish institutional sign-in acceptance.
4. This test issuer is not a production IAM registration. Obtain and validate the production configuration and repeat real sign-in acceptance before enabling campus-wide access.

No hosted provider or Auth URL settings were changed on 2026-11-18. The locally saved Supabase management token is expired, and the current GitHub-linked dashboard account cannot access the GDG project. Access through its owning account is required. This is separate from the pending IAM credentials.

Reference: [Supabase custom OAuth/OIDC providers](https://supabase.com/docs/guides/auth/custom-oauth-providers). No reply to the IAM ticket was sent.

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

Institutional credentials/approval and production testing are still pending.
