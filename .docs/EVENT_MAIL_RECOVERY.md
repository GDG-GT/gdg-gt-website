# Event-mail approval reconciliation — November 5, 2026

Migration 117 adds a read-only current account/session/event/review/key lookup.
A committed approval is reconciled from its durable receipt and matching
append-only review audit, including after the five-minute review expires or is
purged. No additional approval POST or mail job is needed. Uncommitted review
readiness checks event revision/state and exact recipient identities; expired,
changed, consumed and unavailable reviews do not expose frozen audience data.
Current email capability remains mandatory before receipt or readiness lookup.

The client now owns scoped pending/cancellation state, exact saved review and
password-free uncertain approval. A read-only recheck either reports confirmed
queueing to the parent or permits a fresh-password explicit identical retry.
Failed rechecks keep retries disabled; unavailable or mismatched review snapshots
cannot drive a write. The 47-hour retry cutoff and action-time review expiry are
enforced. Offline/reconnect clears proof and requires explicit rechecking; it
never submits or rechecks automatically. Wrong proof can be corrected inline.
Permission denial/session replacement clears recipients, content and credentials
before an actual current-access read can reopen an empty composer. Event
replacement cancels transport and fences late callbacks.

Returning to the message or closing uncertain approval reviews the possibility
that messages were already queued. Abandonment recalls no accepted mail; ordinary
draft navigation continues through Stay/Discard. Private paginated history lets
the current sender compare their own queued subjects, bodies, timestamps and
recipient counts. It has independent loading/empty/error/retained timestamp/
retry/denial handling and no delivery claims. History never exposes password/key
hashes or raw recipient lists and remains available during uncertain approval.

All 46 new client/server cases pass with the six existing mail cases (52 focused).
All 19 actual API/DB/desktop-mobile Chromium checks pass, including exact-audience
axe, queued receipt reconciliation after expiry without a second POST, read-only
ready lookup followed by fresh-proof identical retry, private sender history and
denied lookup clearing. Four intended fictional messages/jobs were created.
Sender/scheduler preflight ran; no delivery worker/provider send ran. Owned jobs
were marked dead/secrets cleared, reviews expired, registration soft-deleted,
events archived, credentials retired/accounts disabled and sessions revoked.
Immutable fictional message/audit records were preserved. Existing chapter and
production records were untouched. Evidence: `phase0/local-event-mail-recovery.json`.

Earlier probe attempts caught a missing event lifecycle document, an ambiguous
recipient locator and a stale-notice timing race. The final probe waits for panel
closure before asserting queue completion. Its cleanup was corrected to retain
immutable event-message audit rows and retire the fictional credential generation;
the one interrupted fixture was explicitly inspected and recovered before the
final run. No audit protections were bypassed. Captures are masked/private and
remain unapproved review candidates.

The complete 117-migration SQL suites pass under explicit API grants and legacy
automatic grants (209/210 checks), including both 100-client races. All six
isolated restore checks pass. Full supported-role/device/manual/visual/SMTP-
provider/hosted acceptance remains open; this does not complete the PRD.

All 1,557 tests/167 files pass. Full-tree coverage remains below 70%: 64.75% lines,
64.68% branches, 63.02% statements and 56.00% functions; all 17 critical branch
gates pass. Catalog: 156 unverified logical acceptance cases.

Types/lint (zero errors/25 warnings), production build, byte budgets, secret scan
and traceability pass. All 96 targeted production-build mail/announcement/
invitation/team-review/child-read/shared-workspace browser checks pass across six
pinned profiles. Mail browser fixtures separately verify both before-acceptance
and after-acceptance response loss, private queued history and long message
content with measured axe. Evidence: `phase0/event-mail-recovery-workspace-browser.json`.
Captures remain unapproved review candidates, separate from real-device/manual
and hosted delivery acceptance.
