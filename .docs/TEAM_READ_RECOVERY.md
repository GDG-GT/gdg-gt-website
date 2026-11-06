# Independent team workspace reads — November 5, 2026

Team inventory, selected workspace, activity/transfer history and transfer
destinations now read independently with keyed private snapshots. Each exposes
loading, explicit retry and a last-success timestamp after temporary failure.
Unavailable history no longer looks empty. A directory outage does not hide an
already authorized selected team; retrying one read does not reload unrelated
panels. Changed pages/search/team/section keys cancel old transport and hide the
prior snapshot. Account/role/session/route replacement remounts private fields.
Denial clears all team/member/history/permission input before current-access
rechecking returns to the directory.

Current read/grant/team/member revisions gate writes. A stale team or membership
retains unsaved fields and blocks another save until the officer reviews closing
the stale editor and chooses a current action. Stale/offline destination reads
retain a selection but cannot drive a transfer. Read-only retries never submit
input. Parent outages pause mounted invitation/announcement controls, preserving
their drafts; the actual child submit handlers refuse paused/offline calls.
Scoped pending/cancellation guards now fence the existing team mutation transport;
full mutation replay/consequence work remains a separate checkpoint. Internal
Cancel delegates to the existing Stay/Discard navigation review.

Twenty-two focused DOM cases cover independent failure/retry, retained snapshots,
stale revision checks, denial, account/session isolation, replacement/late reads,
offline behavior and actual child pause behavior. All 28 actual loopback API/DB
and desktop/mobile Chromium checks pass: private uncached read projections,
anonymous/unrelated-member denials, directory/detail/history/destination outage
recovery, preserved unsaved values, paused stale transfers, denial clearing,
populated measured axe and no page errors/writes/external requests/overflow.
The two owned teams and memberships stayed unchanged before recoverable archive;
fictional accounts were disabled and sessions revoked. Existing records/providers
and production were untouched. Evidence: `phase0/local-team-read-recovery.json`.

All 1,386 tests/158 files pass. Coverage still fails 70%: 62.89% lines, 62.57%
branches, 61.26% statements and 54.50% functions; all 17 critical branch gates
pass. The catalog contains 151 unverified logical cases.
Types/lint (zero errors/25 warnings), build/budgets/secrets and traceability pass.
All 48 targeted production-build workspace browser checks pass across six pinned
profiles; evidence: `phase0/team-read-workspace-browser.json`. Captures remain
unapproved review candidates, separate from the populated Chromium outage probe.

Complete team mutation replay, named/typed consequence reviews, uncertain-write
recovery, invitation/announcement negative/error states and supported-browser/
role/device/manual/visual/hosted acceptance remain open. These local checks do
not complete the full Team or website PRD.
