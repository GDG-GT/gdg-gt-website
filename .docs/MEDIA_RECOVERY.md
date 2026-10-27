# Private media recovery — October 27, 2026

Media/gallery private state remounts on officer/account role/session changes.
Folder, bulk, metadata, publication, capability and upload operations now use
synchronous pending guards and private-context cancellation. Late results cannot
repopulate an abandoned editor or continue a quarantine upload into completion.
Existing metadata/publication/bulk/upload retry keys remain stable for unchanged
intents, and publication passwords clear at request start. Exact confirmation,
current publication/update grants, original revision and read availability are
checked in handlers as well as controls. Folder create still uses its existing
server name-uniqueness contract; no new folder idempotency claim is made.

Initial inventory reads show skeletons or an unavailable state instead of a blank
view. Changed filters clear the previous scope; temporary refresh failures retain
a timestamped authorized snapshot. Inventory and operation errors are independent.
Bulk source grants/revisions are rechecked against current rows. Current editor
props refresh without remounting its draft. Errors, saved receipts, folder and
publication headings receive semantic focus. Event-choice and destination-folder
failures have explicit retry. Offline fields remain in the open tab and never
auto-submit. User copy explains processing without worker implementation details.

Twenty-three DOM interaction cases include three axe structural audits for
metadata, publication review and private upload. The full run passes 1,027 tests
in 133 files. Global coverage is still below 70% at 51.69% lines/49.50% branches;
all 17 critical-file branch gates pass. Thresholds/inclusions were not relaxed.
Types, lint (zero errors/25 existing warnings), production build, entry budgets and
secret scan pass.

Twelve actual folder/API checks and 45 real upload/scanner/media-processing/
publication/access/retention checks pass. The broad file suite briefly pauses only
this session's upload/media workers and resumes them in finally; quotas/job state
are never reset. Six additional actual checks use one generated coral rectangle
and a fictional officer to verify intent retry, real scanning, unchanged metadata
retry and obsolete revision rejection. No personal file was imported and that
additional fixture was never publicly approved. It was recoverably archived and
the officer disabled/sessions revoked; the private ledger was removed.

Browser checks verify Stay preserves unsaved metadata, Discard opens review of
saved values, review heading receives focus, public download defaults remain
disallowed and approval stays locked without password/exact text. At 375 px the
document stays 375 px, editor controls fit and buttons have 44-pixel height. No
browser publication, upload, download or metadata save occurred. Review cancelled,
browser signed out/tab closed and viewport reset. Screenshot:
`ui-review/media-publication-review.png`; observations:
`phase0/media-recovery-browser-observations.json`.

Evidence: `phase0/local-media-core.json`, `phase0/local-media-files.json`,
`phase0/local-media-recovery.json`. The catalog now has 130 unverified logical
acceptance cases. Browser interruption/download, assistive-technology/device,
hosted storage/worker/cleanup, visual and complete coverage acceptance remain
open. The complete PRD is not finished by this checkpoint.
