# Georgia Tech SSO configuration and remaining scope

The owner confirmed submitting the institutional SSO request. Approval, issued provider configuration and real campus sign-in verification remain pending. Google sign-in is excluded.

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
