# Permanent Forms deletion

Migration 072 implements the separate, irreversible Super Admin operation required
by FORM-002/025. Ordinary deletion continues to archive. In Forms, choose an
archived form’s actions → Review permanent deletion. Only a current Super Admin
can inspect the review or commit it; both HTTP and database enforce this.

The review displays retention, holds, active references, drafts, versions, pending
files and exports. The form must be archived, no operational hold may apply, no
live response may remain within its original retention period, and no active
event/team/draft-or-scheduled campaign may reference it. Explicitly deleted
response tombstones do not extend retention of already erased content. There is
no “force” or waiver flag. Resolve references or holds through their own reviewed
workflows; permanent deletion never releases a hold.

An eligible form gets a five-minute, single-use, session-bound review capability.
Commit requires a matching revision/current eligibility snapshot, the current
password, `DELETE FORM <form UUID>`, and acknowledgement to export anything needed
first. Retry uses the same idempotency key; authorization is checked again before
returning a prior result. Changed holds/references/counters require a new review.
No automatic backup is made.

The transaction erases draft and immutable-version definitions, current and
historical answers, incomplete drafts, private saved views, identity and encrypted
delivery copies. It cancels/fences exports and pending mail/scan jobs, revokes
access/edit capabilities and removes collaborators. Published-version erasure is
permitted only for the exact validated purge transaction, only for the definition
column; identifiers, hashes, publication/audit metadata cannot be rewritten. The
form/version/response IDs remain as audit tombstones and its old slug remains
reserved. Normal restore and all form review APIs deny purged content, including
to Super Admins.

Physical file/export deletion is asynchronous through existing retryable cleanup
workers. Review/result counters explicitly distinguish pending bytes from erased
database content. Previously downloaded copies, short-lived links already issued
or a provider request already in flight cannot be recalled. Backups need the
separate production retention policy; local tests are not hosted erasure proof.

Evidence: canonical SQL 072 covers role/session/password, archive/retention/hold/
reference blockers, cross-session capability, changed-state review, one-time audit,
retry, protected published metadata and restoration denial. `npm run
test:local-form-deletion` passes 19 actual HTTP/database checks using only its own
fictional form, responses and accounts. No real chapter form was purged. Schema
unit tests and existing Forms/delivery/privacy/upload regression suites pass.
Hosted security/accessibility/retention acceptance remains open.
