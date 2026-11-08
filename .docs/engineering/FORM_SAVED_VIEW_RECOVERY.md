# Private saved-view recovery — November 6, 2026

Migration 122 gives each saved response view a revision. A trigger also advances
that revision for existing service-side update paths. New views reject an existing
name instead of silently replacing it. Replacing/removing a selected view requires
its reviewed revision and current owner/account/session/form/response permissions
under transaction locks. Original action, source and body fingerprints bind one
atomic receipt and one audit entry. Receipts contain only identifiers/action;
private names, filters, columns, answers and respondent identity are not retained
in them. Both new functions have explicit service-only grants.

Read-only outcome inspection checks current authority and projects the currently
owned view plus its minimal receipt. It acknowledges an accepted removal and an
accepted creation whose row was later removed, without silently recreating it.
Expired receipts fail closed. The API separately validates creation/replacement/
removal documents, date order and query controls. Inventory search escapes literal
wildcards, scopes every row/count to the current owner/form and pages on the server
with a stable name/ID order; the old fetched 100-row ceiling is removed.

The workspace now has separate new-view, selected replacement and selected removal
reviews. The review shows frozen filter values with readable labels, selected question
labels/count and revision before confirmation. Only review preferences change; responses/publications stay
unchanged. The original normalized body/key is frozen and detached from subsequent
filters/name/column edits. Pending dispatch is latched. Account/role/form/session/
offline changes cancel obsolete work; reconnect never writes automatically.
Unconfirmed requests require read-only inspection before explicit identical retry
within 47 hours. A changed selected revision disables retry, and a second lost
retry requires a new inspection. Known conflicts require an explicit fresh review.
Malformed/substituted results cannot acknowledge another target/action. Proposed
names, reviews and uncertainty participate in navigation protection. Reviewed
stopping reloads current preferences; it does not undo an accepted write.

Existing independent private inventory recovery retains matching preferences and
proposed names during a transient failure and pauses changes. Search/page changes
clear obsolete selected targets. Denial clears preferences, proposals, response
snapshots and URL filters until explicit access recheck. Applying a saved view
only restores allowed filters; it cannot enable sensitive reveals or paging via
legacy preference values. Recovery uses existing restrained workspace controls.

Verification so far:

- Both complete 122-migration SQL suites pass (219/220 checks), including both
  100-client capacity races. All six isolated restore checks pass; migration 122
  applied locally without resetting the project database. The first isolated SQL
  test caught an ambiguous fixture variable; it was corrected, the verified
  stopped scratch database/volume removed, and both complete suites rerun.
- All 162 focused cases across six files pass, including 32 new route and 31 new
  client cases plus three parent action-denial regressions. They cover all three actions/both response-loss positions, current
  owner/revision/schema checks, exact retries, malformed/substituted results,
  scoped inventory/paging, denied/session/offline/context changes, duplicate
  dispatch, expiry, reviewed stopping and parent response regressions.
- All 50 actual API/DB/desktop-mobile Chromium checks pass:
  `../phase0/local-form-saved-view-recovery.json`. Each action/loss position has one
  intended result/audit and original body/key. Measured populated axe passes.
  Real search/paging reaches the 125th owned preference on each viewport.
- Two fresh fictional private draft forms, twelve intended view mutations and
  250 owned fictional pagination fixtures. No publication, responses, delivery
  jobs, workers/provider sends, existing chapter or production changes. Forms
  archived/accounts disabled/sessions revoked. The first probe stopped after
  five passing checks at a test-only exact-label locator mismatch; its cleanup
  completed and its report is preserved separately in
  `../phase0/local-form-saved-view-recovery-initial.json`. The corrected probe uses
  the actual combobox accessible-name prefix. Mobile recovery inspected;
  captures are unapproved rather than visual sign-off.

Production-browser and full-tree results are recorded in the current tracker.
Forms collaborator/invitation lifecycle, delivery/privacy/deletion/integrations/
runtime recovery and full coverage, physical-storage, device, manual, visual and
hosted acceptance remain open. This is not complete Forms or website acceptance.

All 192 production-browser response/shared-workspace checks pass across six
profiles, followed by 18 action-denial and 60 final review/pagination/denial
checks: `../phase0/form-saved-view-workspace-browser.json`,
`../phase0/form-action-denial-browser.json` and
`../phase0/form-saved-view-reviewed-browser.json`. Build/types/lint (zero errors/
25 existing warnings), byte budgets, secrets and traceability pass. All 1,966
tests/183 files pass. Global coverage remains red: 68.04% lines, 67.68% branches,
66.25% statements and 59.22% functions. All 17 critical branch gates pass; no
timeout/threshold changed. Catalog stays 159 unverified cases.
