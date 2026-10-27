# Finance interaction recovery — October 27, 2026

Finance permissions, request inventory, budget inventory, report and selected detail
now own independent abortable, keyed reads. A failed report or budget request no
longer hides successfully loaded finance requests. Temporary failures retain their
authorized timestamped snapshot; denial erases the affected data and capability
denial clears/cancels the whole private workspace. Account/role/session changes
remount finance state, including editors. Empty, unavailable, loading and stale
states are distinct; filter reset and inverted date-range validation are explicit.

The previously verified Linktree read implementation is shared through
`src/hooks/usePrivateRead.ts`; the Linktree export remains compatible. Its 17 DOM
regression cases pass alongside the finance checks. `usePrivateMutation` provides
the shared synchronous pending guard, abort signal and private-context ownership
for finance editors, allocations, decisions, notes and attachment operations.
Forms retain their existing unchanged-intent keys and server revision checks.
Passwords clear at request start. Exact confirmation also runs in submit handlers.
Error, decision and note receipts receive semantic focus.

Request and allocation changes respect refreshed grants/revisions and unavailable
reads while preserving fields. Note text remains available to copy after note
permission disappears. Parent/attachment pending guards coordinate at action time,
and late authorized-download results cannot repopulate a discarded context.
Quarantine uploads use a combined private-context and timeout signal; an abandoned
upload cannot continue into completion. Finance scope, immutable decisions, exact
decimal money, self-approval rules and retained records remain server-enforced.

Twenty-four DOM cases include three structural axe audits. The full run passes
1,004 tests/132 files. Strict types and lint (zero errors/25 existing warnings)
pass. Coverage remains below the required 70% at 49.60% lines/47.22% branches;
all 17 critical-file branch gates pass. No exclusions or thresholds were relaxed.

The real loopback ledger suite passes 37 checks and the private receipt pipeline
passes 22: exact reservations/spend, approval races, self-approval denial, scope,
immutable history, CSV audit, real scans, quarantine rejection and 60-second signed
downloads. Seven additional checks exercise private draft retries and revision
conflict with an isolated ordinary member. Evidence:
`phase0/local-finances-integration.json`,
`phase0/local-finance-uploads-integration.json`,
`phase0/local-finance-recovery.json`.

Browser confirms an unsaved exact `25.01` amount survives a real remote revision
and Save is disabled. At 375 px the document remains 375 px, amount input fits
between 41–334 px and the ledger scroll container is 339 px. Discard confirmation
was verified; the draft was discarded, browser signed out/tab closed and viewport
reset. The new fictional request was cancelled through the API and retained;
its account was disabled, sessions revoked and private mode-0600 ledger removed.
No payment, real correspondence, browser draft save/approval or upload occurred.
See `phase0/finance-recovery-browser-observations.json` and
`ui-review/finance-conflict-recovery.png`.

The catalog has 129 unverified logical acceptance cases. Hosted, supported-device,
screen-reader, browser network/download and complete visual/performance/coverage
acceptance remain open. This checkpoint does not complete the full PRD.
