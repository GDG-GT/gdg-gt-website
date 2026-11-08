# Respondent file original-outcome recovery — November 6, 2026

Migration 130 adds service-only, current-form/version/field/proof and original
file-body/key-bound upload preparation. Current internal session/team or private
access is checked before accepted receipt inspection. Preparation holds the form
quota lock and returns the original ID/object on repeated identical requests.
Read-only inspection never allocates an upload, signs a URL or starts scanning.
Expired/removed preparations cannot be silently recreated. The ordinary upload
API remains for existing clients; the native respondent now uses `/prepare` and
`/recovery` with an explicit original key. Existing complete/status/remove guards,
private buckets, exact MIME/size/checksum and scanner association remain.

The respondent child now cancels reads/transfers/poll delays across field/form/
version/proof/session changes and unmount. It keeps original metadata, bytes and
key only in memory while an outcome is unknown, pauses new uploads/submission,
requires explicit inspection before continuing, and invalidates inspection after
another loss or reconnect. Direct retries use the original persisted quarantine
object. Completion/scan recovery cannot attach a file until current clean status.
Removal loss requires a read before an explicit repeated removal. Unavailable
upload references are distinguished from current form-access denial; denial
clears private child/parent data. Rejected/expired files are excluded from answers.
Restored attachment reads have separate retry/errors and cannot falsely show
readiness. Multi-file batches retain all accepted IDs. Reviewed stopping excludes
an uncertain file and makes no physical deletion claim. Final submission still
validates every file transactionally on the server.

Parent respondent context now clears identity/answers/capabilities and aborts
obsolete work on session changes; preview/live contexts are distinct. All form
answer drafts participate in private navigation guards. Internal upload transport
uses the authenticated API epoch/binding. Optional copies remain unchanged:
exact own answers only to the entered address, without file bytes/private links.

Verified so far: both complete 130-migration SQL chains (234/235 checks), both
100-client capacity races and all six isolated restore checks pass; migration 130
is applied locally. All 84 focused route/file-client/respondent cases pass. All
42 final production-browser file recovery cases pass across six profiles. Initial
interrupted matrix found a real 4.17:1 progress-label contrast issue; a second
matrix passed 38 cases and found four WebKit disabled save/resume contrast cases.
Progress text and explicit disabled save/resume colors now retain legibility;
all reports are retained, interrupted cases are not approved skips. Final production browser verification also passes 54 upload/image-picker cases
after a small original-outcome status-copy improvement. All nine scanner ownership/
resource/pinned-image/update guard tests pass. The latest full-tree/coverage result
is recorded in the main tracker.

The first actual fixture reached one accepted preparation then storage returned
404. Read-only inspection found no local buckets. Its async route exception
ended the fixture before finally; verified follow-up removed the pending owned
reference, archived its private form and disabled/revoked both owned accounts.
The failure/cleanup report is retained; later route exceptions now abort safely
and permit normal cleanup. No final response or provider job was created.

Local prerequisites were repaired: native ClamAV 1.5.4_1 links OpenSSL 4,
matching the upstream incompatibility described in
[ClamAV issue 1887](https://github.com/Cisco-Talos/clamav/issues/1887). Native update
load testing fails with the existing valid trust anchor; neither certificate nor
signature testing was disabled. The project scanner now defaults to the official
pinned ClamAV 1.5.4 image in the dedicated Colima context, an owned persistent
signature volume, resource caps and loopback-only port 13310. Linux amd64 is
explicit because this upstream image lacks an arm64 manifest. Native remains an
explicit `GDG_SCANNER_RUNTIME=native` option. Startup/update verifies image-native
signatures and requires current scanner health. See the official
[container documentation](https://docs.clamav.net/manual/Installing/Docker.html).
The scanner is ready with signature version 28175. Six absent local buckets were
initialized privately. All 40 actual API/DB/desktop-mobile checks pass, including
all five preparation/transfer/completion loss positions, exact bytes/body/key,
one clean file/one completed scanner job, ten simultaneous identical preparations
creating one upload per viewport, minimal inspection, no final responses/mail
jobs/provider sends/unexpected egress/errors/page overflow. Only owned generated
harmless text was transferred and scanned; exact owned objects were deleted and
references removed, private forms archived/accounts disabled/sessions revoked.
The cleanup report is complete. The new scanner independently passes current
health, clean text and in-memory EICAR rejection checks. Desktop/mobile recovery
captures were inspected and remain unapproved review candidates. No signature,
certificate, quota, timeout or test threshold was bypassed.

Respondent final submission/edit/save-and-resume original-outcome recovery,
remaining global statement/function coverage, full storage/device/manual/visual/
hosted acceptance and launch approval remain open. This is local implementation
evidence and prerequisite repair, not full PRD completion.

All 2,389 tests/198 files pass; all 21 critical 90% branch gates pass. Global
coverage remains below the unchanged 70% gate: 70.98% lines, 70.90% branches,
69.44% statements and 62.40% functions. Build/types/lint (zero errors/25 existing
warnings), byte budgets, secrets and traceability pass. The 159 logical full
acceptance cases remain unverified. No threshold, quota or timeout was relaxed.
