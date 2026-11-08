# Community directory independent read recovery

Local verification on 2026-11-06. This covers the parent directory's reads and
their effect on existing controls; it is not full community-member mutation,
merge, visual, device or hosted acceptance.

Permissions, filtered inventory, selected private member and paged activity now
own separate keyed requests, named loading states, timestamps and explicit retry.
A successful inventory cannot hide a permissions failure. A same-key background
failure preserves its last successful snapshot and proposed editor values while
pausing dependent actions. New filters, selected records or activity pages hide
the prior context immediately; old replies cannot replace current information.
Malformed replies are refused and expose a recoverable read error. Failure on a
later inventory page retains a Previous members escape without requiring another
successful read first.

Creation, management, transfers, saves and an already-open merge review pause
while their parent access/inventory/detail is unverified. A newer saved revision
does not silently overwrite a proposed edit. Current 401/403/404 denies clear
private snapshots, proposals, proof, and child state; polling then stops until
explicit current-access recheck. Offline snapshots are timestamped and actions
remain paused after reconnect until that recheck. Account/role/session replacement
remounts private context and aborts old reads. Existing navigation review preserves
dirty input on Stay here. The explicit Manage accessible label separates the verb
from its private target name.

Evidence:

- 57 focused client/transfer/server checks pass, including 22 new directory
  behavior checks. These cover independent failure/retry, late replies, malformed
  results, revision changes, current denial, offline/reconnect, account/session
  replacement, dirty navigation and a real permitted native creation contract.
- All 24 production-browser checks pass across six Chromium/Firefox/WebKit
  desktop/mobile profiles, no skips. Populated/retained/denied states pass measured
  axe and horizontal-overflow checks. Mobile capture inspected; no approved golden
  or actual Safari/device claim. `../phase0/member-directory-reads-browser.json`.
- All 14 actual loopback HTTP/DB/native desktop-mobile checks pass. Saved row
  snapshots remain identical across outage/retry/proposed editing and declined
  navigation. No native directory mutation, unexpected egress, page error or
  overflow occurs. Owned fixture records are archived, accounts disabled and
  sessions revoked. Initial fixture used an incorrect table name; it failed before
  browser assertions and completed cleanup. Its report is retained before the
  corrected probe. `../phase0/local-member-read-recovery.json` and
  `../phase0/local-member-read-initial.json`.
- Strict types, build and lint (zero errors/25 existing warnings) pass. Current
  global coverage passes statements (70.59%), lines (72.19%) and branches (72.08%).
  Functions still fail the unchanged 70% gate at 63.58%. All 2,463 tests/202 files
  and all 21 critical 90% branch gates pass. Budgets/secrets/traceability pass;
  catalog remains 159 unverified logical cases. `../phase0/member-directory-read-quality.json`.
- The initial full run timed out during the unchanged 10-second architecture setup
  hook. Its shared helper also walked test/script retirement references. The
  architecture check now requests the identical application graph without that
  unrelated work; complete reference/retirement analysis remains the default,
  and application-only mode returns no retirement candidates. Three temporary-
  repository tests preserve both roots/static/lazy imports, opaque/missing-import
  refusal and default retirement/user-file preservation. The two actual shipped
  architecture checks and final complete run pass. No timeouts/gates were raised;
  initial report retained in `../phase0/member-directory-coverage-initial.json`.

No database migration was needed; the local applied chain remains 131. CSV
import/export and notification bulk actions remain as documented in
`../operations/MEMBER_TRANSFER_OPERATIONS.md`.

Still required: complete merge-candidate paging/scoping and selected-target read
recovery, ordinary member/merge original-outcome mutation recovery, capability
destination inventory beyond its existing 100-team ceiling, contact-inbox and
person-data privacy recovery, global coverage and full role/manual/device/visual/
hosted acceptance. No provider send, deployment, production change, purchase,
new timer or AI commit trailer. SSO/Google and Bevy/Engage remain deferred.
