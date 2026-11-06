# Reviewed invitation changes and atomic replay — November 5, 2026

Migration 115 binds invitation create/resend/revoke receipts to current account,
session, own-password proof, team-management authority and applicable target
hierarchy. Receipt insertion shares the invite/mail/audit transaction. A replay
returns the current safe invitation projection, not a stale pending status or
capability material. Changed intent cannot reuse a key. Resend replay rotates
the link and queues mail once; revoke replay increments revision/audit once.
Revocation remains possible when the recipient can no longer accept.

Protected exact-ID and normalized exact-recipient reads support reconciliation
without scanning a fetched page or exposing token hashes. Every read remains
team-scoped, authorized and uncached. Receipts retain only the invitation ID;
password proof and random capability/encrypted delivery material do not enter
the intent fingerprint.

The client reviews the exact recipient, membership role and create/rotation/
revocation consequences before writing. Pending input/modal guards, scoped
cancellation and actual submitter/receipt/access focus recovery protect the flow.
Wrong-password confirmation can be corrected inline without changing reviewed
intent. Uncertain results retain password-free intent with a 47-hour cutoff:
an explicit read-only recheck precedes a fresh-password identical retry. Failed
rechecks leave retries disabled. Denial clears rows, targets and credentials.
Abandoning uncertainty requires a consequence review and reverses no saved
change. Conflict recovery preserves input until stale-action closing is reviewed.
Success reports the actual saved role/status, including an existing pending invite.

Thirty new client/server cases pass, with 57 focused read/pause/write regressions.
All 20 actual API/DB/desktop-mobile Chromium checks pass: ten concurrent creates
produce one invitation/job/audit; accepted-but-lost resends produce one rotation,
job and audit each; exact revoke replay runs once. Recipient/consequence reviews
pass measured axe, focus return and overflow checks. Sender/scheduler preflight
ran; no delivery worker or provider send ran. Owned jobs were marked dead and
secret payloads cleared; invitations cancelled/team archived/accounts disabled/
sessions revoked. Existing chapter records and production were untouched.
Evidence: `phase0/local-invitation-mutation-recovery.json`.

The complete 115-migration SQL suite passes under explicit API grants and legacy
automatic grants (205/206 checks), including both 100-client races. All six
isolated restore checks pass. Announcement mutation recovery and full invitation
role/device/manual/visual/provider/hosted acceptance remain open. This checkpoint
does not certify complete Teams or website acceptance.

All 1,470 tests/163 files pass. Full-tree coverage remains below 70%: 63.88% lines,
63.79% branches, 62.21% statements and 55.35% functions. All 17 critical-file
branch gates pass. Catalog: 154 unverified logical acceptance cases.

Types/lint (zero errors/25 warnings), production build, byte budgets, secret scan
and traceability pass. All 78 targeted production-build invitation-review/
child-read/team-review/shared-workspace browser checks pass across six pinned
profiles. Fake browser receipts are separate from the actual local probe above.
Evidence: `phase0/invitation-recovery-workspace-browser.json`. Mobile review was
visually inspected; captures remain unapproved candidates, with manual and
real-device acceptance still open.
