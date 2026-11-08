# Reviewed event email

Implemented locally on 2026-10-21, forward migration 089. This replaces the
count-only approval path; the old SQL queue function fails closed. It is not
permission to send real mail or a hosted delivery certification.

## Workflow

From Events → Attendance → Email registered attendees, enter a plain-text subject
and message, then choose Review recipients and message. The server saves the
exact registration IDs/addresses, content and event revision in a five-minute,
current-session-bound review. Inspect all addresses and the final count. Approval
requires the current password and `SEND N`. No arbitrary addresses, provider
options or replacement content are accepted in the approval request.

Any recipient identity/count change or event revision change requires a new
review. A review can create only one batch, even with a new request key. Retry an
ambiguous response using the same unchanged review/request identity. Drafts and
reviews live in browser memory only; Back preserves the message, and Close/All
events/navigation use the shared Stay/Discard guard. Private data is never queued
offline. Logout clears content, review, password and pending requests.

Only published/cancelled events can be emailed. Current active unlocked
Admin/Super Admin accounts have chapter access. Team members need active team
membership, Events page/read access and a separate explicit `send_email` grant.
General CRUD does not imply fan-out. Inactive/archived teams cannot send. Maximum
batch is 1,000; approval is limited to ten per account/day, reviews to thirty/hour,
with additional HTTP request limits. Writes enforce CSRF, current authorization,
optimistic audience/revision checks, idempotency and identifier-only audit.

Each recipient job contains only message/registration references. Under its
current fenced lease, delivery rechecks sender status, password generation,
current scope/send grant, event publication, frozen registration/address and a
20-hour processing deadline. Removed or changed addresses are skipped, never
replaced with a new address. Newly added attendees do not inherit an approved
batch. Archived events cannot send queued messages; cancellation notices remain
possible. Lease expiry/retry does not rewrite immutable approved content.

Shared server transport escapes text in HTML, owns sender/reply identity, uses
stable per-job provider idempotency and bounded existing eight-attempt backoff.
Queued/processed/provider accepted do not prove inbox delivery. SMTP cannot
promise exactly-once acceptance after an ambiguous network/process failure;
already accepted messages cannot be recalled. Preparation is a current database
check, not a distributed transaction with an external provider: a revocation
after preparation cannot recall an in-flight provider request.

The hourly cleanup job removes up to 1,000 reviews expired for over 24 hours,
including unused message content and recipient snapshots. Immutable approved
messages/audits remain; cross-system person erasure is separate pending work.

## Local verification

`npm run test:local-event-mail` uses new fictional accounts, one fictional event
and two explicit test addresses. Pause the identified scheduler first, so it
cannot race deterministic delivery. The suite refuses existing unrelated pending
event-email jobs and claims only the event-email job kind; no other delivery is
processed. Restart `npm run jobs:scheduler -- --watch` afterward. The optional
interactive `-- --hold-for-browser` leaves the synthetic event available until
`done`, then recoverably archives it and deactivates fixture accounts. Rate windows
are never reset. Email is captured by loopback Mailpit only.

- **89 migrations**, full canonical SQL and both 100-client capacity tests pass.
  SQL 089 covers scope/grants/session, expiry/password/typed approval, same-count
  identity replacement, immutable single-use approval, current lease, recipient
  removal, sender revocation/password rotation, inactive team and retention.
- **333 unit tests**, typecheck, changed-UI lint and build pass. Three additional
  unit cases cover strict review/approval fields and escaped leased delivery.
- **22 actual HTTP/database/SMTP checks** pass (`../phase0/local-event-mail.json`).
  Exactly one unchanged synthetic address received email; its replaced peer was
  skipped. Job payloads contain references only; no real person was contacted.
- Browser checks cover exact address disclosure by keyboard, review focus,
  disabled approval without credentials/typed count, Back draft preservation,
  All events/Close Stay/Discard and 375px normal scrolling/no horizontal overflow.
  Proofs: `../ui-review/event-mail-review-{desktop,mobile}.png`. Browser review did
  not approve an additional batch or enter a password.

Full supported-device/screen-reader/hosted provider/domain/retry/load/operational
acceptance and remaining PRD work are open. Existing chapter announcements,
private-message notices and team announcements retain their separately tested
scoped/reviewed or generic-notice contracts; this is not a claim that all mail
acceptance gates are closed.
