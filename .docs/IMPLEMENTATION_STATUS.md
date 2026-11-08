# Implementation and acceptance status

Current verified feature release: `933a70f` (November 8, 2026). [Production status](PRODUCTION_LAUNCH_STATUS.md) records its deployment; [the checkpoint](CURRENT_CHECKPOINT.md) records subsequent maintenance.

## Implemented and deployed

Public chapter pages and content; native identified Forms and response workflows; private member, team, content, collaboration, finance, media, newsletter, Linktree, privacy, audit and operating workflows; guarded navigation and PWA behavior; server-rendered public entry; scanned private uploads; server-side delivery/processing workers; member points/perks and NFC/QR credential management; dedicated leaderboard/member subdomain; and the reusable separate-event membership/attendance integration.

The current registration integration supports a separate event repository/domain/Supabase project, event-scoped credentials and member references, once-per-event account linking, live registration checks, duplicate-safe attendance and separate explicit Super Admin points awards. Each future event site must install its adapter/schema, connect real registrations and add its own linking UI. The [detailed guide](operations/EVENT_MEMBERSHIP_INTEGRATION.md) covers this setup.

## External setup or acceptance still distinct

- GT member OIDC code is gated until approved institutional/provider configuration and actual sign-in validation are supplied. Admin and Forms SSO are separate planned workflows. Google sign-in is excluded.
- Apple Wallet contactless issuance requires issuer credentials, the appropriate entitlement/reader setup and real device validation. An iPhone PWA does not implement raw NFC reading or phone-to-phone Wallet acceptance.
- Future event websites and their databases are not provisioned by creating a chapter connection. Each event needs its own configuration and staging verification.
- GDG community/GT Engage integration remains research; no unsupported synchronization is claimed.
- Automated tests do not provide human visual, screen-reader, physical device or extended production-soak sign-off. Full PRD acceptance is not inferred from a passing build. The requirement tracker retains its own verification state.

## Verification of release 933a70f

All seven GitHub CI jobs passed: 243 source test files / 2,929 tests; database/security and restore gates; unchanged coverage thresholds; dependency and history secret scanning; and three browser shards with 2,012 passing cases. Ten existing viewport/WebGL capability cases were inapplicable. The targeted rewards/event suite passed 54 cases across six profiles.

Canonical and legacy-grant migration tests pass through migration 143. The separate event schema passed registration/cancellation, binding, privileges, event-account deletion and 50 concurrent duplicate-tap checks producing one attendance record.

Fresh anonymous production desktop/mobile checks verified routing and access denials. The existing production Super Admin session visibly loaded Event connections with an empty inventory. No sample production event, card, attendance or points were created for that release.

Evidence: [event release](phase0/event-membership-release.json), [live/CI verification](phase0/event-membership-live-release.json), and [CI run](https://github.com/GDG-GT/gdg-gt-website/actions/runs/42519848592).

Older engineering notes and verification reports describe their own dated runs. Their test counts, open issues and prelaunch language do not override this status or current owner instructions.
