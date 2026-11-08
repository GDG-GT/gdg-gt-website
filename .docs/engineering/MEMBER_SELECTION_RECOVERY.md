# Member selection and destination recovery

Local verification on 2026-11-06. This is not full member/merge mutation, manual,
real-device, approved-visual, hosted or PRD-completion acceptance.

Migration 132 is applied locally. Both full SQL chains pass (238/239 checks),
both 100-client capacity races and six isolated restore checks pass. Do not edit
applied migration 132; SQL corrections require a new forward migration.

The new current-session service-only readers bind merge candidates and selected
targets to the current source owning scope. Eligibility is filtered before
30-row paging, with query/count/source revision metadata. A selected target has
an independent source-bound lookup, including off-page selection. SQL tests
cover 65 eligible candidates behind 40 other-scope records, inactive/archive
exclusion, later-page search, changed target scope, unprivileged/revoked sessions
and explicit browser/service grants.

Creation destinations now use current-session permitted-team paging (100 rows),
and the capability API assembles the complete inventory rather than silently
stopping at 100. It refuses changing/duplicate/short/malformed snapshots and an
explicit 10,000-destination response bound without returning a partial list.
SQL covers 107 destinations; server tests cover 107-page assembly and failures.
Candidate/target reads are audited without names, contacts or query strings.

The picker now has independent private read recovery, dated retained snapshots,
scope/version guards, complete paging, explicit reconnect/current access recheck,
generic off-page selection and private denial clearing. Parent source/owning-team
change remounts its private context. Current review must be discarded explicitly
before changing candidates. Closing remains available through the parent draft
guard. Comparison is a named keyboard-focusable scrolling region and receives
focus after review preparation. Mutation unknown-outcome recovery is still separate
pending work and must not be described as complete by this read checkpoint.

Current evidence: all 85 focused member/transfer/server/client cases pass,
including 15 new picker cases and 24 member server checks. All 42 populated
production-browser picker/parent-regression cases pass across six profiles, no
skips. Measured axe/overflow pass, mobile comparison capture inspected; no
approved visual or actual Safari/device claim.

The actual owned probe passes 14 API/DB/native desktop-mobile checks: all 105
fixture destinations, three pages of 65 eligible targets despite 40 other-scope
records, later-page search, independent off-page target, current read recovery,
keyboard comparison, retained review on outage and declined navigation. Exactly
two private review preparations are audited; no merge is performed. A deliberate
owned target move is denied by the source-bound lookup. Native records remain
unchanged throughout reads/reviews. Fixture records/teams are archived and the
account disabled/sessions revoked; private reviews/audits are retained, not
claimed physically erased. No provider send, deployment, production change,
purchase, new timer or AI commit trailer. Evidence:
`../phase0/local-member-selection.json` and
`../phase0/member-selection-final-browser.json`.

Strict types, production build, lint (zero errors/25 existing warnings), byte
budgets and current/history secret scanning pass. SQL reports are updated and
retained. All 2,491 tests/203 files pass; all 21 critical 90% branch gates pass.
Global coverage passes lines (72.48%), branches (72.40%) and statements (70.87%);
functions still fail the unchanged 70% gate at 63.80%. The catalog remains 159
unverified logical cases. See `../phase0/member-selection-quality.json`. No applied
SQL edit is authorized; corrections must be forward migrations.

All checkpoint checks are recorded. Next work remains
ordinary member/merge mutation recovery, contact inbox, person-data privacy,
global coverage and complete role/manual/device/visual/hosted acceptance.
