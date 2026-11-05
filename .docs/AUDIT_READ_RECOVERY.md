# Audit history and detail recovery — November 5, 2026

Audit history/statistics and selected entry details now use independent keyed
private reads. Loading, retry, temporary refresh failure and offline states are
explicit. A transient failure retains only its matching timestamped snapshot;
changing filters/cursors or selected entries hides the previous data immediately.
Old transport cancels and late results cannot replace the current query.

Denied history or detail reads clear both private snapshots, cursor trail and
detail opener. Rechecking access returns to the current filtered inventory without
reopening the denied entry. Account/role/session replacement remounts private
state. Export and entry/page actions require a fresh online history read. Entry
retry refreshes only the selected detail. Focus returns to the invoking control
or persistent workspace landmark; named table regions support keyboard scrolling.
External filter changes reset cursor history. Filtered empty history offers a
reset, while first-use history explains where records will appear.

Fourteen new interaction cases plus eight existing workspace cases pass. All 23
actual loopback API/DB and desktop/mobile Chromium checks pass, including anonymous
and unprivileged denials, no-store projections, omitted metadata, independent
outage retry, stale export safeguards, denied-state clearing, keyboard scrolling,
focus recovery and populated measured axe checks. No browser mutation or external
call was allowed; no export was downloaded. Both fictional accounts were disabled
and their sessions revoked. The owned fictional append-only row and normal
read-audit records remain unchanged. Existing accounts/records, providers and
production were untouched. Evidence: `phase0/local-audit-read-recovery.json`.

All 1,315 tests/153 files pass. Global coverage still fails 70%: 61.10% lines,
60.33% branches, 59.47% statements and 52.09% functions; all 17 individual critical
branch gates pass. The catalog contains 147 unverified logical cases.
Types/lint (zero errors/25 warnings), build/budgets/secrets and traceability pass.
All 30 targeted production-build workspace browser checks pass across six pinned
profiles, including Audit's empty history. Separate evidence:
`phase0/audit-read-workspace-browser.json`. The populated outage probe is Chromium
only; screenshots remain unapproved review candidates.

Full supported-browser/populated role/device/manual accessibility, approved
visual baselines, export/load/retention/hosted acceptance remain open. This
checkpoint does not certify the complete PRD or production readiness.
