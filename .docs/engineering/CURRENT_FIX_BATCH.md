# Current owner-requested fix batch

Owner asked for at least15minutes of deep review across recent issues on2026-11-09, then fixes without further preference questions. Check actual UTC start/end timestamps in the final review record; do not claim elapsed review without evidence.

## Required completion

- Automatic transactional email on member credential issuance, including physical NFC registrations. Inline QR plus downloadable PNG attachment, short last-four reference (not a claimed chip UID), Apple/Google Wallet actions. Existing credentials get a resend action with delivery status. Retry safely; revoke/deactivate/email changes suppress stale messages. No manual officer forwarding.
- Audit all existing email entry points and delivery scheduling. Correct actionable gaps such as task assignment/deadline/overdue and team announcements. Preserve newsletter consent and reviewed Forms recipient/copy rules; avoid unsolicited historical fan-out. Consistent branded responsive templates for transactional/newsletter emails.
- Proper in-app dialogs, replacing JavaScript browser confirm/alert prompts. Revoke and Reverse already work at the backend; their inline confirmation above the current scroll position looked unresponsive. Fix all similar confirmation/feedback visibility patterns. Preserve draft safeguards and retry identities.
- Remove standalone QR fallback from new credential issuance. Physical NFC and Wallet remain, both with check-in QR. NFC programming instructions only for physical cards. Manual credential input belongs in an expandable backup section.
- Scanner: choose or create an activity directly, optionally arm automatic point awards for that selected activity until stopped/changed. No per-scan activity selection/confirmation in armed mode; server permissions/open-window/duplicate rules remain authoritative. No invented production event, point rule or award.
- Native Check-in tab opens scanner subview directly. Keep Members & cards reachable. Native website/app design consistent.
- Finish the real owner's registration/email/check-in-resolution flow through UI only. No direct backend creation or mutation of the owner's member records. Registration already saved through Vivaldi UI: Tejas Singhal, tejas.singhal@gatech.edu, active chapter member, member ID ea3fd482-ae6c-41ed-993c-e56b74383b3a. Wallet credential already issued once through UI:6362754f-3df3-4ea0-ba5a-b958330b18fa, label Tejas membership pass. Do not duplicate or revoke it. Balance0. Manual download was cancelled; no mail has been sent to him yet. The live tab remains on /admin/rewards with the issued QR visible in page state. No optional personal details were invented.
- At the end shut down every temporary local dev/test server and the test VM; keep production and data intact. Auto-resume watcher was unloaded at owner's request; do not restart it or create timers.

## Review evidence and findings

Active source, migration, UI, delivery and test review ran from **2026-11-09 05:04:30 UTC to 05:24:24 UTC** (19 minutes 54 seconds), followed by implementation and regression checks. This is actual review time, not a promised sleep timer.

| Area | Finding and correction |
|---|---|
| Member credential delivery | Issuance previously returned a screen-only credential. Added atomic outbox mail, current-recipient checks, stable provider retry identity, inline QR and PNG attachment, Wallet links, existing-card resend and status. No new member or points backfill. |
| Workspace deadlines | Assignment and overdue work reached in-app notifications but lacked recipient email. Added current-assignee/current-occurrence checks, one due-soon notification per deadline occurrence, and metadata-only mail. Completed/reassigned/inaccessible tasks are suppressed. |
| Team announcements | Current in-app audience now gets metadata-only email after permission/version/expiry recheck. Former members are excluded. |
| Existing mail paths | Event registration/approved attendee messages, Forms invitations/access/respondent copies/reviewed notices, contact acknowledgement/inbox, account recovery/invitations, direct-message notices, chapter announcements, newsletter confirmation/campaigns already use the durable transport. Shared responsive email chrome now covers them. |
| Consent and privacy | Newsletter double opt-in and reviewed Forms recipient/copy rules remain. No historical notification replay, blanket chat/finance broadcasts or unpublished-content fan-out. Private card links use a seven-day fragment capability and recheck active member/credential/email. |
| Action confirmation | Browser JavaScript confirms removed from application code. Destructive short reviews moved into focus-trapped dialogs, including rewards, content, channel messages, task comments and team posts. Long comparison/review workflows retain dedicated editors. Browser tab/window close remains the platform's native warning. |
| Action results | Visible fixed feedback and dismiss controls prevent a result appearing outside the viewport. Recovery actions retain their original idempotency keys and stay accessible inside a modal when necessary. |
| Scanner | Per-session activity selection, optional explicit automatic-award mode, duplicate handling, unknown-result retry, continuous QR scan, direct native Check-in destination, and activity/rule creation. Choosing another activity disarms scanning. No fake production point rule/activity/award. |
| Credential UX | New issuance supports physical NFC and Wallet only. NFC programming is shown only for physical cards. Legacy QR records remain readable. Manual credential entry is collapsed by default. |
| Content settings | Grouped actions/previews/collection controls, wrapping layout and mobile spacing. Public team stays in Site content. |
| Newsletter | Three reusable starters: chapter update, event invitation and event recap. These are drafts with editable bracketed details, not sent campaigns. |
| Profiles | Optional HTTPS portfolio / website in personal profile and public team editor, carried through drafts/publication to public team cards. Fields can be cleared. |

## Validation and rollout checkpoint

Migrations145,146,147 passed disposable canonical and legacy-grants database tests, including database concurrency checks. The PL/pgSQL ambiguity and modal recovery/focus regressions found during review are fixed. Full suite at 05:25 UTC:252 files /2999 tests passed, with additional focused dialog tests added afterward. Final checks passed:253 unit/integration files with3002 tests;15 focused tests after the final label/feedback changes;56 broader mobile browser cases plus12 final email/dialog cases across Chromium desktop/mobile and WebKit mobile. Two earlier cases exposed an Apple Wallet accessible-label mismatch, now fixed and passing. TypeScript, lint (8 inherited warnings,0errors), production build, SSR, bundle budgets and source/history secret scan passed. Migrations are not applied to production yet and this feature batch is not pushed yet.

The current hosted project has13 active named Cron jobs. Delivery and newsletter are active, unlike an old runtime doc. Temporarily pause only delivery during the schema/web rollout, then restore its prior active state immediately after the matching worker deploy. Do not leave it paused. No production message is queued by the migrations themselves.

Owner's existing credential must be emailed through the UI after deployment; it predates the issuance trigger. Three production newsletter templates must be saved through UI as drafts. Do not recreate the real member or issue another pass.

App build6 TestFlight assignment is confirmed done. Android signed APK was delivered earlier; no native binary source changed in this batch. Google Wallet publishing, Smart Tap certification and Apple VAS approvals remain external gates. No direct Samsung integration or Google website login.

Preserve unrelated `supabase/.temp/cli-latest`. No AI commit trailers, purchases, tester invites or additional timers. Push/deploy to GDG-GT remains authorized. Provider credentials are in private files outside Git and must never be printed.
