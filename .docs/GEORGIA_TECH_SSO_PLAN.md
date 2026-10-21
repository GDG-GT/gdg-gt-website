# Planned Georgia Tech SSO

Deferred by Tejas on 2026-10-21. Do not implement or enable this integration as
part of the current remaining-PRD pass. The disabled placeholders below do not
authenticate anyone and are not a launch dependency for original v1.5 scope.

User-requested addition on 2026-10-20. This is a planned integration, not a claim
that Georgia Tech has approved an application or that SSO authentication works.

## Current behavior

- The gate opens the existing login using Enter or Subscribe, including for an
  email-shaped gate code. The gate is recognized server-side, never in public JS.
- Login displays a disabled “Sign in with Georgia Tech SSO · Coming soon” option.
  Chapter email/password login remains operational.
- Restricted public Forms display a disabled verification option. The builder
  lists the planned access mode as disabled. Existing email verification, access
  links and chapter-member modes are unchanged.
- There are no SSO start/callback routes, provider redirects, trusted SSO claims,
  automatic account links, or usable SSO form access modes. Forged SSO settings
  are rejected by the existing strict definition schema.

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
