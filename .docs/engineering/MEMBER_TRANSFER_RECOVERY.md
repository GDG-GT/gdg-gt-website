# Community directory CSV interaction recovery (local)

The existing `/admin/members` CSV import/export backend remains authoritative.
This pass completes missing UI safeguards around its review and transfer flow.
An immediate pending guard prevents competing review, import and export actions;
file reads use the same synchronous lock. Closing cannot discard an in-flight
operation. Password input clears when a request starts, while the explicit
request carries the captured confirmation. Failed imports retain the original
review and idempotency key for an explicit retry. Expiry is rechecked at click
time even if a background browser delayed the timer.

Source/destination changes invalidate the review and clear the password. Losing
the selected destination grant prevents a new review, even if a different team
grant remains. Account/role replacement remounts private transfer state; session
clearing/unmount aborts pending work and ignores late responses/file reads. Offline
CSV input stays only in the open tab, with the old review removed; reconnecting
never submits and requires explicit review again. Request cancellation is not a
server rollback.

Parsed/error/review feedback receives semantic focus. Closing restores the opener;
a completed import/export focuses its persistent receipt instead. Private export
fields are unchecked each time the modal opens. Filtered export remains explicit,
and its completion copy says the CSV is prepared and asks the user to check their
downloads rather than claiming a filesystem save was verified.

Seventeen added DOM cases cover invalid/oversized CSVs, normalized rows/scope,
confirmation/expiry, immediate duplicate prevention, grant changes, stable-key
retry, server success, exports, offline input and private lifecycle. They include
two axe structural audits spanning export and reviewed import controls. Contrast
is disabled only because JSDOM does not render; browser contrast, screen-reader
and supported-device certification remain separate.

All 886 tests/126 files pass. Strict types pass; lint stays 0 errors/25 warnings.
Global coverage remains below 70% at 39.03% lines/37.32% branches; all 17 critical
branch gates pass. Production build, public/offline byte budgets and the secret
scan pass. The actual local transfer suite passes 22 checks, including session-
bound reviews, atomic/idempotent import, private/filter/scoped/formula-safe export,
revocation and audit minimization. No new database migration was required.

Live Chrome verifies private export unchecked, parsed-result focus, selected team
scope, real server review heading focus and confirmation locked with empty fields.
At 375 px the dialog fits and scrolls; visible input/select/textarea controls fit
and are at least 44 px high. Browser input initially timed out during concurrent
validation, then worked after the build completed; these failed attempts are not
counted as UI proof. No browser import was committed, CSV file uploaded/downloaded,
or real provider contacted. The fictional browser draft was discarded, account
signed out, tab closed and viewport reset. The script archived only its owned
fixture records/teams/account, removed its ignored mode-0600 review ledger and
retained hashed review history. Browser credential bindings were cleared.

Evidence: `../phase0/local-member-transfer.json`,
`../phase0/member-transfer-browser-observations.json`,
`../ui-review/member-import-review-recovery.png`. Controlled failures/reconnect cases
are DOM tests; real browser file-save/outage/manual accessibility and hosted
acceptance remain open. The catalog now has 123 unverified logical cases.
