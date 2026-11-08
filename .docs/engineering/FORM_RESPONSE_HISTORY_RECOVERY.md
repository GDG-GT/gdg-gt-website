# Private response-history recovery — November 6, 2026

Revision inventory and selected answers now have independent loading, errors,
explicit retries and timestamped matching snapshots. A temporary selected-read
failure does not reload the list or lose the selected revision. Inventory outages
retain matching displayed answers while pausing new selections, pagination and
sensitive reveals. Denial clears both private reads and requires explicit access
recheck. First-read failure remains distinguishable from an empty inventory.

Account, role, form, response and sensitive-capability changes remount the private
workspace synchronously. Session invalidation aborts reads, clears answers and
blocks reopening from the stale session. Closing, page changes, revision changes
and sensitive-mode changes cancel obsolete work. Returning to masked mode clears
revealed values immediately, including offline; reconnecting does not fetch or
reveal automatically. An explicit reload obtains the masked snapshot. Fresh
redaction/current-revision metadata invalidates selected historical answers.
Response/revision substitution is rejected by the view as well as the server.

All 46 focused history/data cases pass (24 new history regressions). All 24 actual
loopback API/DB/Chromium desktop/mobile cases pass:
`../phase0/local-form-history-read-recovery.json`. Two owned fictional internal forms
are published once; each has one intended submission and one respondent edit.
Original labels/answers and default masking, independent outages, timestamp
retention, explicit reveal/hide, denial clearing, measured populated axe and
identifier-only audit are verified. Browser mutations/external requests are
blocked; history inspection adds no response revisions, versions or delivery jobs.
The intended submissions each queue one metadata notification job; owned jobs
are disabled/secret payloads cleared, forms archived, accounts disabled and
sessions revoked. No worker/provider send or existing chapter/production change.

The first live probe caught low-contrast answer text; its existing secondary-text
token now passes measured axe in both individual/history views. A second probe
incorrectly assumed submission queues no job. Read-only inspection is now checked
against its baseline job identifiers. Both failed probes cleaned forms/accounts;
their two owned pending jobs were inspected and explicitly disabled without a
worker. Final cleanup includes those jobs. No timeout or threshold was relaxed.
Captures remain unapproved candidates, not visual acceptance.

Remaining response inventory/summary/views, exports/files, mutation recovery,
Forms access/settings/deletion/integrations/runtime and complete supported-role/
device/manual/visual/hosted acceptance remain open. This does not certify the
complete Forms or website PRD.

Production build/types/lint (zero errors/25 existing warnings), public byte
budgets, secret scan and traceability pass. All 54 history/shared-workspace
production-browser cases pass across six profiles:
`../phase0/form-response-history-workspace-browser.json`. Final viewport capture
refinement passes all six history cases again
(`../phase0/form-response-history-final-browser.json`); the visible selected-history
state was inspected. This is not human visual approval or real-device acceptance.

All 1,708 tests/174 files pass. Global coverage remains below 70%: 66.01% lines,
65.82% branches, 64.25% statements and 57.28% functions. All 17 critical branch
gates pass. No timeout/threshold changed; catalog stays 159 unverified cases.
