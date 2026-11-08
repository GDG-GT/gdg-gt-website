# Person-data privacy read recovery

Local verification on 2026-11-06. This does not certify full PRD or manual/device/
approved-visual/hosted acceptance. Applied SQL chain remains 132; no migration.

Cleanup-request reads now retain a dated successful snapshot after a transient
failure, independently expose named loading/retry and refuse malformed results.
Requester fields and an already prepared review remain in memory while actions
pause until a current successful read. Current read denial clears scope, proof,
review, result and counters, cancels pending requests and requires explicit recheck.
Account/role/session context changes remount private state and cancel old work.
Offline/reconnected actions stay paused until explicit refresh. Password rejection
is kept distinct from loss of current privacy access.

Back to scope uses the existing private-draft navigation guard. Reviewed record
and cleanup history tables are named keyboard-focusable scroll regions. Review
expiry copy no longer implies that an unconfirmed request changed no records.
Unknown review/commit outcomes still need their own recovery module, including
the existing single-use export restriction. This checkpoint does not add or certify
that mutation recovery or any physical erasure.

All 24 focused client/server cases pass, including 18 new private read cases.
An explicit restart cancels a stuck metadata read and refuses its late result.
An initial test found duplicate region names between history section and scrolling
table; the table now has a distinct name. All 18 populated production-browser
checks pass across six profiles, no skips; measured axe and overflow pass. No
approved golden or actual Safari/device claim. `../phase0/privacy-read-final-browser.json`.

All 15 actual local API/DB/native desktop-mobile checks pass: read-only exact
subject review preparation, metadata retry/outage/denial, preserved review on
declined navigation, current source records unchanged and no approval/egress/
errors/overflow. Only two owned reviews are prepared; neither is approved.
The first fixture cleanup attempted a protected direct UPDATE and correctly hit
42501 after the UI assertions. Read-only inspection identified its single owned
fixture account and two reviews; contact content had already been redacted.
Follow-up revoked all owned sessions and disabled the account with verification.
Reviews remain private under ordinary expiry/cleanup; no grants were weakened.
The fixture now respects that boundary. `../phase0/local-privacy-read-recovery.json`.

Strict types, build, lint (zero errors/25 existing warnings), byte budgets,
current/history secrets and traceability pass. All 2,535 tests/205 files and all
21 critical 90% branch gates pass. Global lines/branches/statements pass at
73.39%/73.15%/71.75%; functions still fail unchanged 70% at 64.90%.
`../phase0/privacy-read-quality.json`. Mobile native capture was inspected.
A new normative privacy-read case brings the catalog to 160 unverified logical
cases without promoting any of the 146 full-acceptance requirement statuses.

Remaining: ordinary member/merge and contact status/hold mutation recovery,
person-data privacy original review/commit recovery, global function coverage and
complete role/manual/device/visual/hosted acceptance. SSO/Google and Bevy/Engage
stay deferred. No deployment, purchase, real provider send, production change,
new timer or AI commit trailer. Preserve unrelated existing user files.
