# First-party linked-form recovery — November 6, 2026

Migration 129 adds session-bound authorized published-form inventories, immutable
link generation checks and monotonic revisions, and atomic original-request
receipts for event/team/campaign link saves and removals. Source edit authority is
checked before receipt inspection. An accepted old removal cannot delete a later
recreated link. New saves compare the reviewed form draft revision and immutable
publication ID; current target eligibility is checked before version comparisons.
The existing five-slot, team/action/access and campaign-draft rules remain.
Explicit service-only grants accompany the functions.

Recovery is read-only and returns minimal source/reference/target metadata and
receipts, without private definitions, answers, titles or respondent capabilities.
Receipts bind actor/session/source/slot/action/generation/body/key and expire after
48 hours. The UI uses a 47-hour retry fence and preserves the exact original body
and key. Accepted reconciliation does not mutate again. Unaccepted retries require
an explicit fresh inspection and matching source/target versions. A second loss
requires another inspection; reconnect never submits automatically.

The linked-form child has independent source, paged/searchable candidate and
selected-target reads, retained authorized snapshots, named loading/retry states,
consequence reviews and protected navigation/dialog exits. Current denial clears
private child and parent state. Offline pauses writes and requires an explicit
access recheck. Temporary read failure preserves the proposal. A successful empty
selected-target read hides cached target title/URL and selection text even when
older source/candidate snapshots retain them; that mask persists through a later
failed recheck. The source's permitted manual link label remains visible. A new
valid selected-target read restores eligible selection metadata. View-only event
readers can inspect restricted references without candidate or write access.

Verified locally:

- Both complete 129-migration SQL suites pass: 232/233 checks, including both
  100-client capacity races. Six isolated restore checks pass. Migration applied
  locally without reset or historical rewrites. Fixtures cover all three source
  kinds, 105-form complete inventories, current authorization, source generation,
  reviewed publication/draft changes, receipt expiry/action/session/hash binding
  and service-only privileges. An initial fixture used a data-modifying CTE whose
  new rows were invisible to its main update; corrected to separate statements,
  verified in its owned scratch and removed. No product guard was weakened.
- All 76 focused client/route/schema cases pass, including independent read
  failures, exact before/after-loss retries for all operations, stale generations,
  current-target changes, denial, second loss, offline/session cancellation,
  read-only sources and cached unavailable-target concealment.
- All 48 actual API/DB/desktop-mobile recovery checks pass. Ten identical concurrent
  saves create one link generation/revision. An accepted old removal preserves a
  recreated record and a new stale removal conflicts. All 15 existing integration
  API checks also pass across event/team/campaign references and public CTAs.
  Fresh fictional private publications/draft sources/accounts only; no responses,
  mail jobs/workers/provider sends/existing chapter or production changes. Owned
  sources/forms archived, accounts disabled and sessions revoked. Cleanup recorded.
- An initial production-browser audit found a test's denied-parent heading was
  incorrect and a hovered forms pager had 4.45:1 contrast. The assertion now checks
  the actual concealed-parent state; a narrowly scoped dialog coral token uses the
  existing admin value and meets contrast. The interrupted initial report remains
  incomplete and distinguishes unexecuted cases from approved skips. No timeout,
  quota or coverage gate changed. Desktop/mobile live captures inspected; captures
  remain unapproved. Final full-tree/browser evidence is in the current tracker.

Respondent/runtime/file/image child recovery, global coverage and complete
storage/device/manual/visual/hosted acceptance remain open. SSO/Google and
Bevy/Engage stay deferred. This checkpoint is local evidence, not full PRD sign-off.

All 144 final production-browser cases pass across six profiles with no skips.
Build/types/lint (zero errors/25 existing warnings), byte budgets, secrets and
traceability pass. All 2,317 tests/195 files pass, including all 21 critical 90%
branch gates. Global coverage still fails: 70.40% lines, 70.44% branches, 68.84%
statements and 61.57% functions. The 159 logical acceptance cases stay unverified.
