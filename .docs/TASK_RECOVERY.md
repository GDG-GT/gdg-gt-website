# Task workspace recovery — October 27, 2026

Task saves and comment operations now freeze synchronously, use abortable requests
bound to the selected task/account/session, and ignore late results from a discarded
private context. An unchanged failed write retains its request key. Reassignment
passwords clear when a request starts and are excluded from the retained intent
signature, matching the server's request hash.

Inventory, selected-task and creation-permission failures remain independent.
Initial failures no longer leave perpetual loading indicators; skeletons, retries,
filter reset and timestamped stale snapshots explain each read state. Offline
drafts stay in the open tab and never submit on reconnect. Saves/status/comments
are blocked during an unavailable or incomplete selected-task read.

Fresh task actions replace cached grants without replacing editor fields. A newer
task revision disables a stale edit. Comment edits preserve unsaved text when a
remote edit/removal conflicts. Refresh revisits the displayed older comment pages
as well as the latest page, replacing removed text and updating the history cursor.
Feedback moves focus to a meaningful error or committed receipt; editor fields
freeze while the operation is pending. Exact-title and current-password controls
still apply to protected audience changes.

Nineteen interaction cases in `tests/client/task-recovery.test.tsx` include two axe
structural audits. The clean full run passes 938 tests in 129 files. Types pass;
lint reports zero errors and the existing 25 warnings. Production build and entry
byte budgets pass. Global coverage remains below the required 70% at 44.06% lines
and 41.88% branches; the 17 critical-file branch gates pass. Thresholds and coverage
inclusions have not been relaxed.

The fresh actual loopback task suite passes all 40 scheduled-job, privacy,
revision, idempotency, assignment, comment, delivery and archive/restore assertions;
its evidence records cleanup completed. A previous browser hold was interrupted by
the tool-server restart. Its two exact owned tasks were subsequently archived,
three fictional accounts disabled and all their sessions revoked; the private
review ledger was removed. See `phase0/task-review-interruption-cleanup.json`.

Browser DOM verification confirms a real remote update preserves a fictional draft
and disables Save. At 375 pixels, the document has no horizontal overflow; task
fields stay inside the viewport and task buttons have 44-pixel height. The draft
was discarded, browser sign-out verified, the fresh tab closed and viewport reset.
The interrupted original tab is signed out but its debugger would not reconnect
for explicit closure. Screenshot capture timed out twice: no screenshot is accepted
or claimed. These observations are partial local evidence, not visual acceptance
or supported-device/screen-reader approval. See
`phase0/task-recovery-browser-observations.json` and
`phase0/task-review-remote-update.json`.

The test runner now creates an isolated fictional officer rather than spending the
existing local officer's confirmation quota. Browser holds save interim evidence
marked cleanup-pending and keep credentials only in an ignored, exclusive,
mode-0600 ledger. Scheduler occurrence and rate-limit records are never reset.
The separate seven-check task privacy suite passes against the real local API.

The catalog now contains 126 unverified logical acceptance cases. Mandatory browser,
manual, hosted, coverage and other module checks remain open; this is not a full
PRD completion or release claim.
