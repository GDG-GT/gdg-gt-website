# Atomic background export recovery — November 6, 2026

Migration 120 adds current-session/current-form/current-sensitive-authority export
creation/removal receipts and read-only outcome inspection. Receipts retain only
identifiers/action. Original request fingerprints reject changed intent; accepted
replay returns the currently authorized job without creating another export or
cancellation audit. Existing frozen-source, quota, worker lease/promotion,
spreadsheet safety and signing checks remain in place. Cancellation follows the
worker's job-before-form lock order. Functions are service-only with explicit
grants, including under legacy Supabase automatic-grant defaults.

Creation/removal routes require explicit keys. The browser freezes the original
body/key and keeps unconfirmed changes separate from current selection/filter
choices. Lost accepted responses reconcile read-only. Unaccepted changes need a
current inspection and explicit identical retry; a second lost retry requires
another check. A 47-hour bound, offline cancellation, denied-state clearing,
malformed-result rejection and reviewed abandonment prevent silent replacement.
Review/uncertain state participates in navigation protection. Accepted jobs that
later expire or are cancelled remain their original result rather than triggering
a replacement. Initial known validation failures keep the review editable.

Export inventory has independent timestamped matching snapshots and explicit
recovery; an initial failure differs from empty jobs. Transient failure stops
polling and pauses changes; denial clears private jobs/reviews/links until an
explicit access retry. Account/role/form/sensitive-capability/session changes
cancel obsolete work. Reconnection does not issue a write and requires inventory
rechecking. Jobs poll only while pending/running and current reads are healthy.

Download authorization remains explicit, and links use the shared private URL/TTL
validator with response attachments. Scope changes hide links synchronously and
cancel delayed authorizations. Expiry is bounded from request start and checked
again at activation, with no-referrer/noopener new-tab downloads. Background expiry
does not move keyboard focus. No private key, filter, receipt or download URL is
written to browser persistent storage.

Verification so far:

- Both complete 120-migration SQL suites pass (215/216 checks), including both
  100-client capacity races. All six isolated backup/restore checks pass.
  Migration applied to the dedicated local database without a reset.
- All 164 focused tests across seven files pass: 33 new client cases, 26 new route
  cases, six existing export/worker checks and 99 existing Forms regressions.
- All 38 actual loopback API/DB/desktop-mobile checks pass:
  `../phase0/local-form-export-write-recovery.json`. Ten concurrent identical creates
  and removals have one job/audit per action. Both response-loss positions for
  creation/removal preserve original keys/bodies, retained inventory, denial
  clearing and measured populated axe. The mobile uncertainty view was inspected.
- Three fresh fictional private draft forms, five intended empty export jobs,
  zero publications/responses. Jobs cancelled/forms archived/accounts disabled/
  sessions revoked. No export worker, generated/downloaded file, provider send,
  existing chapter or production change. Captures are unapproved candidates.
  The completed first probe covered 34 checks; the final probe strengthened
  post-confirmation identical-body assertions and concurrent replay (38 checks).

Production-browser and full-tree verification are recorded separately. Complete
physical export/storage/CORS/device/manual/visual/hosted acceptance remains open.
Response availability/destructive/saved-view mutations and proposal/navigation,
Forms access/settings/deletion/integrations/runtime and full quality/coverage/
role/device/manual/hosted acceptance also remain open. This checkpoint does not
certify the complete Forms or website PRD.

Build/types/lint (zero errors/25 existing warnings), public byte budgets, secret
scan and traceability pass. All 102 export/response/shared-workspace production-
browser cases pass across six profiles:
`../phase0/form-export-recovery-workspace-browser.json`. All 1,820 tests/178 files
pass. Global coverage still fails 70%: 67.17% lines, 66.87% branches, 65.47%
statements and 58.47% functions. All 17 critical branch gates pass; no timeout or
threshold changed. Catalog stays 159 unverified cases.
