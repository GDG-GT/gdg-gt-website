# Atomic CMS and collection retries — October 27, 2026

CMS and public-content collection mutation endpoints now require an
`Idempotency-Key`. Their clients retain the key for unchanged uncertain saves and
visibility operations, change it when the intended content changes, and clear it
after an accepted operation. CMS preserves input and permits explicit retry with
the same key. It no longer needs the earlier uncertain-result retry block.

Forward migration `202610270110_curated_content_retries.sql` adds a service-only
transaction around the established CMS/collection mutations. It checks a live
unlocked account/session, current read/action grants, current owning-team scope
and any destination-team create grant before replay. Actor-bound keys serialize
competing requests; changed validated intent conflicts. A created/duplicated
result that moved to an inaccessible team is not disclosed by a cached replay.
Receipts use the existing private, bounded retry store. Raw keys are hashed, and
the server derives actor/session and request fingerprints. Browser roles cannot
execute the function. Existing migrations/grants were not rewritten.

Create, update, publish, unpublish, recoverable archive/restore and collection
duplicate operations use the transaction. The API keeps its existing record
response. Missing/malformed keys and client identity injection are rejected.
Local HTTP fixtures generate keys only for these newly requiring endpoints; a
deliberate null key exercises the missing-header rejection.

Seven route tests and two collection interaction tests supplement the 22 CMS
cases. All 1,151 tests in 141 files pass. Global coverage remains below 70% at
58.01% lines/56.40% branches/56.43% statements/48.25% functions; all 17 critical
branch gates pass. Types, lint (zero errors/25 existing warnings), build, entry
budgets and secret scan pass. No thresholds/inclusions were relaxed.

Both isolated SQL runs apply all 110 migrations and pass their complete checks
(195 current-default / 196 legacy-grant checks), including last-seat/last-response
100-client races. The new SQL cases verify replay, revision/audit uniqueness,
changed-intent conflict, action/session revocation, moved-result concealment and
explicit browser/service grants. All six isolated backup/restore checks pass.
Migration 110 is applied only to the dedicated local stack.

Eighteen actual CMS/collection recovery checks pass. Ten simultaneous identical
CMS creates produce one record and one audit entry; update/archive replay does
not increment revision again. Twenty-three broader collection checks also pass.
Generated drafts are recoverably archived and their fictional officer's sessions
revoked. No quota/job reset, external provider, mail or production change occurred.
Evidence: `../phase0/local-cms-recovery.json`, `../phase0/local-content-integration.json`,
`../phase0/canonical-tests.json`, `../phase0/canonical-tests-legacy-grants.json`,
`../phase0/local-backup-restore.json`.

The catalog contains 136 unverified logical cases. Full collection editor
read/cancellation recovery, supported-device/browser interruption, screen-reader,
visual, hosted concurrency/retention and operational acceptance remain open. This
does not complete the whole PRD or authorize deployment.
