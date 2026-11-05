# Own-profile read recovery — November 4, 2026

The profile's `Promise.allSettled` loader silently ignored rejected session and
activity reads. Its outer catch could not report those failures, so unavailable
inventories looked empty. Separate keyed private reads now expose independent
loading skeletons, error/retry controls and timestamped last-success snapshots.
One failed panel does not hide the other. Denied reads clear their snapshot;
session-revocation controls are disabled while session data is loading, failed or
offline. Retries focus the persistent workspace landmark.

Account/role/session remounts isolate profile inputs and read state. Read transport
aborts on replacement/unmount; late results are ignored. Offline input remains in
the current tab, refresh controls wait for connectivity and reconnect sends no
profile mutation. A successful existing profile operation refreshes the two read
panels independently. This checkpoint does not complete the separate profile
mutation/confirmation/uncertain-result hardening work.

Eight new DOM tests cover loading, both failures, independent retry/success,
stale snapshots, denial, late/account replacement, same-account session clearing
and offline behavior. All 1,180 tests/143 files pass on the clean full rerun.
The first concurrent checks encountered a 10-second import-graph hook timeout;
the unchanged suite passed when rerun separately. No timeout/threshold was raised.
Overall coverage remains below 70%: 58.47% lines, 57.21% branches, 56.87%
statements, 48.88% functions. All 17 configured critical branch gates pass.

Seven actual local read checks pass with a fresh fictional account: anonymous
denial, current-session inventory, safe uncached session/activity projections and
logout denial. The account is disabled and its sessions revoked. No existing
account, profile, security setting or unrelated session was changed. The initial
probe could not use the stale saved bootstrap login; no credential was reset.
The probe now creates its own independent fictional actor instead.
Evidence: `phase0/local-profile-reads.json`; catalog: 138 unverified logical cases.

Full browser/contrast/screen-reader/device/hosted acceptance remains open. These
tests do not certify visual geometry or production readiness.
