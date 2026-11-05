# Form access inventories and review recovery — November 4, 2026

Candidate search and both candidate/collaborator inventories now count and page
inside PostgreSQL. Team scope is an `EXISTS` predicate rather than a fetched
membership list, so neither the former 100-account limit nor the Data API's
membership row ceiling truncates eligible choices. Display-name search is literal
and case-insensitive, with stable display-name/ID ordering. Owner, inactive,
deleted and Blog Editor candidates are excluded. Active team membership applies
before pagination; eligible chapter administrators remain available. Private
collaborator rows include safe display labels and current explicit actions.

Forward migration 111 exposes the inventory only to `service_role`, with explicit
revokes for public/anonymous/authenticated callers, bounded filters and current
form/action authorization in the function itself. Stored grants can now be
removed after a recipient leaves or becomes inactive; adding/updating grants
still requires an active eligible recipient and actions the manager can grant.

Current form context, collaborators, candidates and private links load and retry
independently. Initial loading is named, transient failures retain timestamped
authorized snapshots and disable corresponding writes, and denied reads clear
all private inventories/drafts. Account, role, form and session changes remount
state, cancel requests and fence late responses. Candidate searches/pages clear
the selection and hide obsolete results. Offline input stays in the open tab;
reconnecting does not submit it. CSV reads cannot overwrite newer typed input.

Saving/removing collaborator access and replacing/revoking private links now
require consequence reviews. Reviews name the form and target, refresh current
context/record, and block changed revisions/records/grants. Pending operations
freeze controls and escape/close; a synchronous latch blocks duplicate writes.
Failures keep the review. An uncertain outcome requires a read-only inventory
recheck before another explicit decision; unchanged invitation retries retain
their original idempotency key. No request is automatically resent on reconnect
or refresh. These changes participate in the draft/navigation guard.

Fresh local evidence:

- All 1,222 tests/146 files pass. The access checkpoint adds 25 DOM cases,
  including two structural axe audits (contrast excluded in JSDOM). Types pass;
  lint remains zero errors/25 inherited warnings. Coverage still fails the PRD's
  70% global requirement: 59.29% lines, 58.30% branches, 57.80% statements,
  50.13% functions. All 17 critical-file branch gates pass. Thresholds are intact.
  Build, public/offline bundle budgets, traceability and the current-file/local-
  history secret scan pass (zero unreviewed findings).
- Full 111-migration suites pass: 197 clean-grant checks and 198 legacy-default
  checks, including both 100-client capacity races. The new transactional SQL
  case verifies 1,051 eligible members, later pages, literal search, current
  membership/action denial, private grants and removal of inactive recipients.
- All six fresh isolated backup/restore checks pass with migration 111, identical
  table fingerprints and restored security/catalog invariants. No project or
  production data was backed up or restored by that test.
- All 27 actual loopback API/DB checks pass with 109 fresh fictional accounts,
  one team and one private draft. Four pages enumerate all 105 eligible
  candidates once; search reaches account 105; unrelated/anonymous clients and
  malformed filters reject; current actions and departed-account grant removal
  behave correctly. The form/team are archived, all fixture accounts disabled
  and sessions revoked. No publication, mail queue/provider send, quota reset or
  existing chapter account/content change occurred. See
  `phase0/local-form-access-inventory.json`.

The traceability catalog now has 141 unverified logical cases. Live-browser
geometry, keyboard/network/role interruption, contrast, supported-device,
screen-reader, visual and hosted acceptance remain open. Broader Forms builder,
runtime, delivery/privacy mutation and navigation checks remain separate work;
this is not full PRD completion or a release claim.
