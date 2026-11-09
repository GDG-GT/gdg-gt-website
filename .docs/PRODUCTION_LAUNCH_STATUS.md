# Production status

Latest scanner feature source: `1896f2e61cb6f94d92931a497e1f80e27b380457`, November 8, 2026. Vercel `dpl_Ga5btGqVS2587u48Tshm2vwFGuVM` is READY. The rewards workspace asset matches the tested local build; authenticated Wallet reader availability is false as intended, public routes return 200 and private unauthenticated routes return 401. The earlier event release remains recorded below. See [scanner verification](phase0/iphone-scanner-verification.json) and [current checkpoint](CURRENT_CHECKPOINT.md) for native distribution and pending acceptance.

Owned iPhone app **GDG GT Scanner 1.0.0 (1)** is signed, processed by Apple and assigned to the private **GDG Officers** TestFlight group. The existing owner Apple account is invited. Physical NDEF reading/writing and QR reuse the chapter workspace; Wallet VAS code is gated pending Apple approval and device tests. No public App Store release, external tester invitation, new paid scanner service or production fixture member/point was created.

## Live services and routes

- Canonical chapter website: https://gdggt.dev.
- Dedicated leaderboard: https://leaderboards.gdggt.dev/; member account: `/member` on that subdomain.
- The main domain returns 404 for `/leaderboard`, `/leaderboard/member` and `/member`. Old leaderboard paths on the subdomain redirect to its root/member routes.
- Source: https://github.com/GDG-GT/gdg-gt-website; `main` is connected to the existing Vercel project. Cloudflare manages the chapter domains.
- Runtime: Vercel / Node 24 and Supabase, with canonical schema through migration 144 and explicit private-table/function grants.
- The existing Super Admin account and production private workspace are configured. Do not create the owner again or replay applied migrations.

## Configured operating integrations

Resend is the sender/delivery provider, with the verified sender/domain and signed callback handling recorded in production evidence. The chapter contact/reply inbox is `gdg@gatech.edu`. Private storage, hosted scanning/media/export handling, scheduled operating jobs and recovery are configured as described in the [production runtime guide](operations/PRODUCTION_RUNTIME.md).

The owner accepted the current 50 MiB storage/video/export cap for the selected free provider setup; smaller purpose-specific limits remain. Provider quotas and configured credentials remain operational constraints. Temporary management tokens are not application runtime keys.

Chapter links and the executive-board application are published. Forms and Linktree pages use their standalone presentation. Finances use actual stored records rather than sample balances.

Points/card management and separate-event connections are deployed. Future event websites install the portable adapter in their own backend/project. Their actual registration flows and account-linking screens need per-event setup; no fictional event connections or rewards were populated in production.

## Verification

All seven CI jobs for `933a70f` passed. Fresh anonymous desktop/mobile checks confirmed the leaderboard root/member navigation, private API rejection, browser rejection from the server-to-server integration API and protected card handoff. The existing signed-in Super Admin session visibly loaded the event connection controls. See [live release evidence](phase0/event-membership-live-release.json).

Prior production scanner/storage/delivery/worker setup records remain in `phase0` where retained. They are dated operational evidence, not instructions to repeat sends, recreate keys, reset the database or reprovision the deployment.

## Configuration and acceptance still pending

GT member SSO awaits the approved provider settings and real institutional verification. Admin/Form SSO remains separate planned work. Google sign-in is excluded. GDG community/GT Engage integration is documented research. Physical card/phone/Wallet testing and Apple contactless issuer/reader prerequisites remain separate from software CI. Human accessibility/visual and longer production acceptance are not automatically certified by this report.

The owner identified the external-open rendering issue as Vivaldi-specific and explicitly closed that investigation. Do not reopen it as an unresolved application release blocker without new evidence.
