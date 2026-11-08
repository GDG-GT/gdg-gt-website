# Account directory and session read recovery — November 5, 2026

The account directory and selected-account session inventory now read
independently. Each owns its loading, retry and timestamped transient-failure
state. Query, page and selected-account replacement hide old keyed snapshots,
abort the old request and ignore late data. Account/role/session replacement
remounts private fields and reads. Denial of either inventory clears the directory,
sessions, editor, password and confirmation before explicit access rechecking.

Directory failure or offline state disables creation, security actions, session
entry and editor saving. Matching last-success rows and unsaved editor input
remain visible on temporary failure. Session retry does not reload the directory
or pretend an unavailable inventory is empty. Closing session details restores
the opener or stable workspace landmark. Directory tables support named keyboard
scrolling; filtered empty results offer a reset and email search matches the
server's 100-character bound. Reconnect sends no automatic read or write.

Sixteen new DOM cases pass. All 21 actual loopback API/DB and Chromium desktop/
mobile checks pass, including anonymous/member denial, literal filtered safe
projections, private no-store session fields, independent recovery, retained
unsaved fields, stale-action disabling, denial clearing, measured populated axe
and keyboard table access. A first probe attempt used an exact text locator that
did not match the combined name/email table cell; cleanup succeeded before the
corrected rerun. The target account's revision and access remained unchanged;
both fictional accounts were disabled and their sessions revoked afterward.
Browser non-read API/external requests were blocked and realtime paused. No
setup/reset mail, existing account/session or provider was changed.
Evidence: `../phase0/local-user-read-recovery.json`.

All 1,343 tests/155 files pass. Global coverage still fails 70%: 61.52% lines,
60.87% branches, 59.90% statements and 52.76% functions. All 17 individual critical
branch gates pass. The catalog contains 149 unverified logical acceptance cases.
Types/lint (zero errors/25 warnings), build/budgets/secrets and traceability pass.
The complete pinned production-build browser matrix passes 112 applicable checks
with eight expected profile skips (`../phase0/browser-smoke.json`). Captures remain
unapproved review candidates, separate from the populated Chromium outage probe.

Account writes are a separate checkpoint: synchronous pending/cancellation,
uncertain-result replay, fresh selected-record revision/consequence review,
validation and full navigation recovery still require completion. Broader
supported-browser/role/manual/device/visual/hosted acceptance remains open.
