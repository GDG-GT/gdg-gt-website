# Atomic form-library mutation recovery — November 6, 2026

Migration 119 adds service-only current-session/current-authority atomic receipts
for creation, duplication, archive, restore and availability. Receipts retain only
identifiers/action/revision. Original body/source/action fingerprints reject changed
intent; replay projects the current authorized result rather than stale private
content. Duplication checks the expected source revision and derives draft content
and template provenance under the same database lock, creating no response,
published-version or collaborator copies. Expired receipts fail closed.

Create/copy/archive/restore/state routes require a request key. Copy requests now
require their expected source revision; missing availability state fails validation
before business work. Existing schema, publication, media and scope checks remain
in the underlying transactions. Read-only recovery checks current session, source,
destination and target permissions before returning a receipt or readiness state.

The library freezes a normalized original request/key/revision, latches pending
work, cancels transport on context replacement and converts offline interruption
into explicit uncertainty. Accepted response loss reconciles without another
mutation. Unaccepted requests need current read-only inspection and an explicit
identical retry, bounded to 47 hours. A second lost retry response requires another
check. Denial clears private state; malformed saved results cannot be acknowledged.
New writes stay paused until reconciliation or reviewed abandonment. Abandonment
does not undo an accepted action and never sends a replacement automatically.

Duplicate now has a separate source/revision/scope/consequence review. Availability
reviews keep optimistic revision/capability checks. Pending create/review controls,
escape/outside dismissal, filters and duplicate activation are frozen. Creation
validation errors remain associated with editable retained input. Navigation guards
cover uncertain template creation as well as typed drafts. Confirmed creation alone
authorizes navigation to its new editor. Copy slugs are bounded to the URL limit.

Verification so far:

- Both complete 119-migration SQL suites pass (213/214 checks), including both
  100-client races. Six isolated restore checks pass. Migration applied locally.
- All 66 focused client/server cases in the mutation/availability subset pass:
  33 new client and 22 new route cases, plus 11 existing availability cases.
- All 140 focused cases across eight files pass when read, editor-permission,
  authoring and existing server route regressions are included.
- All 58 actual loopback API/DB/Chromium desktop-mobile checks pass:
  ten identical concurrent creates/copies; before/after-acceptance create, copy,
  archive, restore, close/reopen; exact key/body retries, single result/audit,
  measured populated axe and one intended internal publication per source.
  Evidence: `phase0/local-form-library-write-recovery.json`. Inventory reads are
  constrained to owned fixture-marker rows. Created/copied forms stay private
  drafts; two source publications use internal access. Fixtures archived/accounts
  disabled/sessions revoked. No responses, workers/provider sends, existing
  chapter or production change. Captures are ignored/unapproved.

Build, strict types, lint (zero errors/25 existing warnings), entry byte budgets,
secret scan and traceability pass. All 114 production-build library write/read and
shared-workspace cases pass across six profiles:
`phase0/form-library-write-workspace-browser.json`. Every create/copy/archive/
restore/availability path covers both response-loss positions. This does not
certify real Safari/devices, human visual approval, manual AT or hosted behavior.

All 1,681 tests/173 files pass. Full-tree coverage still fails the 70% gate:
65.76% lines, 65.48% branches, 63.91% statements and 56.82% functions. All 17
critical branch gates pass. No timeout/threshold changed. Catalog remains 159
unverified logical cases; the existing atomic Forms case includes these additional
library routes rather than inventing requirement acceptance.

Remaining Forms child/access/settings/deletion, response/integration/runtime
recovery and full role/device/manual/visual/hosted acceptance remain open. Source
review confirms collaborator and private-link lifecycle writes still need atomic
replay/concurrent-record protection; delivery/retention/deletion panels also need
complete private denial and uncertain-outcome recovery. Their earlier feature/
read/consequence checkpoints do not close these remaining workflow checks.
One confirmed runtime detail still needs correction:
archived builder views can retain editable-looking action grants even though the
database rejects draft/publication writes. This checkpoint does not certify the
complete Forms or website PRD.
