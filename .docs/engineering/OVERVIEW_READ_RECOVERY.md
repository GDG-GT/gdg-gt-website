# Overview private read and widget recovery — November 5, 2026

The dashboard now uses a cancellable keyed private read instead of an uncancelled
mount request. Account, role and session replacement remount the overview;
unmount cancels transport and late results cannot revive prior private widgets.
Denied reads clear the entire snapshot and offer an explicit current-access
recheck. A temporary refresh failure retains its dated successful snapshot.
Offline state includes the read timestamp, disables refresh and removes current
quick-action shortcuts until the overview is fresh and online. Reconnect sends
no automatic read or write.

Each failed widget has a named retry; other ready panels stay visible. The
existing aggregate endpoint recomputes its independently authorized widgets on
that explicit retry; no new individual-widget endpoint or separate cached data
store is introduced. The first-use event message does not suggest creation to
read-only users. Retry focus goes to the persistent workspace landmark.

Twelve new DOM cases and eight existing workspace cases pass. All 18 actual
loopback API/DB and desktop/mobile Chromium checks pass: anonymous denial,
uncached safe own-task projection, unrelated-account exclusion, initial and
background outage recovery, individual-widget error recovery, offline/reconnect,
denial clearing, populated measured axe and no page overflow/errors. The owned
task stayed at revision 1 before recoverable archive, both fictional accounts
were disabled and sessions revoked. All browser non-read API/external calls were
blocked and realtime paused. No existing account/record or provider changed.
Evidence: `../phase0/local-overview-read-recovery.json`.

All 1,327 tests/154 files pass. Coverage remains below 70%: 61.15% lines, 60.44%
branches, 59.53% statements and 52.21% functions. All 17 critical branch gates
pass. The catalog contains 148 unverified logical acceptance cases.
Types/lint (zero errors/25 warnings), build/budgets/secrets and traceability pass.
All 36 targeted production-build workspace browser checks pass across the six
pinned profiles. Separate evidence: `../phase0/overview-workspace-browser.json`.
Screenshots remain unapproved review candidates.

The populated local probe does not certify the complete supported-browser/role,
manual assistive-technology/device/zoom, approved visual, performance/load or
hosted acceptance matrices. The full PRD remains open.
