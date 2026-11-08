# Forms background exports and historical review

Local implementation checkpoint: 2026-10-21. This is not a full Forms or PRD
completion, hosted acceptance, privacy certification or launch claim.

## Operator workflow

Open a form's Responses workspace. Apply filters, optionally select responses
and choose answer columns. Review export, then explicitly create CSV, XLSX or
JSON. Sensitive answers are excluded unless separately selected and authorized.
Pending and running are not download success. Ready artifacts require an explicit
Authorize download action, followed by the short-lived download link.

Jobs belong to the requesting account **and sign-in session**. Another sign-in
of the same account cannot inspect or authorize those jobs. New jobs are capped
at three concurrently pending/running and twenty per account per 24 hours.
Original idempotency-key retries do not consume another job allowance.

The response membership is frozen at creation, not inferred again from changing
filters. Only IDs, ordering and response fingerprints are retained in the
snapshot table. The worker reads current answers under current permissions.
An edit, redaction or deletion of any included response invalidates processing,
promotion or subsequent download authorization. New responses do not silently
join an existing export. A fresh export is required after source changes.

## Limits and private storage

- Up to 10,000 matching responses without date bounds; up to 20,000 with both
  start/end bounds. Selected export lists cap at 100 IDs and selected columns at
  200. Larger datasets must be partitioned by date/selection.
- Worker batches contain 100 responses. Source JSON is capped at 32 MiB,
  rectangular spreadsheet output at 200,000 cells, and artifacts at 64 MiB.
  An Excel cell above 32,767 characters is rejected instead of silently
  truncating its answer; CSV/JSON are alternatives.
- CSV escapes formula-leading values; XLSX uses literal inline string cells,
  never formulas/macros/external workbook references. JSON preserves values.
- Column headers contain the original version's label, stable field ID and
  version. Every row includes form ID, version, response ID, submission timestamp
  and completion state. File values are references, never file contents or URLs.
- The `form-exports` bucket is private, separate from public media. The API
  never proxies large artifact bytes. Lightweight legacy synchronous downloads
  are additionally capped at 3 MiB, below the serverless response ceiling.
- Artifact expiry is 24 hours after queue creation, not 24 hours after a delayed
  worker finishes. Downloads expire in 60 seconds; the UI drops links after
  55 seconds, refresh, scope change, session clear or leaving the component.
- Cancellation removes access and stops promotion but does not delete responses.
  Previously issued storage links can remain usable for up to 60 seconds.
  Already downloaded files cannot be recalled, including after redaction.

## Worker and recovery

For the existing dedicated local configuration:

```sh
node scripts/setup-local-storage.mjs
npm run jobs:form-exports -- --watch
```

This runner refuses production/non-loopback configuration. It polls a durable
database job queue; no browser or public cron trigger can execute work. A worker
claims at most five jobs per batch (one by default), owns a five-minute lease and
rechecks the current account, session and all form action/sensitive grants.
Transient failures have three bounded attempts with backoff. Stale workers cannot
promote results. Registered per-attempt artifact keys allow cleanup after a crash
without listing or deleting unrelated private objects. Ambiguous promotion
responses never trigger deletion of a potentially committed ready artifact.

Every iteration expires old jobs and deletes eligible cancelled, failed, expired
and superseded attempt objects. Active leases and live ready artifacts are not
selected. Failed object deletion remains eligible for recovery. Audit records
contain IDs, hashed filter metadata and counts, not filters or answer content.

Production still requires a supervised isolated worker, private bucket lifecycle,
monitoring, real load tests, secret/network policy and tested recovery. No hosted
queue, storage or worker has been deployed by this checkpoint.

Operational rollback is forward-only: stop the export runner and roll back the
application artifact if necessary; do not reset the database or drop retained
Forms/answers/history. Queue rows/artifacts remain private and expire normally
once the reviewed worker resumes. Keep migrations 063/064 immutable after local
application; fix defects with a forward migration. Hosted rollback/restore still
requires its own rehearsal before launch.

## Response and definition history

Individual response → Review revision history loads a metadata-only paginated
inventory. Select a revision to read answers with immutable form-version labels.
Revision 0 is the originally submitted response; later numbers match committed
edits. Historical sensitive answers require an explicit, separately audited reveal.
Redaction affects retained snapshots too; deleted responses return no history.
There is no historical restore/write action and no token/identity/session DTO.
Historical attachment entries are references; only currently authorized response
file controls may issue a download.

Builder → Version history exposes read-only published questions, descriptions,
sections, branching, validation and settings. Compare with another immutable
version or the current draft, including unsaved draft edits. Stable IDs distinguish
renaming from field replacement. Inspection never changes the draft. Long version
dialogs have bounded height and native scrolling, including mobile.

## Verification and traceability

- FORM-TEST-031 → FORM-020/024/029: `database/tests/063_*`,
  `tests/server/form-exports.test.mjs`, `scripts/test-local-form-exports.mjs`.
  Twenty-eight actual HTTP/storage/worker checks include a 1,001-response fixture,
  all formats, formulas, masking, same-account session substitution, cancellation,
  real editing and redaction. Load fixture rows are inserted only into an
  invocation-owned fictional form; they are not a public submission load claim.
- FORM-TEST-032 → FORM-015/019/024/029: `database/tests/064_*`,
  `scripts/test-local-form-history.mjs`: fifteen real checks for two edits,
  three revisions, original labels after republication, masking, explicit reveal,
  substitution, redaction, deletion and metadata-only audits.
- FORM-TEST-033 → FORM-010/019: `src/ui/forms/history.test.ts`, builder/browser
  read-only version inspection and comparison. These are local evidence, not
  signed-off visual baselines or complete launch test-ID coverage.
- Browser evidence: `../ui-review/real-form-export-*.png`,
  `real-form-history-*.png`, `real-form-versions-*.png`. A real 1,001-row export
  reached ready via the UI, authorization produced a download link, refresh
  cleared it; mobile document width stayed 375 px. Version dialog native scroll
  moved 333 px after the bounded-height correction.

Fixtures are fictional and forms are recoverably archived; private test exports
are cancelled by the HTTP harness. A browser-created test export expires normally.
No real respondent, file, provider send or external publication was used.
