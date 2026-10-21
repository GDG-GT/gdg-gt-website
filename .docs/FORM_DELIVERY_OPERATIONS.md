# Reviewed Forms mail

Local implementation: 2026-10-21. SSO and Bevy/Engage remain deferred. This does
not certify the remaining Forms workflows, hosted providers or full PRD acceptance.

Builder → Settings → Review receipts & notifications opens a separate review of
the exact saved definition. Configure recipients, type the displayed `DELIVERY`
reference and confirm the current password. Changes are not silently saved. The
review dialog warns before discarding edits and clears private state on session
loss. Archived forms are read-only. The ordinary Response receipt setting must
also be enabled and a matching review must exist before publishing receipts.

Receipts are restricted to verified-email, invitation-only and active chapter
account access. An arbitrary answer that looks like an email is never used as a
delivery address. Unlisted links are not personal email verification. Chapter
notifications accept at most ten current eligible account IDs and the optional
server-configured chapter inbox, never caller-supplied email addresses. The
settings DTO does not expose candidate email addresses.

Mail is metadata-only by default. Admin or Super Admin review is required for
non-sensitive answer inclusion. Sensitive fields and file/content blocks are
always excluded. An answer set above 32 KiB is omitted in full with an explicit
notice, not truncated. HTML is escaped, and only server-prepared recipients are
used. Delivered mail and already downloaded files cannot be recalled.

Submission and outbox creation are atomic. A submission retry never retroactively
adds mail after a policy changes. Outbox payloads contain only a delivery ID;
respondent email is retained encrypted where needed. The durable worker requires
its current lease and rechecks the form, reviewer, policy, recipient and response.
Disabled recipients/reviewers, archived forms, redacted/deleted responses,
superseded approvals and jobs over 24 hours old are suppressed. Answer-bearing
jobs are also suppressed after the response revision changes. Review of a new
draft intentionally invalidates older queued approvals, including messages for
an earlier live version. Ordinary draft edits require fresh review before the
new receipt-enabled version can publish.

The worker recheck occurs immediately before message construction/provider send;
a concurrent revocation after that check cannot retract an in-flight provider
request. Resend uses the existing per-job idempotency key. Local SMTP is a test
sink, not a provider with an exactly-once delivery guarantee after process crash.
No external mail was enabled or sent during this implementation.

Evidence: migration/test `065_form_reviewed_delivery.sql`, four focused unit
tests, and `npm run test:local-form-delivery` (20 real HTTP/database/SMTP checks).
The integration harness uses an invocation-owned fictional administrator and
archives its form/deactivates the test account afterward. It never resets the
human operator's login quota. Screenshots in `ui-review/real-form-delivery-*.png`
show the desktop/mobile archived review; keyboard PageDown moved mobile dialog
scrollTop from 0 to 491.5 px, with page width 375 px.

Use the existing local scheduler (`npm run jobs:scheduler -- --watch`) for delivery
or `npm run jobs:local` for a bounded one-off batch. Production requires reviewed
sender/inbox settings, real provider credentials, supervision, monitoring and a
separate hosted delivery/complaint/bounce acceptance run. Migration 065 is applied
locally and immutable; corrections require a forward migration.
