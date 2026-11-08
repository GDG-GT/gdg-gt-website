# Ordinary member write recovery

Local verification on 2026-11-06. This module covers ordinary community member
create/update/archive/restore/sync-profile/unmerge. Merge-preview/merge-commit
recovery and complete manual/device/visual/hosted PRD acceptance remain open.

Migration 133 is applied locally after both complete SQL chains passed (240/241
checks), both 100-client capacity races and six isolated restore checks. Do not
edit applied migration 133; SQL corrections need a new forward migration.
The first unapplied SQL attempt had a missing parenthesis around NOT CASE and
failed before 133 applied; corrected before successful chains/application.

Current-access/session/action-bound minimal receipt inspection precedes exact
body/key replay. Native ordinary writes use a session-scoped atomic wrapper
around the existing mutation/proof/profile checks. Identical create produces one
record; accepted old update returns its original receipt without overwriting a
newer edit, and a new stale request conflicts. Current session/scope/permissions
precede receipt/hash disclosure. Only ID/revision/profile ID enter receipts;
no name, email, fields, plaintext password or proof hash. Read-only inspection
requires the original normalized document/key and current session/CSRF, no password.
Lifecycle retry still requires newly entered current password through the original
mutation authorization path. Accepted read-only reconciliation needs no new proof.

The parent preserves original fields/scope/action/revision/key only in memory,
freezes uncertain changes/navigation, aborts on offline/unmount/session, pauses
polling and offers metadata-only inspection before explicit identical retry.
Second loss/reconnect clears retry eligibility, a 47-hour client window fences
the 48-hour server receipt, denial clears private state, reviewed stopping clears
proposals without undo/erasure claims. Fresh retry passwords are not retained.
New ordinary create/update fixture acknowledgements now include required revision.

Current focused evidence: all 105 route/parent/picker/transfer/client checks passed
before the final three cancellation/receipt/proof guards; all 19 ordinary write
cases pass after those additions (108 combined cases). Strict types/build/lint (zero errors/25 existing
warnings) pass. Both final SQL chains pass with added restore/profile/unmerge/
expiry checks; only the test file changed after migration application.

All 48 initial and all 48 final stricter-receipt production-browser write cases
pass across six profiles, no skips. `../phase0/member-write-final-browser.json`.
Populated axe/overflow pass and mobile unknown-create capture was inspected.
All 61 actual API/DB/native desktop-mobile checks pass, including original-body/
key before/after create/update/archive loss, read-only inspections, fresh-proof
explicit archive retries, ten simultaneous identical creates, an old accepted
update after a newer save and a new stale conflict. No unexpected egress/errors/
overflow or provider sends; fixture records archived, actor disabled/sessions
revoked. Private tombstones/audit remain; no physical-erasure claim.
`../phase0/local-member-write-recovery.json`.

All 2,558 tests/206 files pass; all 21 critical 90% branch gates pass. Global
lines/branches/statements pass at 73.53%/73.32%/71.87%; functions still fail the
unchanged 70% gate at 65.04%. Build/types/lint (zero errors/25 existing warnings),
budgets/secrets/traceability pass. Catalog: 160 unverified logical cases.
`../phase0/member-write-quality.json`. No completed fixture mutations need repeating.

Remaining: merge review/commit original outcomes, contact status/hold and person-
data privacy review/commit recovery, global function coverage and complete
manual/device/visual/hosted acceptance. SSO/Google and Bevy/Engage stay deferred.
