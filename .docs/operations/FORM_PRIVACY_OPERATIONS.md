# Forms retention and operational holds

Local implementation: 2026-10-21. This document covers response/draft retention
and hold controls. Separate implemented workflows are documented in
`FORM_PERMANENT_DELETION_OPERATIONS.md` and `FORM_INTEGRATION_OPERATIONS.md`;
complete cross-system privacy requirements remain open.

Responses → Retention & holds shows current form-wide policy and counters.
An individual response → Review response retention & hold shows its exact stored
deadline and any individual/form-wide hold. Form-wide and individual holds are
separate operational records, not mutable published-definition switches. A
password-confirmed review, typed HOLD reference, reason and matching revision are
required. Current read/response-review/delete grants are checked. Authorized
reviewers may add holds; only Admins and Super Admins may release existing holds.
Releasing the form-wide hold never releases separate response holds. Reasons
remain private; audit/idempotency results contain hashes/references, not reasons.

Each response stores a deadline derived from its own immutable published version
at submission: 1–365 days, default 365. Existing rows were backfilled using the
same original-version policy. Republishing does not shorten or extend historical
deadlines. Both individual deletion/redaction and scheduled expiry check current
holds under the form's lock. Response actions remain unavailable in the UI until
hold status can be checked, and the server always independently enforces it.

The existing authenticated form-cleanup job expires up to 500 due, unheld responses
per batch. It erases current/historical answers, clears identity/edit/capability
links and encrypted delivery addresses, marks private attachments for cleanup,
and retains identifier-only response/audit tombstones. Physical storage deletion
is asynchronous and retryable; the review shows pending-file counts. Current
holds are rechecked when attachment cleanup is claimed. A later hold cannot undo
an already authorized/in-flight storage deletion or recover erased/downloaded
content. Production needs its own supervision, job cadence/load and recovery run.

New save-and-resume drafts use the separately reviewed 1–30 day lifetime (default
7). Existing private links retain their original deadline; saving again does not
silently extend it. The runtime reports the actual stored expiry, not a fabricated
fixed seven days. Expired draft cleanup clears attached draft references safely
under the parent lock and marks abandoned files for ordinary cleanup.

Evidence: migration/test 066, two schema unit checks and
`npm run test:local-form-privacy` (20 real API/database checks). Tests cover current
password, stale revisions, independent holds, immutable original expiry after
republication, real configured draft expiry, deletion/redaction blocking, actual
retention worker erasure/retry and metadata-only audit. The worker test checks that
all due rows belong to its fictional invocation before running global cleanup;
otherwise it skips that global operation rather than erase unrelated fixtures.
`../ui-review/real-form-privacy-desktop.png` shows the live 1,001-response review.
Migration 066 is applied locally and immutable. All fixtures are fictional; no
production respondent or external service was changed.

Migration 070 also clears respondent identity copies in receipt-recipient records
and encrypted form-access outbox payloads during response redaction/deletion.
Form upload cleanup removes original filenames in the same database transaction
as its physical-purge acknowledgement, only after object deletion succeeds. Failed
acknowledgement leaves the file eligible for idempotent cleanup retry. Holds are
rechecked during claiming; a later hold cannot recall an in-flight deletion.
Canonical SQL 070 and the actual local upload harness verify these derivatives,
including real promoted-file removal and retry. The storage test supplies only its
own fictional deleted upload to the real cleanup implementation; it does not
claim another local user's files.
