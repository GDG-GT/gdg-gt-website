# Permanent form deletion recovery — November 6, 2026

Migrations 126–127 add a read-only original-outcome inspector around the existing
atomic purge transaction. The inspector requires the original current Super Admin
session, form/review identifiers, request key and an unexpired receipt. It returns
only identifiers/revisions, review expiry, retry eligibility and a minimal deletion
receipt. It can acknowledge an accepted purge after normal form APIs conceal the
erased content. Unaccepted inspection requires the original session-bound review,
its exact eligibility snapshot and the unchanged five-minute expiry/hold/retention/
reference gates. A changed or expired review cannot authorize another erasure.

Accepted POST replays still verify current password/account/session authority and
the original request hash. Migration 127 explicitly preserves mandatory mutation
hash validation before an accepted receipt; only the read-only inspector may omit
the body hash. The original definition/answer erasure, immutable purge certificate,
cleanup invalidation, single audit and typed export acknowledgement remain intact.
Historical receipts receive their one consumed review identifier during migration,
without retaining proof or repeating deletion. All functions have explicit
service-only grants; the original erasure implementation remains a service-only
internal dependency, including its necessary definer permissions.

The UI now owns independent retained eligibility reads, clear loading/error/retry
states, current-role/form/session scopes and denial clearing. Temporary failures
retain review choices while pausing dependent confirmation. Offline clears password
proof and requires an explicit fresh eligibility read on reconnect. Five-minute
expiry and changed state pause deletion; final dispatch checks expiry again.
Wrong password remains a known proof failure. An uncertain non-destructive review
capability request cannot dispatch deletion and requires a fresh eligibility read
before another explicit review request.

An irreversible request freezes only its original form/review/revision/capability,
typed reference, export acknowledgement and key in the open tab. Passwords are
excluded and cleared on each attempt. Unknown results pause new work. Read-only
accepted reconciliation sends no second POST. Unaccepted identical retry requires
current inspection, the original still-unexpired review and newly entered proof.
Second loss requires another check. Session/account/form changes cancel obsolete
work; denial removes counters/title/review/proof/intent. Navigation and dialog
Escape/outside/close guards protect pending and uncertain work. Reviewed stopping
clears the old capability and requests fresh eligibility; no replacement review
or deletion runs automatically. Accepted receipts can be checked for up to the
bounded 47-hour client window even after the short review expires.

Verified locally:

- Both complete 127-migration SQL suites pass: 228/229 checks including both
  100-client capacity races. All six isolated backup/restore checks pass.
  Migrations applied forward to the dedicated local stack without reset or
  rewriting an applied migration. Current session/role/proof, wrong-review/body,
  changed snapshot, expired review/receipt, purged-content concealment, one audit,
  omitted mutation hash and explicit function privileges are checked.
- Forty-eight focused route/client/schema cases pass: known proof failures,
  both loss positions, immutable retry bodies/keys, fresh proof, second loss,
  denial clearing, independent eligibility failures, malformed results, review
  capability failure, hold/expiry/dispatch fences, offline pending cancellation,
  account/form/session replacement and reviewed stopping.
- Thirty actual loopback API/DB/desktop-mobile checks pass. Four new owned private
  drafts are archived then purged through reviewed UI, one erasure/audit each.
  Lost acceptance reconciles read-only; unaccepted loss retries the identical
  request with fresh proof. Tombstone revisions/definitions and normal-route
  concealment are verified. Another session of the same Super Admin and an
  ordinary Admin cannot inspect the original receipt. Populated axe passes;
  mobile recovery inspected. No capability/body/key/proof is retained in reports.
- The initial live probe successfully reconciled/purged its first owned form then
  incorrectly expected a different session of the same actor to read its receipt.
  The expected 404 demonstrated the session fence. The corrected probe uses the
  original browser session and explicitly asserts the other-session refusal.
  Initial failure/cleanup report is preserved; no authority boundary was weakened.
- Fresh fictional records only: no publications, responses, files, exports,
  delivery jobs/workers/provider sends/existing chapter or production changes.
  Owned unpurged drafts are archived, accounts disabled and sessions revoked.
  Physical file/export erasure is not claimed by a fixture containing no bytes.
  Captures remain unapproved candidates. Full-tree/browser results are in the
  newest implementation tracker.

Private invitation/link lifecycle, first-party integration and respondent/runtime
recovery, global coverage and full storage/device/manual/visual/hosted acceptance
remain open. SSO/Google and Bevy/Engage remain deferred. This is local recovery
implementation evidence, not complete Forms or PRD acceptance.

All 84 deletion/library production-browser cases and 30 final deletion cases pass
across six profiles. Build/types/lint (zero errors/25 existing warnings), byte
budgets, secrets and traceability pass. All 2,187 tests/191 files pass, with all
19 critical 90% branch gates passing. Global coverage remains below 70%: 69.62%
lines, 69.32% branches, 67.93% statements and 60.64% functions. No threshold/timeout
changed. Catalog remains 159 unverified cases.
