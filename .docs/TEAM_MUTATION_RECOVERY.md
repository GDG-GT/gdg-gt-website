# Reviewed team writes and atomic replay — November 5, 2026

Migration 114 wraps team changes in current account/session/password, team-action
and target hierarchy checks. Actor-bound intent receipts share the transaction
with team/member/grant changes. Replaying a receipt reprojects the current
authorized workspace, rather than returning stale private data. Receipts contain
the team identifier, not password proof. Changed intent cannot reuse a key.
Membership transfer replay checks the original member and destination authority,
including after the source membership has become inactive.

The client reviews team creation/details, archive/restore, exact current/proposed
page/action grants, member addition/role/removal and source/destination transfer
consequences. Sensitive operations retain typed team-name and own-password checks.
Pending guards freeze input and modal dismissal; account/role/session/route
replacement cancels transport and fences late responses. Review Escape returns
focus to the actual submitter. Stale team/member revisions invalidate approval.
Input errors are associated with fields and wrong-password confirmation can be
corrected in the review.

An uncertain response preserves password-free intent and its key. Read-only
rechecking shows current team/member values and never retries a write. A fresh
password and explicit retry replay that exact intent within 47 hours. Abandoning
recovery requires a consequence review and does not reverse any accepted change.
Normal internal cancellation continues to use the existing draft navigation guard.

Thirty new client/server cases and the existing 22 team-read/parent-pause cases
pass. The actual local API/DB/desktop-mobile probe passes all 33 checks, including
ten concurrent creates, accepted-but-lost edits and membership transfers, one
revision/audit per accepted edit and one membership/history occurrence per
accepted transfer. Populated grant reviews pass measured axe and cancellation
does not apply grants. Owned teams were archived, accounts disabled and sessions
revoked; no existing chapter data or provider sends changed. Evidence:
`phase0/local-team-mutation-recovery.json`.

The complete SQL suite passes under both explicit-grant and legacy-default-grant
modes, including migration 114 and both 100-client races. All six isolated restore
checks pass. These are local proofs, separate from supported-browser fixtures,
manual accessibility, approved visual baselines and hosted acceptance.

Complete invitation/announcement recovery remains separate work. This checkpoint
does not certify the full Teams module or complete website PRD.

All 1,416 tests/160 files pass in a clean run. Full-tree coverage is 63.37% lines,
63.02% branches, 61.73% statements and 54.78% functions, below the global 70%
requirement. All 17 critical-file branch gates pass. An earlier concurrent run
timed out in the import-graph hook; its clean rerun passed without changing
timeouts or gates. Catalog: 152 unverified logical acceptance cases.

Types/lint (zero errors/25 warnings), production build, byte budgets, secret scan
and traceability pass. All 60 targeted production-build browser checks pass across
six pinned profiles, including lost-save reconciliation, modal focus return,
long grant-review containment/keyboard reachability and measured axe. Those
browser mutations use explicitly fictional receipts, separate from the real
local SQL/API probe above. Evidence: `phase0/team-recovery-workspace-browser.json`.
Screenshots remain unapproved review candidates.
