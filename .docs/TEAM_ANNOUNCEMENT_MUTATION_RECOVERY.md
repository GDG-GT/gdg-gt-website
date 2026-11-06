# Team announcement mutation recovery — November 5, 2026

Migration 116 adds actor-bound atomic receipts for draft creation/editing,
publication/unpublication, pinning, archival/restoration and read acknowledgement.
Current account/session, team action and record authority are checked before
replay; stale new writes remain conflicts. Receipts retain only the post ID and
return current metadata. Publication replay creates one audience snapshot,
publication version and metadata-only notification job.

Lifecycle actions require the exact current title in both UI and server/SQL
validation. Saving changes to a published post reviews the original/proposed
content and settings, names its return to private draft and requires the original
title. Private draft saves and low-impact pin/read actions retain direct controls.
Scoped pending guards freeze inputs; session/team replacement fences late writes.
Receipt/access/review focus recovery, draft navigation and filtered-empty reset
are included. Named stale drafts remain visible until closing is reviewed.

An uncertain result retains immutable intent and its key for at most 47 hours.
Exact current-record or title-filtered private reads precede an explicit identical
retry. Filtering happens before pagination, without a fetched-page lookup ceiling.
Rechecking never changes a post or queues a notification. Failed rechecks keep
retry disabled; access denial clears private content and retained operations.
Abandoning recovery requires a consequence review and recalls no accepted change
or notification. Archive replay works after its row leaves the current view.

All 41 new client/server cases pass; with existing read/pause/schema regressions,
all 72 focused cases pass. All 34 actual loopback API/DB and desktop/mobile
Chromium checks pass: ten concurrent creates/publications, accepted-but-lost
published edits/publications/archives and exact immutable retry. Each accepted
mutation increments once and each intended publication queues once. Populated
long-content review axe, focus return and overflow checks pass. Mobile review was
visually inspected, then display booleans/local times and review spacing refined.

Sender/scheduler preflight ran; no worker or provider send ran. Owned jobs were
marked dead/secrets cleared, post/team archived and accounts disabled/sessions
revoked. Existing chapter records and production were untouched. Evidence:
`phase0/local-team-announcement-mutation-recovery.json`. The probe's cleanup also
discovers posts by its owned team if interruption leaves the created ID uncertain.

The complete 116-migration SQL suites pass under explicit API grants and legacy
automatic grants, including both 100-client races. All six isolated restore
checks pass. Full supported-role/device/manual/visual/notification-provider/
hosted acceptance remains open; these checks do not complete Teams or the PRD.

All 1,511 tests/165 files pass. Full-tree coverage remains below 70%: 64.29% lines,
64.32% branches, 62.59% statements and 55.68% functions; all 17 critical-file
branch gates pass. The SQL suites contain 207/208 passing checks. Catalog: 155
unverified logical acceptance cases.

Types/lint (zero errors/25 warnings), completed production build, byte budgets,
secret scan and traceability pass. All 84 targeted production-build announcement/
invitation/team-review/child-read/shared-workspace browser checks pass across six
pinned profiles, including 190-character unbroken titles and long content,
contained reviews, keyboard reachability, focus recovery and measured axe.
Evidence: `phase0/team-announcement-recovery-workspace-browser.json`. A final
sequential full coverage run after wrapping refinements passed all 1,511 tests
with the same measurements above. Captures remain unapproved candidates.
