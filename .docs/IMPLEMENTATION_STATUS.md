# PRD v1.5 implementation status

The full PRD is now in scope following Tejas's request on 2026-10-19. This is an
incremental implementation tracker, not a completion or launch claim.

Entries are newest first. Older dated checkpoints record their state at that
time; their pending-work and audit counts do not override the latest checkpoint.

## Current checkpoint

### Public entry, complete test catalog and acceptance verification — 2026-11-06

- All 307 mandatory test IDs now have reviewed automated references and/or
  explicit manual/hosted steps. All 146 numbered requirements remain unverified
  against full acceptance. The structural checker rejects a missing mandatory
  ID even when feature mapping still passes; four checker tests pass. This is
  traceability, not a completion percentage.
- Final complete coverage: 2,672 tests/214 files, all unchanged global 70% and
  21 critical 90%-branch gates pass. Lines 78.09%, statements 76.10%, branches
  75.59%, functions 70.75%. Nine drawer/search/composition unit cases pass within
  that run; source/cache policy cases are also included.
- Complete production-browser baseline passed 1,228 cases with eight expected
  skips and zero failures. Its 138 populated composition checks yield 162
  unapproved captures for all 22 primary prompt groups. Final rebuilt-artifact
  navigation/lazy-shell/workspace scope passes all 90 cases across six profiles.
  These are separate invocations, not one new 1,242-case run. No approved golden/
  pixel or actual Safari/device acceptance is claimed (`POPULATED_VISUAL_REVIEW.md`).
- Route-lazy admin/sign-in/public pages, canonical small availability parser,
  progressive natively inert home identity, deferred landmark focus and safe
  shell-error fallback are implemented. Unused query/toast/tooltip startup
  mounts were removed after confirming no consumers. Initial JavaScript is
  about 126 kB gzip. Existing local artwork supplies the two smaller mobile
  crops; every emulated browser now requests exactly its selected image pair.
- Isolated Lighthouse scores are 94/94/95 mobile and 100 desktop, accessibility
  100 and CLS zero. Mobile lab LCP remains about 3.0 seconds, above 2.5 seconds.
  Diagnostics and failed thresholds remain recorded; no budget was weakened
  (`PUBLIC_ENTRY_PERFORMANCE.md`). This is not field p75/INP or hardware evidence.
- Production PWA boundary checks pass 15 real CacheStorage/IndexedDB cases;
  two-tab update probe passes nine checks including a genuinely changed offline
  asset revision and removal of its old cache entry. No actual app writes/sends.
- Local HTTPS enforcement passes 45 security/header/cache checks, including
  inline-script refusal. The initial test harness refused expected browser CSP
  reports; its failure is preserved. Reports now terminate in an explicit owned
  no-op sink. Stable artwork/fonts revalidate; only hashed JS/CSS are immutable.
  Actual hosted headers/CDN behavior remains open (`PRODUCTION_HEADER_CHECKS.md`).
- Full 26-link navigation testing exposed mobile drawer focus loss and Chromium
  mobile command Escape refusal. Both are corrected, preserving destination
  focus and active text composition. All nine unit cases and the final 90-case
  rebuilt-artifact scope pass (`WORKSPACE_NAVIGATION_CHECKS.md`). Native zoom
  review was deferred while shared Chrome was in use; no zoom changes or tab
  closures were made.
- Types/build and byte gates pass, lint has zero errors/10 existing warnings,
  source/history secret scan has zero unreviewed findings. A public test-ID digest
  received an exact non-secret line review; no scanner rule/path was excluded.
  CI configuration adds three balanced browser shards of 414 cases, full-history secret scan
  and a high/critical production dependency audit. No remote CI run is claimed.
- Remaining full-PRD gates are listed in `LOCAL_ACCEPTANCE_AUDIT.md`; active
  sessions and preserve/resume instructions are in `CURRENT_CHECKPOINT.md`.
  Local-only constraints, unrelated edits and deferred integrations remain intact.

### Global coverage and active workflow completion checks — 2026-11-06

- All 2,649 tests/210 files now pass all unchanged global 70% gates and all 21
  critical branch gates. Lines 77.73%, branches 75.40%, statements 75.79%,
  functions 70.35%. No thresholds/exclusions/timeouts were weakened.
- Full import/reference audit retired 47 unreferenced tracked helpers, preserving
  all 207 shipped/228 referenced modules, both HTML entries, dynamic/offline
  imports, scripts/tests and existing untracked work. SHA-256 manifest and local
  recoverable tag `reference/shared-ui-before-retirement-20261106` preserve sources.
  The retired code contained 266 unexercised functions; denominator change is
  reported separately from 99 additional active functions exercised by new
  project, Linktree, newsletter and Forms saved-document assertions.
- New subscriber test found validation normalized an email but the editor sent
  original casing; the editor now sends its validated canonical record. All
  newsletter writes are mocked assertions; no provider sends. The initial long
  Forms workflow exceeded its unchanged five-second test limit under coverage;
  split into four independent validation/settings groups retaining every assertion.
- Build/types/lint (zero errors/10 existing warnings), budgets/secrets/traceability
  pass. Offline raw install is 463,659 bytes. See `UNUSED_HELPER_RETIREMENT.md`.
  Complete production-browser regression (1,062 cases/38 specs) is running.
  Real-worker/IndexedDB PWA probe has separate pending evidence; no full PRD,
  manual/device/approved visual/performance/hosted/institutional signoff claimed.


### Person-data privacy original review/approval recovery — 2026-11-06

- Applied migrations 136/137 add atomic exact original review/approval and read-only
  current-session reconciliation. Current Super Admin/session/capability precedes
  receipt/hash disclosure; current source fingerprints gate retry eligibility.
  Existing independent fingerprint/hold/proof enforcement and precise refusals
  remain. Review receipts store only review ID; approval receipts retain summary
  only. Accepted export inspection/replay never returns private bytes.
- UI freezes original normalized scope/review/action/count/key in memory, explicitly
  inspects before identical fresh-proof retry, fences offline/unmount/late results,
  clears current-denied/session private state and offers reviewed stopping. New
  exports wait for explicit memory-only download/clear; no automatic handoff or
  persistent raw export. Accepted lost export confirms preparation, not download.
- Both SQL chains pass (247/248), both 100-client races and six restore checks pass.
  All 60 combined focused checks, 66 production-browser cases across six profiles
  and 50 actual local API/DB/native desktop-mobile checks pass. Initial 47-check
  fixture reused rotated CSRF for its final direct probe; corrected and final full
  50 pass, with all owned cleanup verified. Contacts redacted, officer disabled/
  sessions revoked; private unused reviews expire normally, no provider/production
  effects or physical-erasure claim. Mobile populated review capture inspected,
  unapproved. See `PERSON_PRIVACY_WRITE_RECOVERY.md`.
- Initial full run hit a five-second duplicate architecture scan timeout after
  2,633 passes. Security inspection now shares each existing shipped AST once,
  preserving HTML/static/lazy/offline scope and unchanged rules/timeouts/gates.
  An isolated traversal contract verifies exact-once callbacks and non-shipped
  exclusions. Final full run: all 2,635 tests/210 files and all 21 critical branch
  gates pass. Privacy route branches: 100%. Global lines/branches/statements:
  74.25%/73.89%/72.54%; functions still fail unchanged 70% at 65.65%.
- Build/types/lint (zero errors/25 existing warnings), budgets/secrets/traceability
  pass; 160 logical cases remain unverified for complete acceptance. The previously
  confirmed member/merge/contact/privacy feature recovery gaps now have local code
  and behavior evidence. Fresh final audit, function coverage and complete role/
  manual/device/visual/performance/PWA/hosted/institutional acceptance remain.
  SSO/Google and Bevy/Engage stay deferred; no deployment, purchases, real provider
  sends, production changes, new timer or AI commit trailer.


### Member merge original review/commit recovery — 2026-11-06

- Migration 135 adds current-session/body/key-bound original preview/commit
  inspection and atomic replay. Both source/target current permissions precede
  receipt disclosure. Preview receipts retain only review ID, reconstructing
  comparison only under the original unused live review/current revisions; commit
  receipts retain only IDs/revision. Existing exact references, same scope,
  project/profile rules, five-minute review and fresh new-commit proof remain.
- UI freezes unknown original request, explicitly inspects before identical retry,
  clears all parent private state on current denial, fences offline/unmount/late
  results and requires current recheck after reviewed stopping. Accepted old replay
  preserves newer canonical edits; accepted inspection needs no retained password.
- Both SQL chains pass (244/245), both 100-client races and six restore checks pass;
  applied locally. All 105 combined focused cases pass, 54 combined browser read/
  write and 36 final nullable-field browser cases pass across six profiles. All
  53 actual local API/DB/native desktop-mobile checks pass, including ten concurrent
  identical reviews and commits. No providers/production/egress/errors/overflow.
  Initial owned fixture assertion/label failures and actual legacy-null rejection
  are retained; nullable boundary fixed with regression. Owned members archived,
  actors disabled/sessions revoked; unused private reviews expire ordinarily.
- All 2,612 tests/209 files and 21 critical branch gates pass. Global lines/branches/
  statements: 74.01%/73.63%/72.31%; functions still fail unchanged 70% at 65.44%.
  Build/types/lint (zero errors/25 existing warnings), budgets/secrets/traceability
  pass; 160 unverified logical cases. See `MEMBER_MERGE_WRITE_RECOVERY.md`.
- Person-data privacy review/commit recovery, global function coverage and full
  role/manual/device/visual/hosted acceptance remain. SSO/Google and Bevy/Engage stay
  deferred; no deployment, purchases, provider sends, production changes, timer
  or AI commit trailer.


### Contact status and retention-hold original-outcome recovery — 2026-11-06

- Applied migration 134 binds atomic status/hold writes and password-free receipt
  inspection to current actor/session/contact/body/key. Current permission and
  non-redaction precede receipt/hash disclosure. Minimal ID/revision/action
  receipts preserve newer edits on old accepted replay; new stale requests conflict.
  New hold/release retries require fresh proof; accepted inspection retains none.
- Unknown UI intent is frozen in memory with explicit inspection/identical retry,
  offline/late-result fencing, 47-hour safety window, denial/session clearing and
  reviewed stopping followed by a current-record load. Contradictory receipt/current
  revisions and wrong record/action acknowledgements are refused.
- Both SQL chains pass (242/243), both 100-client races and six restore checks pass.
  All 62 combined focused cases pass. Initial combined production-browser read/write
  run passes 60 cases; stricter run had one unexplained blank initial Chromium
  startup (35/36), retained in evidence. Diagnostic full write rerun passes 36/36
  across six profiles with unchanged gates/timeouts; cause not claimed resolved.
  All 65 actual local API/DB/native desktop-mobile checks pass, including applying/
  releasing holds, ten concurrent identical saves and current access loss. Owned
  contacts redacted, actor disabled/sessions revoked, no provider/production effects.
- All 2,591 tests/208 files and all 21 critical branch gates pass. Global coverage
  lines/branches/statements: 73.78%/73.46%/72.10%; function gate still fails at 65.25%.
  Build/types/lint (zero errors/25 existing warnings), budgets/secrets/traceability
  pass. Catalog remains 160 unverified cases. See `CONTACT_WRITE_RECOVERY.md`.
- Merge review/commit and person-data privacy review/commit recovery, function
  coverage and complete role/manual/device/visual/hosted acceptance remain open.
  SSO/Google and Bevy/Engage stay deferred; no deployment, provider sends,
  production changes, purchases, new timer or AI commit trailer.

### Ordinary member original-outcome mutation recovery — 2026-11-06

- Migration 133 adds current-session/action/scope/body/key-bound read-only receipt
  inspection and atomic ordinary member writes. Existing revision/profile/proof
  semantics remain in the underlying mutation. Current authority precedes hash/
  receipt disclosure; only ID/revision/profile ID are retained. Identical creates
  yield one record, accepted older updates preserve later edits, and new stale
  requests conflict. Inspection needs no retained password; explicit lifecycle
  retries require freshly entered proof. Receipts are bounded to the original
  sign-in session and expire under existing idempotency policy.
- The directory freezes unknown original fields/scope/revision/key in memory,
  pauses polling/changes/navigation, inspects before explicit identical retry,
  rechecks after second loss/offline, fences the 47-hour safe retry window and
  clears private state on denial/session/account/context change. Reviewed stopping
  cannot imply undo or a confirmed outcome. In-flight offline save cancellation
  preserves intent and ignores late acknowledgement. Malformed/older revision
  receipts are refused; current password rejection is separate from access loss.
- Both 133-migration chains pass (240/241 checks), both 100-client races and six
  restore checks pass; applied locally. Initial unapplied SQL missing parenthesis
  fixed before successful chains/application. Added SQL tests cover restore as
  inactive, one unpublished synchronized profile, unmerge semantics, accepted
  replay without retained proof and receipt expiry. Applied SQL is immutable.
- All 108 combined focused ordinary/read/picker/transfer/server cases pass,
  including 19 new ordinary write cases. All 48 final production-browser cases
  pass across six profiles, no skips; populated axe/overflow pass and mobile
  unknown-create capture inspected, unapproved. All 61 actual owned API/DB/native
  desktop-mobile checks pass: before/after create/update/archive losses, unchanged
  rows during inspection, exact original password-free document/key, fresh-proof
  retries, ten simultaneous identical creates, old accepted replay and new stale
  conflict. No unexpected egress/page errors/overflow/providers. Owned records
  archived, actor disabled/sessions revoked; private tombstones/audit retained.
- Build/strict types/lint (zero errors/25 existing warnings), budgets/secrets/
  traceability pass. All 2,558 tests/206 files and all 21 critical 90% branch gates
  pass. Global lines/branches/statements pass at 73.53%/73.32%/71.87%; functions
  remain below unchanged 70% at 65.04%. Catalog: 160 unverified logical cases.
  See `MEMBER_WRITE_RECOVERY.md`.
- Merge review/commit, contact status/hold and privacy review/commit original-
  outcome recovery, global function coverage and full manual/device/visual/hosted
  acceptance remain open. SSO/Google and Bevy/Engage stay deferred; no deployment,
  real provider sends, production changes, purchases, new timer or AI trailer.


### Person-data privacy cleanup-read and retained review recovery — 2026-11-06

- Cleanup metadata now has named loading/retry, dated retained snapshots and
  malformed-result refusal. A transient failure preserves requester scope and
  an exact prepared review while approval pauses. Current denial clears scope,
  proof, review, result and counters and cancels pending requests; explicit
  current-access recheck is required. Account/role/session replacement remounts
  private context. Offline/reconnect also requires explicit recheck. A stuck
  status read can be restarted explicitly; its late result is ignored.
- Password rejection remains separate from current access loss. Back to scope
  uses the private draft guard, comparison/history tables have distinct named
  keyboard-scrollable regions, and expiry copy does not claim that an unknown
  operation changed no records. Original review/commit mutation reconciliation
  and single-use export handling remain separate pending work.
- All 24 focused server/client cases pass (18 new read cases), and all 18 populated
  production-browser cases pass across six profiles, no skips. Measured axe/
  overflow pass; mobile native capture inspected and unapproved. All 15 actual
  owned API/DB/native desktop-mobile checks pass: exact subject review preparation,
  metadata outage/retry/denial, retained review and declined navigation, current
  subject data unchanged and no approvals/egress/errors/overflow. Exactly two
  unapproved fixture reviews are prepared; neither commits or sends anything.
- Initial fixture cleanup correctly hit 42501 when it attempted protected review
  UPDATE after all checks. Read-only inspection identified the single owned actor
  and two reviews; contact redaction had completed. Follow-up revoked all owned
  sessions and disabled the account with verification. Reviews remain private under
  normal expiry/cleanup; no protected grant/row was changed. The fixture now follows
  that restriction. No physical-erasure claim or repeat of completed review actions.
- Build/types/lint (zero errors/25 existing warnings), budgets/secrets/traceability
  pass. All 2,535 tests/205 files and all 21 critical 90% branch gates pass. Global
  lines/branches/statements pass at 73.39%/73.15%/71.75%; functions remain below
  unchanged 70% at 64.90%. A separate normative operations case brings the catalog
  to 160 unverified logical cases, with no full-acceptance status promoted.
  No migration; applied chain 132. See `PRIVACY_READ_RECOVERY.md`.
- Member/merge, contact status/hold and person-data privacy review/commit unknown-
  outcome mutation recovery, global function coverage and remaining manual/device/
  visual/hosted acceptance remain open. SSO/Google and Bevy/Engage remain deferred;
  no deployment, real provider send, production change, purchase or new timer.


### Contact-inbox private read and review recovery — 2026-11-06

- Selected inquiry failures now have usable refresh/retry and a return path.
  Private reads retain dated same-view snapshots and proposed status/hold fields
  while pausing actions. New selection/filter/page contexts hide old data; malformed
  and empty/mismatched selected replies are refused. Current 401/403/404 clears
  private records/reviews/proof and pauses until explicit refresh. Account/role/
  session changes cancel old work. Offline/reconnected actions require current
  recheck. Later-page/filter errors have Previous/reset escape controls.
- Changed revisions preserve proposals while requiring reviewed current-record
  reload. Stay here retains input; current redaction metadata clears old private
  content immediately. Activated download links clear on stale/unverified context,
  expiry and session change, refuse late old results and current-denial disclosure,
  and use the existing bounded private-download URL/expiry validator. Table regions
  are named keyboard-focusable scroll containers. Status/hold unknown-outcome
  mutation replay remains separate pending work; no backend behavior bypass.
- All 44 focused inbox/public-contact/server cases pass, including 26 new inbox
  cases. Initial browser matrix retained (12 pass/12 exact-label lookup failures);
  role/name status-control lookup passes targeted and full matrices. All 24 final
  production-browser cases pass across six profiles, no skips. Measured axe/
  overflow pass; mobile native capture inspected, unapproved.
- All 14 actual loopback API/DB/native desktop-mobile checks pass: initial/detail
  retry, retained proposals, declined navigation, reviewed current revision,
  immediate redaction clearing and no native writes/egress/errors/overflow.
  Deliberate saved status/redaction changes affect only owned fixture records;
  fixture content redacted, actor disabled/sessions revoked, private tombstones/
  audit retained. No provider sends, workers/files, production change or physical
  erasure claim. No SQL migration; applied chain remains 132.
- Build/strict types/lint (zero errors/25 existing warnings), budgets/secrets/
  traceability pass. All 2,517 tests/204 files and all 21 critical 90% branch gates
  pass. Global lines/branches/statements pass at 72.91%/72.81%/71.29%; functions
  remain below unchanged 70% at 64.39%. Catalog stays 159 unverified cases. See
  `CONTACT_INBOX_READ_RECOVERY.md`. Member/merge and contact mutation recovery,
  person-data privacy, remaining coverage and full manual/device/visual/hosted
  acceptance remain open. SSO/Google and Bevy/Engage stay deferred.


### Scoped merge selection and complete member destinations — 2026-11-06

- Migration 132 adds service-only current-session source-bound merge candidate
  and selected-target reads, filtering eligible same-scope active/unmerged rows
  before search/paging and exposing current source revision. The selected target
  is verified independently, including outside the visible candidate page.
  Destination reads now page current permitted teams before the API assembles a
  complete inventory, removing the silent 100-team ceiling. Changing/duplicate/
  short/malformed snapshots and an explicit 10,000-destination response limit
  refuse partial results. Read audits contain IDs/counts/hashes, no contacts/query.
- SQL covers 65 eligible targets behind 40 other-scope rows, later-page/exact
  search, inactive/archive exclusion, changed target scope, session/role denial,
  explicit service/browser grants and 107 destinations. Both 132-migration chains
  pass (238/239 checks), both 100-client races and six restore checks pass; applied
  locally. Any correction must be a new forward migration.
- The picker has independent timestamped candidate/target recovery, current
  source/target revision checks, off-page generic selection, complete paging,
  denial clearing and explicit reconnect/access recheck. Current review must be
  discarded before changing its selection; parent/source-owning-team context
  changes clear child state. Comparison receives keyboard focus and its table
  is a named focusable scrolling region. Closing uses existing draft navigation.
- All 85 focused member/client/transfer/server cases pass; all 42 populated
  browser picker/parent-regression cases pass across six profiles, no skips.
  Measured axe/overflow pass; mobile comparison inspected, unapproved. All 14
  actual owned API/DB/native desktop-mobile checks pass, including 105 fixture
  destinations and target 65. Only two owned private reviews are prepared; no
  merge, provider send, unexpected egress/page error/overflow. Saved rows are
  unchanged during reads/reviews. One deliberate fixture target scope change is
  concealed by the bound lookup. Owned records/teams archived, actor disabled/
  sessions revoked; private reviews/audits retained, not physically erased.
- All 2,491 tests/203 files pass; all 21 critical 90% branch gates pass. Build,
  strict types, lint (zero errors/25 existing warnings), budgets/secrets/traceability
  pass. Global lines/branches/statements pass at 72.48%/72.40%/70.87%; functions
  still fail unchanged 70% at 63.80%. Catalog remains 159 unverified logical cases.
  See `MEMBER_SELECTION_RECOVERY.md`.
- Ordinary member/merge unknown-outcome mutation recovery, contact-inbox and
  person-data privacy recovery, global function coverage and complete role/manual/
  device/visual/hosted acceptance remain open (`LOCAL_ACCEPTANCE_AUDIT.md`).
  SSO/Google and Bevy/Engage remain deferred; no deployment, production change,
  purchase, real provider send, new timer or AI commit trailer.


### Community-directory parent private read recovery — 2026-11-06

- Permissions, filtered inventory, selected member and activity now use separate
  keyed requests, named loading/retry and dated retained snapshots. Inventory
  success cannot mask a permissions failure. New filter/record/page contexts hide
  prior data immediately and late replies are ignored. Malformed results have
  a retry path; a failed later inventory page retains Previous members.
- Dependent creation/management/transfers/editor saves and open merge controls
  pause during unverified parent reads. Proposed fields survive transient outages;
  a newer saved revision cannot silently replace them. Current 401/403/404 clears
  private state and pauses polling until explicit access recheck. Offline and
  reconnected states remain paused until rechecked. Account/role/session boundaries
  clear child state and abort old reads. Existing CSV and merge proof rules remain.
- All 57 focused parent/transfer/server cases pass (22 new parent cases). All 24
  populated production-browser cases pass across six profiles with no skips;
  measured axe/overflow pass, mobile capture inspected and unapproved. All 14
  actual loopback desktop/mobile checks pass; failed/retried reads and declined
  navigation leave owned saved rows unchanged. No native record writes, unexpected
  egress/page errors/overflow; fixture records archived, actors disabled/sessions
  revoked. Initial wrong-table-name fixture failure and completed cleanup retained.
- Full coverage initially hit the unchanged 10-second architecture setup timeout:
  its shared graph also visited test/script retirement references. Application-only
  scanning now keeps both HTML roots and the identical shipped static/dynamic graph;
  complete retirement analysis stays default and application mode returns no
  retirement candidates. Three small-repository negative/default-boundary checks
  plus the two shipped architecture checks pass. No timeout/gate was raised.
- All 2,463 tests/202 files pass; all 21 critical 90% branch gates pass. Statements
  now pass 70% at 70.59%; lines 72.19% and branches 72.08% also pass. Functions
  remain below unchanged 70% at 63.58%. Build/types/lint (zero errors/25 existing
  warnings), budgets/secrets/traceability pass. No SQL migration; applied chain 131.
  Catalog remains 159 unverified logical cases. See `MEMBER_READ_RECOVERY.md`.
- Next confirmed local work: complete merge candidate/destination inventories,
  selected-target and member/merge mutation recovery, contact inbox and person-data
  privacy workflows (`LOCAL_ACCEPTANCE_AUDIT.md`), then remaining global/manual/
  device/visual/hosted acceptance. SSO/Google and Bevy/Engage remain deferred.


### Respondent submission/edit/draft original-outcome recovery — 2026-11-06

- Migration 131 adds monotonic draft revisions, fixed client resume-token intent,
  current-authority metadata-only inspection and atomic body/key replay. Ten
  simultaneous identical saves preserve one draft/revision; accepted old replay
  preserves a later legitimate save, while a new stale request conflicts. Both
  SQL chains pass (236/237 checks), both 100-client races and six isolated restore
  checks pass; migration applied locally. Applied historical SQL stays immutable.
- Public submit/edit recovery checks current source access before receipt/hash/
  edit-capability disclosure. Consumed invitations can reconcile only their own
  accepted response. Original edit-copy revision is preserved; draft inspections
  disclose neither answers nor identity/capabilities. No extra write/copy job is
  created by an inspection. The runtime freezes original version/revision/body/
  tokens/key, inspects before explicit identical retry, requires recheck after
  reconnect/second loss, and fences expiry, current denial, session/context change
  and reviewed stopping. Known conflicts preserve proposed answers until an
  explicit reviewed current-answer reload.
- Actual local probe initially exposed same-form fragment re-entry leaving an old
  success screen mounted. Intermediate browser checks also exposed the old outer
  capability wrapper remounting before the live guard, and Firefox's initial
  anonymous session probe clearing public edit state. Forms now owns a guarded,
  generation-fenced context boundary; initial unbound 401 still invalidates private
  API requests without announcing a public-capability sign-out. Known-session
  loss/explicit sign-out still clear private state. Initial failed/interrupted
  reports and complete fixture cleanup are retained.
- All 54 actual API/DB/native desktop-mobile checks pass, including before/after
  acceptance losses, read-only inspection, simultaneous saves, stale conflicts
  and reviewed reload. Only intended responses are created; no unrequested copies,
  provider jobs/egress, page errors or overflow. Owned forms archived, edit tokens
  revoked, drafts expired, actors disabled/sessions revoked; fixture audit/response
  records remain private. No physical-erasure claim.
- All 102 final production-browser write/upload-regression checks pass across six
  profiles, no skips. Populated axe passes. Screenshot review improved the notice's
  heading/spacing/actions; mobile capture inspected, no approved golden claimed.
  Build/types/lint (zero errors/25 existing warnings), budgets, secrets and
  traceability pass. All 2,438 tests/200 files pass; all 21 critical 90% branch
  gates pass. Global coverage still fails unchanged 70%: 71.19% lines, 71.13%
  branches, 69.62% statements and 62.51% functions. Catalog: 159 unverified cases.
- The renewed source audit confirms further community-directory, contact-inbox and
  person-data privacy recovery work (`LOCAL_ACCEPTANCE_AUDIT.md`), followed by
  remaining quality/manual/device/visual/hosted acceptance. See
  `RESPONDENT_WRITE_RECOVERY.md`. SSO/Google and Bevy/Engage stay deferred; no
  deployment, provider sends, production changes or new timer.


### Respondent file recovery and local scanner restoration — 2026-11-06

- Migration 130 adds current-access/version/field/proof/body/key-bound atomic
  preparation and minimal read-only receipt inspection. Identical concurrent
  requests preserve one upload/quarantine object under existing file quotas.
  The native respondent uses explicit prepare/recovery routes; original transport,
  completion, status and removal remain authorized and private. No raw proof,
  signed URL, body or bytes enter receipt records or browser storage.
- File children now protect original intent across lost preparation/PUT/completion
  replies, require inspection before explicit continuation, recheck after second
  loss/reconnect and attach only after current clean scan. Independent restored
  status reads, missing-reference/current-form denial distinction, expired/rejected
  answer exclusion, removal-loss recovery, reviewed stopping, multi-file batches
  and field/form/version/proof/session cancellation are covered. Parent form
  identity/answers/capabilities clear on session change/current upload denial;
  preview/live scope and private navigation are fenced.
- Both 130-migration SQL chains pass (234/235 checks), both 100-client capacity
  races and six isolated restore checks pass; migration applied locally. All 84
  focused file/route/respondent cases and nine scanner ownership/resource/update
  guards pass. All 54 final upload/image-picker production-browser cases pass
  across six profiles, no skips. Initial interrupted progress-label contrast
  failure and later four WebKit disabled-save contrast failures are retained;
  narrow text/disabled colors fix them. Populated axe passes, mobile/live captures
  inspected and unapproved. Lost-connection status now says work is paused.
- Actual probe found this local stack had no buckets and the native scanner was
  stopped. Native ClamAV links OpenSSL 4, matching upstream signature-verification
  failure; no verification bypass used. The official pinned ClamAV 1.5.4 container
  now runs in dedicated Colima with owned persistent signatures, resource limits,
  explicit amd64 emulation and loopback-only 13310. Signature update/load test and
  health pass (28175), all six buckets initialized privately; clean text and
  in-memory EICAR rejection pass. Native remains an explicit compatible-host option.
  No periodic task, provider send or production change was introduced.
- All 40 actual API/DB/desktop-mobile checks pass with generated harmless text:
  five loss positions, exact bytes/body/key, one upload/completed scan job each,
  ten simultaneous identical preparations and minimal read-only outcome checks.
  Zero final responses/mail/provider jobs/egress/errors/page overflow. Owned objects
  deleted/references removed/forms archived/accounts disabled/sessions revoked.
  Initial probe's unhandled fixture-route exception and verified follow-up cleanup
  are retained; fixture now captures route errors so normal cleanup runs.
- Build/types/lint (zero errors/25 existing warnings), byte budgets, secrets and
  traceability pass. All 2,389 tests/198 files pass; all 21 critical 90% branch gates
  pass. Global coverage still fails the unchanged 70% gate: 70.98% lines, 70.90%
  branches, 69.44% statements, 62.40% functions. Catalog stays 159 unverified cases.
  See `RESPONDENT_UPLOAD_RECOVERY.md` and updated `LOCAL_RUNTIME.md`.
- Remaining local Forms recovery: respondent final submissions, response edits
  and save/resume must preserve original unknown requests rather than change keys
  or generate a new draft token after loss. Global coverage and complete manual/
  device/visual/hosted/launch acceptance remain open. SSO/Google and Bevy/Engage
  remain deferred.

### Published form image picker recovery — 2026-11-06

- Header/field image pickers now preserve same-page successful snapshots and local
  selection during transient read failure, while pausing selection until a current
  verified read. Named loading/retry/timestamps, malformed-result refusal, later-
  page failure recovery, shrinking-inventory Previous and explicit reconnect
  rechecks are implemented. Form/field/account/role/session changes cancel old
  reads. Generic absent-page selection labels do not fabricate public metadata;
  local selection removal works without a network write. Existing publication
  validation and public-media authorization remain authoritative.
- All 20 image-specific client/schema/render checks pass (17 new recovery cases).
  Builder read/scope regressions also pass. All 18 final image-picker/builder
  production-browser cases pass across six profiles. Initial matrix (10 passes,
  two real hovered mobile-button contrast failures) is retained; mobile builder
  tool dialogs now use the existing darker admin coral token. Populated axe passes,
  mobile capture inspected; no approved golden or real-device claim.
- Build/types/lint (zero errors/25 existing warnings), byte budgets, secrets and
  traceability pass. No DB/worker/provider/chapter mutation. The latest complete
  test/coverage run remains the preceding 2,317-case checkpoint; it was not rerun
  for this scoped read/UI change. Global statement/function coverage and complete
  acceptance remain open. See `FORM_IMAGE_PICKER_RECOVERY.md`.
- Respondent/runtime/file recovery is next; SSO/Google and Bevy/Engage stay deferred.

### First-party linked-form recovery — 2026-11-06

- Migration 129 adds complete session-bound authorized published-form candidates,
  monotonic link revisions, immutable generation/version checks and atomic
  actor/session/body/key-bound original save/removal receipts. Current source
  authority precedes receipt inspection. Target eligibility precedes reviewed
  version comparisons; an accepted old removal preserves a recreated link.
  Minimal recovery omits private definitions, answers, titles and capabilities.
- Event/team/campaign linked-form children now have independent current source,
  candidate and selected-target reads, retained proposals, named retries,
  consequence reviews, frozen unknown intent, explicit inspected identical
  retries, second-loss/offline/session fences and protected dismissal/navigation.
  A successful empty target check masks cached target title/URL/option while
  retaining the permitted manual source label, including during a later outage.
  View-only source inspection does not fetch candidates or enable mutations.
- Both complete 129-migration SQL suites pass (232/233 checks), both 100-client
  races and six isolated restore checks pass; migration applied locally. All
  76 focused client/route/schema cases and 15 legacy actual integration checks
  pass. All 48 new actual API/DB/desktop-mobile recovery checks pass, including
  ten simultaneous identical saves and accepted old removal after recreation.
  Fresh owned fictional private publications/draft sources/accounts only; no
  responses/jobs/workers/provider sends/existing chapter or production changes.
  Sources/forms archived, accounts disabled/sessions revoked; cleanup recorded.
- Production-browser initial failures were a wrong concealed-parent test heading
  and actual 4.45:1 hovered pager contrast. Corrected assertion and narrowly scoped
  existing admin coral token; interrupted initial report retained as incomplete.
  All 144 final linked-form/event-mail/team/shared-workspace cases pass across six
  profiles, no skips. Populated axe passes; desktop/mobile captures inspected but
  unapproved. Build/types/lint (zero errors/25 existing warnings), byte budgets,
  secrets and traceability pass. Catalog remains 159 unverified logical cases.
- All 2,317 tests/195 files pass; all 21 critical 90% branch gates pass. Global
  coverage still fails its unchanged gate: 70.40% lines, 70.44% branches,
  68.84% statements and 61.57% functions. No quota/timeout/threshold weakened.
  See `FORM_INTEGRATION_RECOVERY.md`.
- Respondent/runtime/file/image child recovery, global coverage and full storage/
  device/manual/visual/hosted acceptance remain open. Source review found uncertain
  respondent submissions can change keys after answer edits; that recovery gap is
  next. SSO/Google and Bevy/Engage remain deferred.

### Private invitation/link lifecycle recovery — 2026-11-06

- Migration 128 adds current-session complete inventory reads, monotonic selected
  link revisions and atomic original-request batch/resend/revoke receipts. Draft/
  publication/selected-record versions, exact normalized audience, fixed expiry,
  current eligibility/cooldown and request hash/key are bound. Accepted replays
  cannot duplicate mail jobs, rotate tokens again or repeat revocation audits.
  Read-only recovery omits recipient identity/ciphertext/raw tokens and current
  denial clears private state. Erased recipients retain generic references.
- A dedicated private-link child preserves independent read/proposal state and
  consequence reviews, frozen intent, second-loss rechecks, explicit identical
  retries, cancellation/context/session fences, reviewed stopping and protected
  inspector/navigation exits. Verified-email tokens remain read-only here; public
  verification stays separate. The legacy invitation HTTP mutation paths are
  removed. Current form payload identity is checked before access proposals.
- Both complete 128-migration SQL suites pass (230/231 checks), both 100-client
  races and six isolated restore checks pass; migration applied locally. All
  108 focused access/link cases pass (56 new lifecycle route/client cases plus
  regressions and substituted-form fencing). SQL fixture ambiguity corrected in
  its verified owned scratch, which was removed; no product guard weakened.
- All 58 actual API/DB/desktop-mobile checks pass: all three operations and both
  loss positions, original bytes/key/expiry, one intended lifecycle audit, ten
  simultaneous identical batches produce one new link/job, and minimal receipt
  inspection. Full successful probe: two private publications/six fictional links/
  ten disabled metadata-only jobs; zero responses/workers/provider sends/existing
  chapter/production changes. Owned recipient ciphertext cleared/tokens revoked,
  forms archived/accounts disabled/sessions revoked. Initial API-restart and row-
  locator probe failures/cleanup reports retained. No quota/timeout reset.
- Production browser audit found disabled populated scrolling tables were not
  keyboard-focusable. The table is now a named focusable region. All 144 private-
  link/collaborator/builder/shared-workspace cases pass across six profiles after
  the fix. Initial interrupted matrix is explicitly marked incomplete, with its
  unexecuted cases distinguished from approved skips. Populated axe passes; mobile
  inspected, captures unapproved. Build/types/lint (zero errors/25 existing warnings),
  budgets, secrets and traceability pass. Catalog remains 159 unverified cases.
- All 2,244 tests/193 files pass; all 20 critical 90% branch gates pass. Global
  coverage remains below 70%: 69.86% lines, 69.61% branches, 68.15% statements and
  60.84% functions. No test/coverage threshold changed. See
  `FORM_PRIVATE_LINK_RECOVERY.md`.
- First-party integration and respondent/runtime recovery, global coverage and
  full storage/device/manual/visual/hosted acceptance remain open. SSO/Google and
  Bevy/Engage remain deferred.

### Permanent deletion original-outcome recovery — 2026-11-06

- Migrations 126–127 add original-session read-only deletion receipt inspection
  after content erasure, with current Super Admin authority, receipt expiry and
  form/review/key binding. Unaccepted retries preserve the original five-minute
  eligibility snapshot, retention/hold/reference gates and require fresh password
  proof. Accepted mutation replays still require current proof and a mandatory
  original request hash. The original atomic erasure/audit protections remain.
- Eligibility reads now have retained snapshots, independent retry/loading,
  current-role/form/session isolation and denial clearing. Offline clears proof
  and requires explicit recheck. Frozen original intent, unknown-outcome pause,
  identical explicit retry, second-loss recheck, dispatch-time expiry, protected
  dialog/navigation and reviewed stopping prevent blind irreversible repetition.
  Failed non-destructive review preparation requires fresh eligibility before a
  new review; no erasure can be dispatched from an unknown capability request.
- Both complete 127-migration SQL suites pass (228/229 checks), both 100-client
  races and six isolated restore checks pass; both migrations applied locally.
  All 48 focused route/client/schema cases pass. All 2,187 tests/191 files pass;
  all 19 critical 90% branch gates pass. Global coverage remains below 70%:
  69.62% lines, 69.32% branches, 67.93% statements and 60.64% functions. No test
  timeout, quota or coverage threshold was relaxed.
- Thirty actual API/DB/desktop-mobile checks pass. Four fresh fictional private
  drafts were archived then purged via reviewed UI, one tombstone revision/audit
  each. Other-session and ordinary-admin recovery is refused. Accepted loss reads
  the original receipt; unaccepted loss retries original bytes/key with fresh
  proof. Populated axe passes. Initial probe incorrectly used a different session
  for an accepted receipt; expected 404 preserved, corrected probe passes. Zero
  publications/responses/files/exports/jobs/workers/provider sends/existing chapter
  or production changes. Owned remaining drafts archived/accounts disabled/sessions
  revoked. No physical byte-erasure claim is made by empty-byte fixtures.
- All 84 deletion/library production-browser cases and 30 final deletion cases
  pass across six profiles, including capability-outage recheck. Mobile recovery
  inspected; captures remain unapproved. Build/types/lint (zero errors/25 existing
  warnings), byte budgets, secrets and traceability pass; catalog remains 159
  unverified cases. See `FORM_PERMANENT_DELETION_RECOVERY.md`.
- Private invitation/link lifecycle, first-party integration and respondent/runtime
  recovery, global coverage and full storage/device/manual/visual/hosted acceptance
  remain open. SSO/Google and Bevy/Engage remain deferred.

### Versioned collaborator grant outcome recovery — 2026-11-06

- Migration 125 adds immutable grant generation IDs/monotonic revisions, complete
  session-bound candidate/collaborator inventories and atomic version/body/key-bound
  saves/removals. Read-only outcome inspection rechecks current authority/expiry;
  minimal accepted receipts never reapply an old deletion to a recreated grant.
  Current team/owner/action rules and removal of inactive recipients are preserved.
  The legacy HTTP mutation path was removed. Frozen original requests, duplicate
  latches, explicit inspected retries, second-loss rechecks, expiry/offline/session/
  denial fences, parent permission refresh and reviewed stopping protect the UI.
- Inspector tab/mobile dismissal guards now preserve pending/uncertain access work.
  Ordinary unsent access proposals use a discard review. Mobile has one active
  access workspace; uncertainty precedes an expandable original request review.
- Both complete 125-migration SQL suites pass (225/226 checks), both 100-client
  races and six isolated restore checks pass; migration applied locally. All
  2,141 tests/189 files pass. New collaborator API branches are 100% covered; all
  18 critical 90% branch gates pass. Global coverage remains below 70%: 69.11%
  lines, 68.77% branches, 67.27% statements and 60.19% functions. No threshold or
  timeout was changed. The focused builder/access/helper/route group passes 111
  cases (before one additional route projection case in the full run).
- Forty actual API/DB/desktop-mobile checks pass, including one audit per action,
  ten simultaneous identical creations/removals and delete/recreate protection.
  Existing 105-account inventory and view-only definition probes pass. Fresh owned
  fictional private drafts/accounts only; zero publications/responses/jobs/workers/
  provider sends/existing chapter or production changes. Fixtures archived/disabled/
  sessions revoked. Initial locator probe failures and later auth-IP quota refusal
  are preserved separately; no quota reset/bypass. Successful report provenance
  records restoration from exact retained successful command output.
- All 90 collaborator/builder/shared-workspace production-browser cases and 36
  final collaborator cases pass across six profiles, including protected mobile
  close/Escape/tab changes and measured axe. Captures remain unapproved. Build,
  types, lint (zero errors/25 existing warnings), budgets, secrets and traceability
  pass; catalog remains 159 unverified cases. See `FORM_COLLABORATOR_RECOVERY.md`.
- Private invitation/link lifecycle, permanent-deletion/integration/runtime recovery,
  global coverage and full storage/device/manual/visual/hosted acceptance remain
  open. SSO/Google and Bevy/Engage remain deferred.

### Delivery intent and complete recipient inventory recovery — 2026-11-06

- Migration 124 adds current-session/expiry guards and metadata-only original
  delivery outcome inspection, while preserving atomic definition/policy/proof/
  recipient checks. The browser freezes draft/policy/recipient choices and key,
  requires newly entered proof only for an explicitly inspected unaccepted retry,
  latches pending work and clears private state on denial/context changes. Read
  failures retain proposals and pause dependent changes; reconnect never writes.
- Server-paged literal eligible-account search/counts replace the fetched 200-row
  ceiling. Selected references load separately and stay visible across pages.
  Unavailable configured accounts retain generic references until explicit
  removal; current review validity includes authorization, not schema alone.
  Mobile uncertainty precedes an expandable original-settings review. Own exact
  respondent copies remain separate from chapter/legacy approval settings.
- Both complete 124-migration SQL suites pass (223/224 checks), both 100-client
  races and six isolated restore checks pass; migration applied locally. All
  103 focused cases pass (28 new route/37 new client plus existing regressions).
  All 38 actual API/DB/desktop-mobile checks pass: beyond-200 selection, retained
  choices on outage, explicit unavailable-account removal, both loss positions/
  enable-disable choices, fresh proof, original requests, single audits and axe.
  Two fictional private drafts/eight policy mutations/215 owned recipient accounts;
  zero publications/responses/jobs/workers/provider sends/existing chapter or
  production changes. Forms archived/accounts disabled/sessions revoked.
- All 108 delivery/privacy/shared-workspace production-browser cases pass across
  six profiles. Mobile recovery inspected; captures unapproved. Build/types/lint
  (zero errors/25 existing warnings), budgets, secrets and traceability pass.
- All 2,078 tests/187 files pass. Global coverage remains below 70%: 68.88% lines,
  68.64% branches, 67.09% statements and 60.05% functions. All 17 critical branch
  gates pass; no threshold/timeout changed. Catalog stays 159 unverified cases.
- Collaborator/private-link lifecycle, permanent-deletion/integration/runtime
  recovery and full quality/storage/device/manual/visual/hosted acceptance remain
  open. See `FORM_DELIVERY_RECOVERY.md`.

### Retention/operational-hold outcome recovery — 2026-11-06

- Migration 123 adds current-session/expiry guards and metadata-only original
  privacy outcome inspection. Existing atomic hold/release receipts stay minimal;
  accepted results reconcile without repeating proof/writes, including after
  later release/erasure. Unaccepted identical retries require matching current
  target/revisions/capability and newly entered password proof within 47 hours.
  Password properties are excluded from frozen intent. Private reads preserve
  proposals on outages; changed policies need explicit review. Session/context/
  offline cancellation, denied-state clearing, duplicate latch, malformed-result
  rejection and reviewed stopping protect uncertain changes. Mobile recovery
  precedes an expandable frozen original-settings review.
- Both complete 123-migration SQL suites pass (221/222 checks), both 100-client
  races and six isolated restore checks pass; migration applied locally. All 55
  focused checks pass (19 new route/28 new client cases plus eight existing
  regressions). All 58 actual API/DB/desktop-mobile checks pass: two internal
  publications/two fictional responses/sixteen intended privacy mutations, one
  revision/audit per action, unchanged answer revisions/deadlines/jobs and measured
  axe. Fresh officer per viewport; metadata jobs disabled/secrets cleared, forms
  archived/accounts disabled/sessions revoked. No worker/provider send, existing
  chapter or production change. Initial single-actor probe hit the unchanged
  ten-review/15-minute limit and remained safely unconfirmed; cleanup/report
  preserved. No quota or test timeout changed.
- All 96 privacy/response-read/action-denial/shared-workspace production-browser
  cases pass across six profiles, followed by 24 final layout/recovery checks.
  Mobile recovery inspected; captures unapproved. Build/types/lint (zero errors/
  25 existing warnings), budgets, secrets and traceability pass. All 2,013 tests/
  185 files pass. Global coverage remains below 70%: 68.39% lines, 68.14% branches,
  66.60% statements and 59.52% functions. All 17 critical branch gates pass;
  no timeout/threshold changed. Catalog remains 159 unverified cases.
- Delivery, collaborator/private-link lifecycle, permanent-deletion/integration/
  runtime recovery and full quality/storage/device/manual/visual/hosted acceptance
  remain open. See `FORM_PRIVACY_RECOVERY.md`.

### Private saved-view mutation and inventory recovery — 2026-11-06

- Migration 122 adds selected revisions, current-owner/session atomic creation/
  replacement/removal receipts and read-only outcome checks. New names never
  silently overwrite a view. The browser freezes original filters/columns/key,
  reviews actual filter/question labels and consequences, latches dispatch and
  requires fresh exact explicit retry after uncertainty. Denial clears private
  preferences, proposals, responses and URL filters. Inventory search/counts/
  paging stay owner/form scoped and reach beyond the old 100-row ceiling.
- Both complete 122-migration SQL suites pass (219/220 checks), both 100-client
  races and six isolated restore checks pass; migration applied locally. All
  162 focused cases pass (32 new route/31 saved-view client plus three parent
  denial regressions). All 50 actual API/DB/desktop-mobile checks pass: twelve
  intended view mutations/two private drafts, 250 owned fictional paging rows,
  original retries, single audits and measured axe. No publication/responses/
  delivery jobs/workers/provider sends/existing chapter or production changes.
  Forms archived/accounts disabled/sessions revoked.
- All 192 response/shared-workspace production-browser checks pass, followed by
  18 action-denial and 60 final review/pagination/denial checks across six
  profiles. Mobile recovery inspected; captures unapproved. Build/types/lint
  (zero errors/25 existing warnings), budgets, secrets and traceability pass.
- All 1,966 tests/183 files pass. Global coverage remains below 70%: 68.04% lines,
  67.68% branches, 66.25% statements and 59.22% functions. All 17 critical branch
  gates pass; no threshold/timeout changed. Catalog stays 159 unverified cases.
- Forms collaborator/private-link lifecycle, delivery/privacy/deletion/
  integrations/runtime recovery and complete quality/storage/device/manual/
  visual/hosted acceptance remain open. See `FORM_SAVED_VIEW_RECOVERY.md`.

### Response-workspace close/reopen recovery — 2026-11-06

- Close/reopen now has saved-revision/state consequence review and uses existing
  atomic library receipts. Current source/response reads, publication/archived
  status and permissions gate dispatch. Frozen original intent, duplicate latch,
  read-only accepted reconciliation, 47-hour explicit retry, session/account/
  offline cancellation, target validation, denied-state clearing and reviewed
  stopping protect uncertain availability changes. A second failed retry clears
  the shared recovery inspection before dispatch and requires a new check.
- All 114 focused cases pass. All 38 actual API/DB/desktop-mobile checks pass:
  two fresh internal forms published once each, four intended availability
  changes per form, one revision/audit per change and measured axe. Zero
  responses/delivery jobs/workers/provider sends/existing chapter or production
  change. Forms archived/accounts disabled/sessions revoked.
- All 162 library/response/shared-workspace production-browser checks pass across
  six profiles, followed by 24 final layout checks. Mobile recovery inspected,
  captures unapproved. Build/types/lint (zero errors/25 existing warnings),
  byte budgets, secrets and traceability pass. All 1,900 tests/181 files pass.
  Global coverage remains below 70%: 67.59% lines, 67.31% branches, 65.86%
  statements and 58.81% functions. All 17 critical branch gates pass; no
  timeout/threshold changed. Catalog remains 159 unverified cases.
- Saved-view writes, Forms access/settings/deletion/integrations/runtime and
  complete coverage/storage/device/manual/visual/hosted acceptance remain open.
  See `FORM_RESPONSE_AVAILABILITY_RECOVERY.md`.

### Atomic response deletion/redaction recovery — 2026-11-06

- Migration 121 adds reviewed respondent-edit revision/privacy/hold checks,
  current-session atomic receipts and metadata-only read reconciliation for
  deletion/redaction. The browser withholds cached identity/answers/history/files
  before dispatch; uncertain outcomes retain only the frozen metadata request.
  Explicit original retries, 47-hour expiry, duplicate latch, session/offline/
  context cancellation, denied-state clearing and reviewed abandonment prevent
  silent replacement or restoring erased snapshots.
- Both 121-migration SQL suites pass (217/218 checks), both 100-client races and
  six isolated restore checks pass. Migration confirmed applied locally without
  a reset. All 189 focused checks pass (30 new client/27 new route cases).
  All 40 actual API/DB/desktop-mobile checks pass, including concurrent replay,
  both loss positions, exact retries, erasure/single audit and measured axe.
  Three fresh internal forms/ten fictional responses and edits; metadata jobs
  disabled/secrets cleared, forms archived/accounts disabled/sessions revoked.
  No workers/provider sends/existing chapter or production change.
- All 126 response-action/read/history/file/export/shared-workspace production-
  browser cases pass across six profiles. Mobile recovery inspected; captures
  unapproved. Strict types/lint (zero errors/25 existing warnings), byte budgets,
  secrets and traceability pass. All 1,877 tests/180 files pass. Global coverage
  remains below 70%: 67.49% lines, 67.20% branches, 65.77% statements and
  58.77% functions. All 17 critical branch gates pass; no threshold or timeout
  changed. Catalog remains 159 unverified logical cases.
- Availability/saved-view writes, Forms access/settings/deletion/integrations/
  runtime and complete quality/storage/device/manual/visual/hosted acceptance
  remain open. See `FORM_RESPONSE_MUTATION_RECOVERY.md`.

### Atomic background export recovery — 2026-11-06

- Migration 120 adds current-session/action/target export receipts and read-only
  reconciliation. Original intent, source permissions, minimal receipt content,
  one creation/removal audit, 47-hour explicit retry, denied-state clearing and
  reviewed abandonment protect uncertain changes. Private inventory retains
  timestamped matching jobs on outages and pauses polling/actions. Scope/session/
  offline changes cancel obsolete work; shared bounded download links require
  explicit activation and preserve focus on background expiry.
- Both 120-migration SQL suites pass (215/216 checks), both 100-client capacity
  races and six restore checks pass; migration applied locally. All 164 focused
  checks pass (33 new client, 26 new route cases). All 38 actual API/DB/desktop-
  mobile checks pass, including ten concurrent identical creates/removals, both
  response-loss positions and measured axe with one job/audit per action.
  Three fictional private drafts/five empty export jobs; no publications,
  responses, workers/files/provider sends or existing chapter/production change.
  Jobs cancelled/forms archived/accounts disabled/sessions revoked.
- Build/types/lint (zero errors/25 warnings), byte budgets, secrets/traceability
  pass. All 102 export/response/shared-workspace production-browser checks pass
  across six profiles; mobile recovery inspected, captures unapproved.
- All 1,820 tests/178 files pass. Overall 70% coverage remains red: 67.17% lines,
  66.87% branches, 65.47% statements and 58.47% functions. All 17 critical branch
  gates pass; no timeout/threshold changed. Catalog stays 159 unverified cases.
- Response availability/destructive/saved-view mutations, remaining proposal/
  navigation, Forms access/settings/deletion/integrations/runtime and complete
  quality/physical storage/device/manual/visual/hosted acceptance remain open.
  See `FORM_EXPORT_RECOVERY.md`.

### Independent response-workspace reads — 2026-11-06

- Responses, summary, saved views and holds have independent explicit retries,
  timestamped matching snapshots and paused actions. First failure differs from
  empty results; failed hold reads cannot authorize destructive actions. Selection
  resolves from the matching inventory. Definition/child denial or lost response
  capability clears private data, proposals and URL filters until explicit recheck.
  Reconnect requires active-view reload. Horizontal table scrolling is named and
  keyboard focusable; per-read feedback uses restrained existing tokens.
- All 99 focused tests pass (17 new). All 24 actual loopback API/DB/desktop-mobile
  checks pass, including populated axe, independent failures, retained proposals,
  hold safeguards and unchanged counts. Two fictional internal forms each have
  one intended response/edit/view; metadata jobs disabled/secrets cleared, forms
  archived/accounts disabled/sessions revoked. No worker/provider send, existing
  chapter or production change.
- Build/types/lint (zero errors/25 warnings), byte budgets, secrets/traceability
  pass. All 72 response-read/history/attachment/shared-workspace browser checks
  pass across six profiles, plus six final definition-denial/capability checks.
  Captures inspected/unapproved; no real-device/manual/hosted acceptance.
- All 1,761 tests/176 files pass. Global 70% coverage remains red: 66.36% lines,
  66.21% branches, 64.59% statements and 57.74% functions. All 17 critical branch
  gates pass. No timeout/threshold changed; catalog stays 159 unverified cases.
- Response availability/destructive/saved-view atomic mutation and uncertain-
  outcome recovery, exports/proposal/navigation, Forms access/settings/deletion/
  integrations/runtime and full quality/device/manual/visual/storage/hosted
  acceptance remain open. See `FORM_RESPONSE_READ_RECOVERY.md`.

### Scoped private response attachment authorization — 2026-11-06

- Explicit authorization exposes a bounded download link; delayed reads never
  open files automatically. Account/role/form/response/file-list/permission,
  session and offline changes cancel/clear private links. URL/TTL validation,
  request-start expiry, click-time checks and no-referrer new-tab activation
  protect downloads. Background expiry/connection notices preserve keyboard focus.
- All 95 focused client/server checks pass (36 new attachment regressions).
  All 66 attachment/history/shared-workspace production-browser cases pass across
  six profiles, with measured axe and late-close/expiry/denial coverage. Mobile
  authorized state inspected. No real file opened/downloaded, worker/provider,
  publication/response, existing chapter or production change. Actual storage/
  scanner/CORS/device/hosted acceptance remains separate.
- Build/types/lint (zero errors/25 warnings), byte budgets, secrets/traceability
  pass. All 1,744 tests/175 files pass. Coverage remains below 70%: 66.19% lines,
  65.93% branches, 64.42% statements and 57.42% functions. All 17 critical branch
  gates pass; no timeout or threshold changed.
- Catalog stays 159 unverified cases. Remaining response inventory/summary/views/
  exports/mutations, Forms access/settings/deletion/integrations/runtime and full
  quality/device/manual/visual/storage/hosted acceptance remain open. See
  `FORM_RESPONSE_FILE_RECOVERY.md`.

### Private response-history recovery — 2026-11-06

- Revision inventory and selected answers now recover independently, retaining
  timestamped matching snapshots on outages. Denial clears both and requires
  explicit recheck; account/role/form/response/sensitive changes cancel and clear
  old contexts. Returning to masking clears revealed values even offline without
  automatic reconnect reads. Fresh redaction/revision metadata invalidates answers.
- All 46 focused cases pass (24 new). All 24 actual loopback API/DB/desktop-mobile
  checks pass, with measured populated axe, masking/audit and unchanged response/
  form revisions. Two fictional internal forms each have one intended response/edit;
  their two metadata jobs are disabled without workers. Forms archived/accounts
  disabled/sessions revoked. No provider send/existing chapter/production change.
- Build/types/lint (zero errors/25 warnings), byte budgets, secrets/traceability
  pass. All 54 history/shared-workspace production-browser cases and all six
  refined history-capture cases pass across six profiles. Captures inspected,
  unapproved; no manual/real-device/hosted sign-off.
- All 1,708 tests/174 files pass. Global 70% coverage still fails: 66.01% lines,
  65.82% branches, 64.25% statements and 57.28% functions; all 17 critical branch
  gates pass. No threshold/timeout changed. Catalog stays 159 unverified cases.
- Remaining response inventory/summary/views/exports/files/mutations, Forms access/
  settings/deletion/integrations/runtime and complete quality/device/manual/
  visual/hosted acceptance stay open. See `FORM_RESPONSE_HISTORY_RECOVERY.md`.

### Archived Forms read-only inspection — 2026-11-06

- Archived status independently gates draft editing, autosave and publication,
  including retained local proposals and action-time checks. Saved preview,
  immutable history and fields/settings inspection stay available; preview cannot
  submit. Restoring a private draft is required before further authoring.
- All 54 focused cases pass (three new regressions); all 16 actual loopback
  API/DB/desktop-mobile cases pass, with measured axe and unchanged draft/version/
  availability and zero responses. Only fresh fictional internal forms were
  published once then archived; actors disabled/sessions revoked. No worker,
  provider send, existing chapter or production change.
- Build/types/lint (zero errors/25 warnings), byte budgets, secret scan and
  traceability pass. All 54 archived/shared-workspace production-browser cases
  pass across six profiles (`phase0/form-archived-workspace-browser.json`).
- All 1,684 tests/173 files pass. Global 70% coverage remains red: 65.79% lines,
  65.52% branches, 63.94% statements and 56.85% functions. All 17 individual
  critical branch gates pass. No timeout or threshold changed.
- Remaining Forms child/access/settings/deletion, response/integration/runtime
  recovery and full quality/device/manual/visual/hosted acceptance remain open.
  Catalog stays 159 unverified cases. See `FORM_ARCHIVED_VIEW.md`.

### Atomic form-library write recovery — 2026-11-06

- Migration 119 adds current-authority atomic create/copy/archive/restore/state
  receipts and read-only reconciliation. Copies bind an expected source revision
  and derive content/provenance under lock. Routes require original request keys;
  malformed results stay unconfirmed. Frozen normalized packets, 47-hour explicit
  retries, duplicate/availability reviews, offline cancellation, denial clearing
  and reviewed abandonment prevent accidental replacement or repeated actions.
- All 140 focused tests across eight files pass (55 new client/server cases).
  Complete 119-migration clean/legacy-grant suites (213/214 checks), both 100-client
  races and six restore checks pass; migration applied locally. All 58 actual
  API/DB/desktop-mobile checks pass, including ten concurrent creates/copies and
  all before/after-acceptance mutations with one result/audit and measured axe.
  Two intended source publications use internal access; created/copied forms stay
  private drafts. Fixtures archived/accounts disabled/sessions revoked. No
  responses, worker/provider sends, existing chapter or production changes.
- Build/types/lint (25 existing warnings), byte budgets, secret scan and
  traceability pass. All 114 library write/read/shared-workspace production-browser
  cases pass across six profiles (`phase0/form-library-write-workspace-browser.json`).
- All 1,681 tests/173 files pass. Coverage still fails 70%: 65.76% lines/65.48%
  branches/63.91% statements/56.82% functions; all 17 critical branch gates pass.
  No threshold or timeout changed.
- Archived-editor read-only presentation, remaining Forms child/access/settings/
  deletion and response/integration/runtime recovery and full quality/device/
  manual/visual/hosted acceptance remain open. Source review confirms collaborator/
  private-link lifecycle concurrency/replay and settings/deletion outcome handling
  need further work beyond their earlier read/consequence/feature checkpoints.
  Catalog: 159 unverified cases. See `FORM_LIBRARY_MUTATION_RECOVERY.md`.

### Form library private read recovery — 2026-11-05

- Timestamped matching inventory survives temporary failure; actions pause on
  failed/loading/offline reads. First failure remains distinct from empty data.
  Denial clears rows, reviews, proposed titles and private filters, remaining
  blocked across filter clearing until explicit access retry. Scoped reload/
  cancellation and focus guards reject obsolete account/filter/unmounted work.
- Opening creation checks current authority. Proposed titles survive temporary
  failure and remain navigation guarded after closing the dialog; a confirmed
  creation clears its draft and authorizes its own editor navigation. Inventory
  horizontal scrolling is named/keyboard focusable; read feedback spacing refined.
- All 61 focused cases across four files pass (17 new cases). Both owned live
  API/DB/desktop-mobile runs pass 16 checks, with measured populated axe, paused
  writes, retained input, denial clearing and unchanged form revision/audit.
  Browser writes/external requests blocked; inventory search forced to only the
  owned fictional form. Forms archived/accounts disabled/sessions revoked. No
  publication/response/provider/worker/production change. Catalog: 159 unverified
  cases. See `FORM_LIBRARY_READ_RECOVERY.md`; atomic library writes, response/
  integration/runtime recovery and full quality/device/manual/hosted acceptance
  remain open.

- All 1,626 tests/171 files pass. Global coverage still fails 70%: 65.52% lines,
  65.31% branches, 63.73% statements and 56.66% functions; all 17 critical branch
  gates pass. Build/types/lint (25 existing warnings), byte budgets, secret scan
  and traceability pass. All 54 production-browser library/shared-workspace cases
  pass across six profiles (`phase0/form-library-read-workspace-browser.json`).

### Atomic Forms draft/publication recovery — 2026-11-05

- Migration 118 adds current-session/action atomic receipts with ID/revision-only
  storage and read-only outcome inspection. Accepted saves/publications replay
  without duplicate revisions/versions/audit, including publication reconciliation
  after a newer invalid draft. Original normalized body/key/revision, explicit
  retry and 47-hour bounds protect uncertain writes; autosave stays paused.
- Proposed edits survive reconciliation. Explicit reviewed loading or confirmed
  autosave resumption names the consequences. Publish-only collaborators can
  publish unchanged saved questions; unconfirmed publication guards navigation/
  reload even without an unsaved draft. Scope/offline/denial fences remain.
- Both complete 118-migration SQL/legacy-grant suites, both 100-client races and
  six restore checks pass. All 18 actual API/DB/desktop-mobile checks pass, with
  ten concurrent identical saves/publications, exact retries, measured axe and
  audit/version deduplication. Fresh fictional internal forms archived/accounts
  disabled/sessions revoked; no responses/worker/provider/production change.
- All 78 authoring/builder/shared workspace production-browser checks pass across
  six profiles. Final copy refinements remove stale error feedback after success.
  Catalog: 158 unverified cases. Library create/duplicate/availability replay,
  response/runtime/integration recovery and complete quality/device/manual/
  visual/hosted acceptance remain open. See `FORM_AUTHORING_RECOVERY.md`.
- All 1,609 tests/170 files pass (64 focused, 32 new cases). Coverage still fails
  the global 70% gate: 65.35% lines/65.13% branches/63.57% statements/56.49%
  functions; all 17 critical branch gates pass. No threshold or timeout changed.
- Final build/types/lint, byte budgets, secret scan and traceability pass. All 24
  authoring browser cases pass again after success/error copy refinement
  (`phase0/form-authoring-final-browser.json`). No visual/manual/hosted sign-off.

### Saved Forms reads and builder scope isolation — 2026-11-05

- Saved-definition reads now retain timestamped matching snapshots and clear on
  denial/session replacement. Builder/response account-role-session-form remounts,
  cancelable queued autosave/publication, pending latches and late read/write/focus
  fences prevent old contexts from changing current editors. Read/offline/stale
  states pause edits, retained draft loading requires a consequence review and
  validation failures remain editable. Unknown writes pause pending atomic recovery.
- All 1,577 tests/168 files pass (42 focused, 20 new cases). Coverage still fails
  70%: 65.08% lines/64.86% branches/63.32% statements/56.40% functions; all 17
  critical branch gates pass. All 16 actual API/DB/desktop-mobile checks pass,
  including one accepted-but-lost save per private form, read-only review/loading,
  retained input and denial clearing. Measured axe caught field help at 4.26:1;
  its existing secondary-text token correction passes the final live checks.
- Build/types/lint, entry byte budgets, secret scan and traceability pass. All 54
  production-build builder/shared-workspace browser checks pass across six
  profiles (`phase0/form-builder-scope-workspace-browser.json`); these are not
  human visual approval or real-device/manual acceptance.
- Owned private forms archived/accounts disabled/sessions revoked; no publication,
  response/provider send/worker or existing chapter/production change. Catalog:
  157 unverified cases. Atomic builder/library draft/publication replay and full
  response/runtime/integration/navigation plus quality/device/manual/visual/hosted
  acceptance remain open. See `FORM_BUILDER_READ_SCOPE.md`; full PRD remains open.

### Event-mail approval reconciliation and private sender history — 2026-11-05

- Migration 117 adds current-session/event/review/key receipt/readiness lookup.
  Accepted lost approvals reconcile read-only even after review expiry/purge.
  Unaccepted approvals require exact ready review, fresh proof and explicit
  immutable retry. Scoped cancellation, denial clearing, action-time expiry,
  47-hour cutoff, offline rechecking and reviewed abandonment protect the panel.
  Current-sender paginated queued history now has independent private read recovery.
- All 1,557 tests/167 files pass (46 new mail cases; 52 focused mail checks).
  Coverage still fails 70%: 64.75% lines/64.68% branches/63.02% statements/56.00%
  functions; all 17 critical branch gates pass. Complete 117-migration SQL/legacy-
  grant suites (209/210 checks), both 100-client races and six restore checks pass.
- All 19 actual API/DB/desktop-mobile checks pass, including measured review axe,
  expiry receipt reconciliation without another POST, exact fresh-proof retry and
  accessible private history. Four fictional messages/jobs created; jobs disabled,
  reviews expired, events/registration archived, credentials retired/accounts
  disabled/sessions revoked; immutable audit retained. No worker/provider send or
  existing chapter/production record change. Interrupted probe fixture inspected
  and recovered; see `EVENT_MAIL_RECOVERY.md` for failed-probe corrections.
- Catalog: 156 unverified cases. Remaining Forms/builder/runtime/navigation and
  quality/device/manual/visual/hosted acceptance remain open. Full PRD remains open.
- Types/lint (zero errors/25 warnings), build/budgets/secrets/traceability pass.
  All 96 targeted production-build mail/team/shared-workspace checks pass across
  six pinned profiles, including both approval-loss cases and private history.
  Captures remain unapproved review candidates.

### Atomic team announcement writes and typed publication reviews — 2026-11-05

- Migration 116 adds current-authority atomic draft/lifecycle/pin/read receipts
  and exact private record/title reads. Lifecycle and published-edit saves require
  typed current titles on UI/server/SQL. Reviews show original/proposed content,
  settings and return-to-draft consequences. Scoped pending guards, immutable
  bounded retries, exact read-only rechecking, denial clearing and reviewed
  uncertainty abandonment protect writes; filtered empty views have reset actions.
- All 1,511 tests/165 files pass (72 focused, 41 new cases). Coverage still fails
  70%: 64.29% lines/64.32% branches/62.59% statements/55.68% functions; all 17
  critical branch gates pass. Complete 116-migration SQL/legacy-grant suites
  (207/208 checks), both 100-client races and six isolated restore checks pass.
- All 34 actual API/DB/desktop-mobile checks pass: concurrent creates/publications
  and lost published-edit/publication/archive receipts commit once. Archive replay
  works after current-view removal; populated long-review axe passes. Fixture jobs
  disabled/secrets cleared, posts/teams archived/accounts disabled/sessions revoked.
  No worker/provider sends or existing chapter/production records changed.
- Catalog: 155 unverified cases. Complete event-mail and remaining Forms/runtime/
  navigation recovery plus role/device/manual/visual/hosted acceptance remain open.
  See `TEAM_ANNOUNCEMENT_MUTATION_RECOVERY.md`; full PRD remains open.
- Types/lint (zero errors/25 warnings), build/budgets/secrets/traceability pass.
  All 84 targeted production-build announcement/invitation/team-review/child-read/
  shared-workspace checks pass across six pinned profiles, including long unbroken
  titles/content. Final sequential coverage confirms the same results; captures
  remain unapproved review candidates.

### Reviewed invitation changes and atomic link replay — 2026-11-05

- Migration 115 adds current-session/password/team/target-bound create/resend/
  revoke receipts. Exact private ID/recipient reads support read-only reconciliation.
  Recipient/role/consequence reviews, pending guards, named focus recovery, inline
  proof correction and bounded fresh-password identical retries protect writes.
  Uncertain abandonment and stale-action closing require reviewed consequences.
- All 1,470 tests/163 files pass (57 focused, 30 new cases). Coverage still fails
  70%: 63.88% lines/63.79% branches/62.21% statements/55.35% functions; all 17
  critical branch gates pass. Complete 115-migration SQL/legacy-grant suites
  (205/206 checks), both 100-client races and six isolated restore checks pass.
- All 20 actual API/DB/desktop-mobile checks pass: concurrent creates and lost
  resend receipts produce one accepted mutation/job/audit each; revoke replay
  runs once. Measured review axe passes. Fixture jobs disabled/secrets cleared,
  invitations cancelled/team archived/accounts disabled/sessions revoked; no
  delivery worker/provider send or existing chapter record change.
- Catalog: 154 unverified cases. Announcement mutation recovery and full
  role/device/manual/visual/provider/hosted acceptance remain open. See
  `INVITATION_MUTATION_RECOVERY.md`; full PRD remains open.
- Types/lint (zero errors/25 warnings), build/budgets/secrets/traceability pass.
  All 78 targeted production-build invitation/child-read/team-review/shared-
  workspace checks pass across six pinned profiles; captures remain unapproved.

### Independent invitation and announcement reads — 2026-11-05

- Child reads now retain timestamped matching rows/drafts through temporary
  failures and pause writes. Denial/session replacement clears private input;
  team replacement cancels transport and fences late responses. Current capability
  and row revisions gate writes; page/filter/cancel actions review unsaved input.
  Read-only retry restores named panel focus; invitation history is keyboard-scrollable.
- All 1,440 tests/161 files pass (64 focused, 24 new cases). Coverage still fails
  70%: 63.58% lines/63.44% branches/61.94% statements/55.19% functions; all 17
  critical branch gates pass. All 30 actual API/DB/desktop-mobile checks pass,
  including populated axe, preserved drafts and denial clearing. Owned rows stayed
  unchanged before cleanup; no delivery jobs/provider sends/existing chapter changes.
- Catalog: 153 unverified cases. Child atomic mutation replay, uncertain-write/
  consequence recovery and full supported-role/device/manual/visual/hosted
  acceptance remain open. See `TEAM_CHILD_READ_RECOVERY.md`; full PRD remains open.
- Types/lint (zero errors/25 warnings), build/final budgets/secrets/traceability
  pass. All 72 targeted production-build child-read/team-review/shared-workspace
  checks pass across six pinned profiles; captures remain unapproved candidates.

### Reviewed team writes and atomic membership replay — 2026-11-05

- Migration 114 binds team mutation receipts to current session/password/action,
  target hierarchy and transfer-destination authority. Replay reprojects current
  authorized data. Named reviews show exact grant sets and member/transfer/lifecycle
  consequences; pending guards, fresh-proof explicit uncertain retry, read-only
  recheck, stale revision review and a 47-hour cutoff protect writes.
- All 1,416 tests/160 files pass (52 focused, 30 new cases). Coverage still fails
  70%: 63.37% lines/63.02% branches/61.73% statements/54.78% functions; all 17
  critical branch gates pass. The initial resource-contention import-graph timeout
  is absent in the clean sequential rerun. Thresholds/timeouts were not changed.
- All 33 actual API/DB/desktop-mobile checks pass: concurrent creates and lost
  edit/transfer receipts produce one accepted mutation each. Populated review axe
  passes. Owned fixtures archived/accounts disabled/sessions revoked; no existing
  chapter records/provider sends changed. Complete SQL/legacy-grant suites, both
  100-client races and six isolated restore checks pass.
- Catalog: 152 unverified cases. Complete invitation/announcement recovery and
  supported-browser/role/device/manual/visual/hosted acceptance remain open.
  See `TEAM_MUTATION_RECOVERY.md`; full PRD remains open.
- Types/lint (zero errors/25 warnings), build/budgets/secrets/traceability pass.
  All 60 targeted production-build team-review/shared-workspace browser checks
  pass across six pinned profiles; screenshots remain unapproved candidates.

### Independent team workspace reads — 2026-11-05

- Team inventory/detail/history/transfer destinations now read independently,
  retain timestamped matching snapshots and cancel/hide replaced keys. Denial
  clears private team/member/editor state; account/role/session/route replacement
  resets it. Stale team/member revisions and destination reads block saves.
  Parent outages pause mounted invitation/announcement drafts without losing input.
- All 1,386 tests/158 files pass (22 new focused cases). Coverage still fails 70%:
  62.89% lines/62.57% branches; all 17 critical-file branch gates pass. All 28
  actual API/DB/desktop-mobile browser checks pass, including populated transfer
  axe. Team/memberships unchanged before owned teams archived/accounts disabled/
  sessions revoked. Existing records/providers untouched. Catalog: 151 unverified cases.
- Team mutation replay/reviews/uncertain recovery, complete invitation/announcement
  recovery and full supported-browser/role/device/manual/visual/hosted acceptance
  remain open. See `TEAM_READ_RECOVERY.md`; full PRD remains open.
- Types/lint (zero errors/25 warnings), build/budgets/secrets and traceability
  pass. All 48 targeted production-build workspace checks pass across six pinned
  profiles; captures remain unapproved review candidates.

### Reviewed account writes and atomic setup-link replay — 2026-11-05

- Migration 113 adds current-session/password/hierarchy-bound account receipts
  without storing password proof or token material. It also fixes an existing
  double revision increment found by the new SQL tests. Account creation/reset
  replay creates one capability/job/audit. Selected-account reads preserve stale
  drafts until reviewed loading; current revisions invalidate approval. Pending
  guards/cancellation, named consequence reviews, fresh-proof explicit uncertain
  retries and a 47-hour cutoff protect account writes and internal cancellation.
- All 1,364 tests/156 files pass (50 focused; 21 new cases), including actual
  submitter-focus regression. Full-tree coverage (including in-progress Teams
  source) still fails 70%: 61.72% lines/60.73% branches; all 17 critical-file branch gates pass.
  Complete 113-migration SQL suites pass under both grant modes (201/202 checks),
  both 100-client races and all six isolated restore checks pass.
- All 28 actual API/DB/desktop-mobile browser checks pass, including ten identical
  concurrent creates and accepted-but-lost updates. Populated review axe passes.
  Owned jobs marked dead/secrets cleared, capabilities revoked, accounts disabled
  and sessions revoked. No worker/provider send or existing account/session change.
- Catalog: 150 unverified cases. Full account-action/role/device/manual/visual/
  hosted acceptance remains open. See `USER_MUTATION_RECOVERY.md`; full PRD remains open.
- Types/lint (zero errors/25 warnings), build/budgets and traceability pass. A
  WebKit focus-return defect found by the first browser run is corrected. All
  48 final production-build account/shared-workspace checks pass across six
  pinned profiles; actual development WebKit checks pass separately.

### Account-directory and selected-account session reads — 2026-11-05

- Keyed independent directory/session reads cancel and hide replaced queries,
  retain timestamped matching snapshots on temporary failure and clear all
  private rows/editor credentials on denial. Context replacement remounts state.
  Stale/offline reads disable account changes; unsaved editor fields survive
  transient reads. Session retry, focus return, filter reset and named keyboard
  table access are covered. Account-write recovery remains separate work.
- All 1,343 tests/155 files pass (16 new cases). Coverage still fails 70%:
  61.52% lines/60.87% branches; all 17 critical-file branch gates pass. All 21
  actual API/DB/desktop-mobile browser checks pass, including populated measured
  axe. Fictional accounts disabled/sessions revoked; target unchanged before
  cleanup. No setup/reset mail or existing account/session change.
- Catalog: 149 unverified cases. Account-write/selected-record revision recovery
  and broader browser/role/manual/device/visual/hosted acceptance remain open.
  See `USER_READ_RECOVERY.md`; full PRD remains open.
- Types/lint (zero errors/25 warnings), build/budgets/secrets and traceability
  pass. The complete production-build browser matrix passes 112 applicable
  checks with eight expected profile skips. Captures remain unapproved candidates.

### Overview private reads and widget retry — 2026-11-05

- Cancellable overview reads and account/role/session remounts fence private
  widgets. Denial clears the snapshot; transient/offline recovery retains its
  date and removes stale quick actions. Failed widgets expose named retries;
  other ready panels remain visible. Reconnect sends no automatic read/write.
- All 1,327 tests/154 files pass (20 focused, 12 new). Coverage still fails 70%:
  61.15% lines/60.44% branches; all 17 critical-file branch gates pass. All 18
  actual API/DB/desktop-mobile browser checks pass, including populated measured
  axe. Owned task archived/accounts disabled/sessions revoked; existing records
  and providers unchanged. Catalog: 148 unverified cases.
- Full supported-browser/role/device/manual/visual/performance/hosted acceptance
  remains open. See `OVERVIEW_READ_RECOVERY.md`; full PRD remains open.
- Types/lint (zero errors/25 warnings), build/budgets/secrets and traceability
  pass. All 36 targeted production-build workspace browser checks pass across six
  pinned profiles; captures remain unapproved review candidates.

### Audit history and entry read recovery — 2026-11-05

- Independent keyed history/detail reads retain timestamped matching snapshots,
  expose explicit retry and clear both private inventories on denial. Context
  replacement cancels old reads; filters/cursors/entries hide previous snapshots.
  Stale/offline export and history actions disable. Named table regions,
  independent entry retry, focus recovery and distinct empty states are covered.
- All 1,315 tests/153 files pass (22 focused, 14 new). Coverage still fails 70%:
  61.10% lines/60.33% branches; all 17 critical-file branch gates pass. All 23
  actual API/DB/desktop-mobile browser checks pass, including populated measured
  axe checks. Fictional accounts disabled/sessions revoked; append-only fixture
  retained unchanged. No existing account/record or real provider change.
- Catalog: 147 unverified cases. Supported-browser/role/device/manual/visual and
  hosted acceptance remain open. See `AUDIT_READ_RECOVERY.md`; full PRD remains open.
- Types/lint (zero errors/25 warnings), build/budgets/secrets and traceability
  pass. All 30 targeted production-build workspace browser checks pass across six
  pinned profiles; captures remain unapproved review candidates.

### Events writes, consequence reviews and bounded replay — 2026-11-05

- Migration 112 adds current-session/grant-bound atomic event/attendee receipts,
  current action/create-destination projections and attendee timestamp conflicts.
  Scoped pending/cancellation guards, explicit read-only recovery, identical
  replay and a 47-hour client retry cutoff protect ambiguous writes. Named
  lifecycle/removal/public-save reviews retain current revisions; cancellation
  and archive require the target slug. Attendee edits use explicit saves and
  navigation guards. Parent read/offline recovery preserves open mail drafts.
- All 1,301 tests/152 files pass (59 focused; 41 new cases). The first full run
  caught a denial-recheck cleanup race; the corrected full rerun passes without
  relaxed timeouts/thresholds. Coverage still fails 70%: 61.03% lines/60.24%
  branches; all 17 critical-file branch gates pass.
- Complete SQL suites pass under both grant modes (199/200 checks), including
  both 100-client races; all six isolated restore checks pass. All 39 real
  API/DB/desktop-mobile browser checks pass, including ten simultaneous creates,
  ten duplicates and four accepted-but-lost writes replayed without duplicate
  revision/audit. Populated editor/review/attendee axe checks pass. Fixtures
  cleaned up; no real provider send or existing record change.
- Catalog: 146 unverified cases. Complete event-mail recovery and broader
  browser/role/device/manual/visual/performance/hosted acceptance remain open.
  See `EVENT_MUTATION_RECOVERY.md`; full PRD remains open.
- Types/lint (zero errors/25 warnings), build/budgets/secrets pass. The complete
  pinned production-build browser matrix passes 94 applicable checks with eight
  expected profile skips. Captures remain unapproved review candidates.

### Independent private Events read recovery — 2026-11-05

- Separate inventory/detail/attendee reads now expose scoped loading/retry,
  timestamped stale snapshots, permission-denial clearing and account/session
  cancellation. A changed event revision retains unsaved fields and requires
  review before loading saved values. Stale attendee actions are disabled.
- All 1,260 tests/149 files pass, including 18 new read cases (44 focused Events
  cases). All 19 actual local API/DB and desktop/mobile browser checks pass with
  confirmed fixture cleanup. Coverage still fails 70%: 60.22% lines/59.31%
  branches; all 17 critical-file branch gates pass.
- All 24 targeted production-build workspace browser checks pass across six
  pinned profiles. Types/lint (zero errors/25 warnings), build/budgets/secrets
  pass. Screenshots remain unapproved review candidates.
- Catalog: 145 unverified cases. Event writes, permissions, consequence reviews
  and attendee/navigation handling remain separate work; full browser/manual,
  visual, performance and hosted acceptance remain open. See
  `EVENT_READ_RECOVERY.md`; full PRD remains open.

### Own-profile saves, password validation and session consequence reviews — 2026-11-05

- Scoped cancellable writes, synchronous pending/input guards and explicit
  confirmed-versus-uncertain recovery now protect profile/security changes.
  Current saved values can be compared with retained drafts after read-only
  recovery. Other-session revocation names its target/consequences and rechecks
  current inventory. Wrong current password is field validation, preserving a
  valid session; actual expiry/revocation still rejects authentication.
- All 1,242 tests/148 files pass (46 focused/18 new mutation cases), along with
  15 actual API/DB and 18 actual desktop/mobile browser checks. Fixtures cleaned
  up; no existing account, bootstrap password or unrelated session changed.
  Coverage still fails 70%: 59.68% lines/58.60% branches; all 17 critical-file
  branch gates pass. Types/lint pass (zero errors/25 warnings).
- All 18 targeted shared-workspace production browser checks pass after the
  changes; full-suite evidence remains separate. Build/budgets/secrets pass.
- Catalog: 144 unverified cases. Full browser interruption/role matrix, manual
  accessibility/device/zoom, visual and hosted acceptance remain open. See
  `PROFILE_MUTATION_RECOVERY.md`; full PRD remains open.

### Workspace browser contrast and keyboard-table recovery — 2026-11-05

- Corrected measured topbar/action/Forms label contrast with existing neutral
  tokens and admin coral. Named focusable table regions now provide horizontal
  keyboard scrolling without intercepting nested controls. Private browser
  artifacts reject through Vite's direct and filesystem paths (HTTP 403).
- All 93 real authenticated loopback checks pass across 31 default workspace
  routes/states and three viewports. No page errors, failed reads, overflow,
  scrolling or axe violations. Probe fixtures archived/account disabled/sessions
  revoked; no existing chapter data was changed. Focused keyboard/profile/widget
  tests pass (18 cases). All 1,224 tests/147 files and 88 applicable browser
  checks pass (eight explicit profile skips). Coverage still fails 70%:
  59.31% lines/58.33% branches; all 17 critical-file branch gates pass.
- Saved loopback bootstrap account recovered only after confirming zero active
  accounts/sessions; existing saved credentials/gate retained. All 16 actual auth
  checks pass. No existing account/password, provider or production changes.
- Catalog: 143 unverified cases. Initial/default views do not close populated,
  mutation, role, dialog, device/manual, visual, performance or hosted gates.
  See `WORKSPACE_BROWSER_ACCESSIBILITY.md`; full PRD remains open.

### Public production-build and live browser verification — 2026-11-04

- Pinned Playwright 1.64.1 now covers six Chromium/Firefox/WebKit desktop/mobile
  profiles. All 70 applicable checks pass, with eight explicit profile skips.
  Checks include contrast-enabled axe, real scroll/overflow, keyboard top-menu
  recovery, anonymous private-route refusal, retry/404 and actual moving WebGL
  frames with reduced-motion restoration. Captures remain unapproved candidates.
- Actual local UI/API checks pass separately: 21 public page/viewport cases and
  six hero enhancement/fallback cases. No mutations or external/provider calls.
  All 1,222 Vitest tests pass again; types/lint (zero errors/25 warnings), build,
  budgets, traceability and secret scan pass. Coverage remains below 70% at the
  previous instrumented result: 59.29% lines/58.30% branches; 17 critical gates
  pass. No high/critical current dependency findings.
- PR CI now includes the matching digest-pinned browser container and retained
  reports, but no GitHub execution is claimed. Catalog: 142 unverified cases.
  Full private/Forms/device/manual/visual/performance/hosted gates remain open.
  See `BROWSER_VERIFICATION.md`; full PRD remains open.

### Form access inventories and consequence reviews — 2026-11-04

- Forward migration 111 adds authorized literal search/count/paging without the
  100-account or fetched-membership cutoff. Stored grants can be removed after
  recipient deactivation/departure, while new grants retain current eligibility.
  Independent reads, account/form/session cancellation, explicit access reviews,
  pending guards and read-only uncertain-result rechecks protect the workspace.
- All 1,222 tests/146 files pass, including 25 new DOM cases. Both complete SQL
  grant configurations pass (197/198 checks), as do six isolated restore checks
  and 27 real local inventory/grant checks with confirmed fixture cleanup.
  Types/lint pass (zero errors/25 warnings). Coverage still fails 70%:
  59.29% lines/58.30% branches; all 17 critical branch gates pass.
- Catalog: 141 unverified cases. Broader Forms mutations, browser/device/visual
  and hosted acceptance remain open. See `FORM_ACCESS_RECOVERY.md`; full PRD
  remains open.

### Form availability reviews and settings read retry — 2026-11-04

- Archive/restore/close/reopen now use named consequence reviews and fresh
  inventory/grant/revision checks. Pending confirmations freeze synchronously;
  failures remain reviewable, offline reconnect sends no write and session
  clearing resets private library state. Delivery/retention initial reads have
  loading, error and explicit read-only retry controls.
- All 1,197 tests/145 files pass; 53 focused Forms tests and 25 actual local
  library/settings checks pass. Probe fixtures cleaned up. Coverage still fails
  70%: 58.91% lines/57.78% branches; all 17 critical branch gates pass. Types/lint
  pass (zero errors/25 warnings). Catalog: 140 unverified cases.
- Access revocation reviews, candidate paging, broader Forms mutations and
  browser/device/visual/hosted acceptance remain open. See
  `FORM_AVAILABILITY_RECOVERY.md`; full PRD remains open.

### Own-profile independent session/activity reads — 2026-11-04

- Replaced swallowed read failures with independent loading/error/retry/stale
  snapshots. Denial clears private rows; stale/offline session inventory cannot
  drive revocation. Account/role/session remounts and read cancellation prevent
  old results/inputs carrying across context changes.
- All 1,180 tests/143 files pass on the clean rerun; eight new DOM cases and
  seven actual local API checks pass. Probe account disabled/sessions revoked.
  Global coverage remains below 70%: 58.47% lines/57.21% branches; all 17 critical
  branch gates pass. Types/lint remain passing (0 errors/25 warnings).
- Profile mutation recovery, browser interruption/visual, device/screen-reader
  and hosted acceptance remain open. Catalog: 138 unverified cases. See
  `PROFILE_READ_RECOVERY.md`; full PRD remains open.

### Public-content collection editor recovery — 2026-11-04

- Independent permission/inventory/detail reads, scoped cancellation and
  account/role/session/collection isolation protect resources, sponsors and team
  profiles. Current revisions/grants preserve stale drafts and block invalid
  saves. Synchronous write guards, stable retries, explicit visibility reviews,
  offline behavior and semantic focus are covered.
- All 1,172 tests/142 files pass (23 focused collection cases). Global coverage
  remains below 70%: 58.30% lines/56.97% branches; all 17 critical branch gates
  pass. Types/lint (0 errors/25 warnings), build/budgets/secrets pass.
- All 25 actual local API/DB checks pass and fixture cleanup is confirmed. Local
  services restored. Browser automation unavailable; live browser interruption,
  device/screen-reader/visual and hosted acceptance are not claimed. Catalog:
  137 unverified cases. See `COLLECTION_RECOVERY.md`; full PRD remains open.

### Atomic CMS and public-content collection replay — 2026-10-27

- Forward migration 110 adds actor-bound mutation deduplication with current
  session/action/team revalidation and moved-result concealment. CMS/collection
  clients retain unchanged retry keys. Missing/malformed keys and identity
  injection reject. CMS can explicitly retry uncertain saves without duplicates.
- Seven route/two collection cases supplement CMS checks. All 1,151 tests/141
  files pass; coverage remains below 70% at 58.01% lines/56.40% branches. All 17
  critical branch gates pass; types/lint (0 errors/25 warnings), build/budgets/
  secrets pass. Complete 110-migration SQL suites pass under both grant modes;
  all six isolated backup/restore checks pass. Migration applied only locally.
- Eighteen real recovery checks include ten simultaneous identical CMS creates
  yielding one record/audit; 23 broader collection checks pass. Fixtures archived,
  fictional sessions revoked, no external send/production change. Catalog: 136
  unverified cases. See `CURATED_CONTENT_RETRIES.md`; full PRD remains open.

### CMS independent reads, review and composition recovery — 2026-10-27

- Account/session remounts and keyed reads protect CMS inventory, permissions,
  selected content and private previews. Current grants/revisions block stale
  saves; private writes cancel/fence and freeze synchronously. Every visibility
  transition has review. Uncertain saves preserve input and block blind retry;
  server mutation replay deduplication remains an explicit implementation gap.
- Twenty-two DOM cases include two axe audits. All 1,142 tests/139 files pass;
  coverage remains below 70% at 57.46% lines/55.85% branches. All 17 critical branch
  gates pass; types/lint (0 errors/25 warnings), build/budgets/secrets pass.
- Eleven real loopback checks pass with a fresh private navigation draft/officer.
  Existing managed copy/roles untouched; draft archived/account disabled/sessions
  revoked. Composition tests use controlled adapters, not full visual acceptance.
  Catalog: 135 unverified cases. See `CMS_RECOVERY.md`; full PRD remains open.

### Site availability recovery and hidden-entry disclosure removal — 2026-10-27

- Keyed private reads retain timestamped snapshots and drafts on temporary failure;
  denied access clears state. Synchronous pending guards/cancellation, exact mode,
  current grants/revisions and stable password-free retry identity protect writes.
  Offline drafts stay unsent; editor/error/receipt focus is covered.
- Seventeen interaction cases include two axe audits. All 1,120 tests/138 files
  pass; coverage remains below 70% at 56.61% lines/54.79% branches. All 17 critical
  branch gates pass; types/lint (0 errors/25 warnings), build/budgets/secrets pass.
- Twenty-one actual checks pass; exact original local availability restored,
  fixtures archived/sessions revoked/ledger removed. Browser confirms no public
  entry instructions and bounded 375 px maintenance layout. Private browser input
  and screenshot timed out; those acceptances are not claimed. Public hints removed
  from all four identified surfaces. Catalog: 134 unverified logical cases.
  See `SITE_STATUS_RECOVERY.md`; full PRD remains open.

### Newsletter reads, draft conflicts and delivery-review recovery — 2026-10-27

- Independent scoped reads, account/session isolation and cancelled private work
  protect newsletter state. Current record refresh preserves draft input and
  blocks stale saves. Exact confirmation/expiry/current grants recheck; selected
  subscriber review detects changed revisions. Delivery review locks the editor
  while preserving a working discard flow; real navigation regressions cover it.
- Thirty-two interaction cases include two axe audits. All 1,103 tests/137 files
  pass; coverage remains below 70% at 56.04% lines/54.39% branches. All 17 critical
  branch gates pass. Types/lint (0 errors/25 warnings), build/budgets/secrets pass.
- Thirty-six actual local SMTP/API/callback checks pass with fixture cleanup and
  session revocation completed. Browser confirms conflict preservation, bounded
  375 px layout, disabled unconfirmed approval and fixed review discard. Final UI
  sign-out/close attachment unavailable, not claimed. Catalog: 133 unverified
  cases. See `NEWSLETTER_RECOVERY.md`; full PRD remains open.

### Private editorial reads, confirmation and file recovery — 2026-10-27

- Independent read recovery, account/session isolation, category choice paging,
  scoped cancellation, synchronous pending guards and unchanged retry keys protect
  Blog workflows. Passwords clear at request start; exact references/current
  grants/revisions recheck. Quarantine/download authorization and overview reads
  suppress late results. Offline drafts stay unsent; feedback receives focus.
- Twenty-six DOM cases include three axe audits. All 1,071 tests/135 files pass;
  coverage remains below 70% at 54.48% lines/52.55% branches. All 17 critical branch
  gates pass; types/lint (0 errors/25 warnings), build/budgets/secrets pass.
- Thirty-five real editorial and 23 real private-file checks pass; fixture
  cleanup/session revocation/ledger removal completed. Browser confirms live
  conflict preservation, bounded 375 px controls and deliberate draft discard.
  Final browser sign-out/close verification lost attachment and is not claimed.
  Screenshot retained; catalog: 132 unverified cases. See `BLOG_RECOVERY.md`.

### Private project reads, editor and participant recovery — 2026-10-27

- Independent permissions/inventory/detail recovery, session isolation, scoped
  cancellation and synchronous write guards now protect project operations.
  Same-revision project navigation clears the former editor; remote updates keep
  input and block stale saves. Retry identity, password handling, current grants,
  confirmation, offline recovery and semantic feedback are covered.
- Eighteen DOM cases include three axe audits. All 1,045 tests/134 files pass;
  global coverage remains below 70% at 52.72% lines/50.72% branches. All 17 critical
  branch gates pass; types/lint (0 errors/25 warnings), build/budgets/secrets pass.
- Twenty-eight actual API checks pass with fixture cleanup completed. Browser
  confirms conflict preservation, bounded 375 px layout, deliberate draft discard
  and sign-out; screenshot retained. Tab closed, viewport reset, ledger removed.
  Catalog: 131 unverified cases. See `PROJECT_RECOVERY.md`; full PRD remains open.

### Media inventory, private operations and publication recovery — 2026-10-27

- Media/gallery account/session state remounts; folder/bulk/metadata/publication/
  capability/upload work uses synchronous pending guards and abortable ownership.
  Unchanged retries remain stable; publication passwords clear immediately and
  exact confirmation/current grants/revisions recheck. Inventory failures, stale
  snapshots, scope reset, event/destination retry and semantic focus improved.
- Twenty-three new DOM cases include three axe audits. All 1,027 tests/133 files
  pass; coverage remains below 70% at 51.69% lines/49.50% branches; all 17 critical
  branch gates pass. Types/lint (0 errors/25 warnings), build/budgets/secrets pass.
- Twelve real folder, 45 real media/scanner/publication and 6 recovery checks pass.
  Browser verifies preserved Stay input, saved-value review, locked approval and
  bounded 375 px layout. No browser publication/upload/download/save occurred.
  Fixture recoverably archived, account disabled/sessions revoked, ledger removed,
  browser signed out/tab closed and viewport reset. Catalog: 130 unverified cases.
  See `MEDIA_RECOVERY.md`; full PRD remains open.

### Finance independent reads and private operation recovery — 2026-10-27

- Permissions, inventory, budgets, reports and detail reads recover independently;
  keyed snapshots hide old scopes and carry stale timestamps. Shared abortable read
  code preserves Linktree behavior. Finance/private attachment writes freeze
  synchronously, abort/fence on context loss and keep unchanged retry keys. Exact
  confirmations, refreshed grants/revisions, note preservation and focus improved.
- Twenty-four new DOM cases include three axe audits; Linktree regressions pass.
  Full suite: 1,004 tests/132 files; types and lint (0 errors/25 warnings) pass.
  Coverage remains below 70% at 49.60% lines/47.22% branches, with all 17 critical
  branch gates passing. Build, byte budgets and secret scan pass.
- Thirty-seven real ledger, 22 real scanner/receipt and 7 draft/revision checks
  pass. Browser confirms exact-amount preservation/stale lock, bounded 375 px
  controls, discard confirmation and sign-out. Owned fixture cancelled/retained,
  account disabled/sessions revoked, ledger removed and viewport reset. Catalog:
  129 unverified cases. See `FINANCE_RECOVERY.md`; full PRD remains open.

### Whiteboard autosave and private-context recovery — 2026-10-27

- Canvas callbacks are bound to board/editor generation; autosave and metadata
  requests abort/fence on private-context loss and retain unchanged retry keys.
  Newer drawing input remains queued behind an accepted save. Fresh action grants
  apply even at an unchanged version; offline autosave waits for an explicit Save.
  Independent read recovery, stale snapshots, scoped export and semantic feedback
  corrected. Passwords clear at request start and protected confirmations recheck.
- Twenty-two DOM cases include three shell/form axe audits using a drawing adapter.
  All 980 tests/131 files pass; coverage remains below 70% at 47.49% lines/44.96%
  branches, with all 17 critical branch gates passing. No thresholds were relaxed.
- Thirty-eight real local HTTP/private-WebSocket checks pass and cleanup completed.
  Browser loads the actual editor, preserves a staged rename on remote save, locks
  confirmation and fits at 375 px; screenshot retained. Owned fixture cleanup,
  sign-out/tab closure, viewport reset and ledger removal completed. Catalog: 128
  unverified cases. See `WHITEBOARD_RECOVERY.md`; full PRD acceptance remains open.

### Announcement draft/publication recovery — 2026-10-27

- Officer/session/selection-bound request guards cancel private work and suppress
  duplicate writes. Preview expiry/exact-title checks run at submit time, passwords
  clear at request start, unchanged retries keep their key and fresh grants/revisions
  block stale edits. Independent read errors, skeletons, retained timestamps,
  filter reset, semantic focus and offline draft behavior improved.
- Twenty new DOM cases include three axe audits. All 958 tests/130 files pass;
  types pass, lint is 0 errors/25 warnings. Coverage remains below 70% at 45.62%
  lines/43.39% branches; all 17 critical branch gates pass.
- Thirty actual loopback HTTP/WebSocket/scheduler/worker/Mailpit checks pass with
  cleanup completed. Browser verifies revision conflict, preserved input and bounded
  375 px controls; screenshot retained. Browser preview activation timed out and is
  not counted as acceptance. Owned fixture cleanup, sign-out/tab closure, viewport
  reset and ledger removal completed. Catalog: 127 unverified cases. See
  `ANNOUNCEMENT_RECOVERY.md`; the full PRD remains open.

### Task interaction and comment-history recovery — 2026-10-27

- Account/session/task-bound pending guards abort/fence late writes, freeze fields
  and retain unchanged retry keys without retaining password signatures. Independent
  read errors, skeletons, stale timestamps, permission refresh and filter reset fixed.
  New revisions preserve input and block stale saves; displayed older comment pages
  refresh authoritative edits/removals. Offline input never auto-submits.
- Nineteen new DOM cases include two structural axe audits. The task checkpoint
  passes 938 tests/129 files, types, lint (0 errors/25 warnings), build, byte budgets
  and secrets. Coverage remains below 70% at 44.06% lines/41.88% branches; all 17
  critical branch gates pass. No thresholds or inclusions were relaxed.
- Fresh loopback task suite: 40 checks and cleanup completed; task privacy: 7 checks.
  Browser confirms live conflict/input preservation and bounded 375 px controls.
  Screenshot capture unavailable; no visual acceptance claimed. Interrupted fixture
  recovery verified separately. Catalog: 126 unverified logical cases. See
  `TASK_RECOVERY.md`; complete PRD acceptance remains open.

### Channel and team-chat interaction recovery — 2026-10-26

- Private context/pending/controller guards fence channel writes and ordered member
  reads; access denial cancels work immediately. Permission/directory/history/member
  failures have independent retry, skeleton and stale states. Pinned reads hide old
  unpinned results; catch-up pages remain ordered. Typed room/create scope gates,
  offline behavior and semantic feedback improved. Live log wraps a native list.
- Eighteen new DOM cases include three axe audits. All 919 tests/128 files pass;
  types pass, lint 0 errors/25 warnings, build/budgets/secrets pass. Coverage remains
  below 70% at 42.54% lines/40.52% branches; all 17 critical branch gates pass.
- Thirty-three channel plus 29 team-chat actual local HTTP/WebSocket checks pass.
  Browser live follow-up preserves an unsent draft; mobile controls fit at 375 px.
  Owned cleanup, sign-out/tab closure, ledger removal and viewport reset completed.
  Catalog: 125 unverified logical cases. See `CHANNEL_RECOVERY.md`; full PRD is open.

### Private conversation request lifecycle — 2026-10-26

- Account/session/thread-bound mutation guards prevent duplicates and fence late
  results; reads and mutations abort on private-context teardown. Review passwords
  clear at request start, background refresh waits for pending operations, feedback
  focuses semantically and offline drafts never auto-submit. Inbox/thread failures
  have truthful independent states, skeletons and retained-history timestamps.
- Fifteen new DOM cases include two axe audits. All 901 tests/127 files pass;
  types pass, lint 0 errors/25 warnings, build/budgets/secrets pass. Global coverage
  remains below 70% at 40.76% lines/38.80% branches; all 17 critical branch gates pass.
- Forty actual local HTTP/WebSocket/database/Mailpit checks pass. Cross-clock
  expiry assertion now checks the exact interval against its database audit;
  isolated fictional review accounts avoid existing account quotas. Browser live
  follow-up preserves an unsent draft and 375 px reply controls fit. Cleanup,
  sign-out/tab closure, ledger removal and viewport reset completed. Catalog: 124
  unverified logical cases. See `DIRECT_MESSAGE_RECOVERY.md`; full PRD remains open.

### Community directory transfer lifecycle — 2026-10-26

- CSV review/import/export/file reads freeze synchronously; passwords clear when
  requests start and failed commits keep their idempotency key. Scope/source
  changes invalidate review, expiry is checked at click time, and session/account
  changes fence late private work. Offline CSVs require a new explicit review.
- Validation/error/review/receipt and modal return focus corrected; export private
  fields default off on every opening. Seventeen new DOM cases include two axe
  audits; all 886 tests/126 files pass. Types pass, lint 0 errors/25 warnings,
  build/byte budgets/secrets pass. Coverage remains below 70% at 39.03% lines/
  37.32% branches; all 17 critical branch gates pass.
- Twenty-two real local API checks pass. Browser verifies parse/review focus,
  default export consent, confirmation lock and bounded scrollable 375 px dialog.
  Owned fixture cleanup, sign-out/tab closure, ledger removal and viewport reset
  completed. Catalog: 123 unverified logical cases. See
  `MEMBER_TRANSFER_RECOVERY.md`; complete PRD acceptance remains open.

### Linktree independent reads and mutation recovery — 2026-10-26

- Capability/inventory/detail/analytics loading and errors are independent, with
  skeletons, explicit retry, matching timestamped stale snapshots and immediate
  filter/profile/period isolation. Denials erase/abort private snapshots across
  views; account/session changes clear drafts and fence late results.
- Writes freeze synchronously, abort/fence on unmount, focus committed feedback
  and check create scope/live confirmation. Offline drafts require explicit
  refresh after reconnect; no autosubmit. Filtered empty/reset behavior fixed.
- Seventeen added DOM cases include three axe structural audits. All 869 tests/
  125 files pass; types pass; lint 0 errors/25 warnings. Coverage remains below
  70% at 38.18% lines/36.65% branches; all 17 critical branch gates pass.
- Thirty-seven actual local HTTP checks, live revision-conflict/input preservation
  and bounded 375 px editor verified. Owned fixtures archived; private ledger
  removed, browser signed out/tab closed and viewport reset. Catalog: 122
  unverified logical cases. See `LINKTREE_READ_RECOVERY.md`; full PRD is open.

### Forms view-only definition and scoped creation — 2026-10-26

- View-only collaborators can open the definition route; editing/dragging remains
  disabled and response/access actions keep independent grants. Migration 109
  projects create and destination-specific duplicate capability. Restricted
  response counts remain restricted, including the library statistic. Section
  ordering/drag Undo and local write/unmount guards corrected.
- All 852 tests/124 files pass, types pass and lint is 0 errors/25 warnings.
  Coverage remains below 70% at 36.79% lines/34.79% branches; all 17 critical
  branch gates pass. Fresh/legacy SQL, capacity races and six restore checks pass
  through migration 109. Eleven actual loopback permission checks pass.
- Browser DOM verifies library/definition/disabled settings and bounded mobile
  inspector. Inconsistent screenshot raster is not counted as visual evidence.
  Owned fixtures archived/accounts disabled, browser signed out and viewport
  reset. Catalog: 121 unverified logical cases. See `FORM_VIEW_PERMISSIONS.md`;
  full PRD acceptance is still open.

### Notification inbox read/dismiss recovery — 2026-10-26

- Read-all → read-only Dismiss all retains newly arrived unread updates. Reads
  are abortable/ordered, writes freeze synchronously, page/account context resets
  safely, permission failure clears private rows and stale network reads carry
  their timestamp. Pending/unmount/error/feedback focus recovery implemented;
  update paths are restricted to safe internal links and actions are named.
- Thirteen new DOM cases plus one notification axe case; all 839 tests/123 files
  pass. Strict types pass; lint is 0 errors/25 warnings. Coverage remains below
  70% at 35.86% lines/33.94% branches; all 17 critical branch gates pass.
- Eight actual local API/database checks pass, including foreign-account/new
  unread preservation and the real fictional browser flow. Mobile dialog fits
  at 375 px. The browser signed out, owned test rows were cleaned and private
  ledger removed; unrelated inboxes were untouched.
- Catalog: 120 unverified logical cases. See `NOTIFICATION_INBOX_RECOVERY.md`;
  full PRD acceptance is still open.

### Axe structural regression checks — 2026-10-26

- Pinned axe-core 4.14.0 adds 18 representative DOM cases to normal tests/CI and
  `test:a11y:structure`. Public empty-state/Contact heading order and builder
  complementary landmark names were corrected with existing visual styles.
- All 825 tests/122 files pass; strict types pass; lint is 0 errors/25 warnings.
  Global coverage is 35.28% lines/33.41% branches, below 70%; all 17 critical-file
  branch gates pass. Fresh audits: production 2 moderate/4 low; full 4 moderate/
  5 low, both zero high/critical. Only the pinned axe dev dependency was added.
- JSDOM contrast is explicitly excluded, and four incomplete axe rules remain
  manual follow-ups. This does not satisfy browser axe, Lighthouse, contrast,
  layout, screen-reader or device acceptance. Native Chrome verifies Contact's
  semantic/visual presentation; no contact submitted and the test tab was closed.
- Catalog: 119 unverified logical cases. See `ACCESSIBILITY_STRUCTURE_CHECKS.md`;
  the complete PRD is still open.

### Protected Forms read/filter recovery — 2026-10-26

- Definition reads are scoped to form/account/role and abort superseded requests.
  Library context changes hide prior rows immediately. Builder/response initial
  failures have skeletons and focused explicit retry/return paths. Response
  table/summary/saved-view reads ignore aborted results.
- Applied and saved filters now appear in response controls; local dates retain
  precision and unchanged DST instants. Reset clears unapplied edits. Reversed
  dates fail locally with associated focus; result tabs support roving Arrow/
  Home/End keyboard operation and an explicitly labelled panel.
- Twenty-two added hook/DOM cases; all 807 tests/121 files pass. Strict types pass;
  lint stays 0 errors/25 warnings. Global coverage is 34.79% lines/33.03% branches,
  below 70%; all 17 critical branch gates pass. Nine real local runtime checks,
  live builder/response/date/tab/reset and 375 px bounded layout verified; owned
  fixture archived and actor disabled. Error/race injection remains DOM-only.
- The catalog has 118 unverified logical cases. See
  `PROTECTED_FORM_READ_RECOVERY.md`; full PRD acceptance remains open.

### Resource filters and archived sponsor aliases — 2026-10-26

- Shared resource filters normalize supported casing and bounds, preserve each
  other, retain reset during populated/failed reads and distinguish out-of-range
  pagination from an empty library. Desktop alignment and mobile stacking fixed;
  actual 375 px checks confirm separate rows and 44 px or taller controls.
- Sponsor packages omit empty legacy tiers. Older public tier/impact aliases
  now conceal soft-deleted rows and have deterministic ID tie-breaking.
- Eleven new DOM and two server cases; all 785 tests/120 files pass. Strict types
  pass; lint is 0 errors/25 warnings. Coverage is 33.52% lines/32.04% branches,
  below 70%; all 17 critical branch gates pass. Expanded actual HTTP/database
  suite passes 17 checks. Browser verifies combined filtering/paging/reset and
  empty-package omission; exact invocation-owned fixtures are archived.
- The catalog has 117 unverified logical cases. Complete PRD acceptance remains
  open. See `PUBLIC_DISCOVERY_RECOVERY.md`.

### Public queue interruption and storage recovery — 2026-10-26

- Interrupted final attempts become a truthful terminal failure after their
  lease ends; active requests are preserved, earlier attempts retain their key,
  and obsolete results cannot overwrite a newer lease. Expiry asks the user to
  check the original server result before submitting again.
- Device storage now has loading/error/read-retry/stale states, ordered reads,
  consent/write freezing, duplicate prevention, connection-aware retry and
  semantic feedback focus. Offline help no longer claims an online user is offline.
- Four added engine cases and fourteen DOM/lifecycle cases; all 772 tests across
  119 files pass. Strict types pass and lint remains 0 errors/25 warnings. Global
  coverage remains below 70% at 33.08% lines/31.49% branches; all 17 critical-file
  branch gates pass. A competing build caused one import-graph timeout; the
  subsequent complete coverage run passed every test without that competing build.
- Real Chrome/IndexedDB/API replay and reload plus a read-only database check
  confirm one fictional pending/unconfirmed subscriber. Mobile DOM fits at 375 px.
  No provider send or production change. There are now 116 unverified logical
  acceptance cases. See `QUEUE_RECOVERY_OPERATIONS.md`; full PRD acceptance is open.

### Forms recovery, review and section focus — 2026-10-26

- Validation and section focus no longer depend on animation frames. Back to
  section one, earlier-section server errors, generic failures, draft feedback
  and submitted private-link copy errors now retain useful focus. Leaving the
  runtime aborts pending mutations and ignores their late results.
- Form loading has a real skeleton/status, recoverable read retry and the shared
  branded 404 for concealed records. Metadata remains noindex/noarchive with a
  generic unavailable title. Review labels empty choices, preserves typed zero
  and formats grids as readable text while masking private file IDs. Offline
  state explicitly preserves only the current open-tab draft, disables network
  writes and never auto-submits on reconnect.
- Eleven new DOM/privacy cases; 754 tests/118 files pass; strict types, lint
  0 errors/25 warnings, build and byte budgets pass. Coverage is 32.37% lines/
  31.09% branches, below 70%; all 17 critical branch gates pass. Nine real runtime
  HTTP checks pass; native keyboard date entry, review/Back and one committed
  fictional zero-valued response are verified. Exact form/account archived;
  its synthetic responses retained. The catalog has 114 unverified logical
  cases. See `FORM_INTERFACE_RECOVERY.md`.

### Newsletter review before preference changes — 2026-10-26

- Opening confirmation/unsubscribe pages now performs only a private, read-only
  token review. Explicit buttons commit changes. Token values are scrubbed and
  no longer held in a module-level browser cache. Unknown/expired/wrong-purpose
  capabilities do not reveal subscriber identities.
- Migration 108 permits safe confirmation retry while the subscription remains
  active, with consent/suppression/team/deletion safeguards. An old confirmation
  never reactivates an opted-out subscriber. Ambiguous UI failures no longer
  falsely promise that preferences are unchanged; pending operations remain guarded.
- Seventeen DOM/API cases added; 743 tests/118 files pass; strict types, lint
  0 errors/25 warnings, build and byte budgets pass. Coverage is 32.12% lines/
  30.80% branches, below 70%; all 17 critical branch gates pass. Clean/legacy SQL
  through 108, both capacity races and six restore checks pass. Thirty-five real
  newsletter checks and nine isolated token-review API checks pass; native
  review verifies unchanged state before either button and success focus after.
  Exact fixtures revoked/archived. The catalog has 113 unverified logical cases.
  See `NEWSLETTER_TOKEN_REVIEW.md`.

### Page navigation and frame-independent menu focus — 2026-10-26

- Page changes focus the new public/workspace content landmark while list
  filters, paging, editor tabs and fragments retain their active control. Contact
  inquiry changes focus the new context. Initial mount and destination-specific
  focus remain intact; Stay/Discard respects the accepted destination.
- Compact-menu ArrowDown no longer relies on animation frames. Native Chrome
  at verified 200% zoom opens/focuses the first item, navigates to Team and then
  Tabs into its first content action. Localhost zoom/viewport were restored.
- Ten new DOM cases; 726 tests/116 files pass; strict types, lint 0 errors/25
  warnings, build, byte budgets and secret scan pass. Global coverage remains
  below 70% at 31.73% lines/30.27% branches; all 17 critical branch gates pass.
  The catalog has 112 logical cases, acceptance unverified. See
  `PAGE_NAVIGATION_FOCUS.md`.

### Contact submission focus and inquiry isolation — 2026-10-26

- Contact now blocks duplicate in-flight submits, freezes the complete form,
  retains idempotency/attachment proof on retries and associates safe server
  validation errors with controls. Local file/interest validation focuses its
  input; generic failure and committed success receive appropriate focus.
- Supported inquiry URLs preselect correctly. An approved inquiry-context change
  starts a fresh form, aborts old work and cannot inherit its confirmation.
  Attachment removal and Write another message retain useful keyboard focus.
- Twelve DOM cases added; 716 tests/115 files pass; strict types pass; lint is
  0 errors/25 warnings. Coverage is 31.66% lines/30.21% branches, below 70%; all
  17 critical branch gates pass. Thirty real contact-file/scanner/local-SMTP/
  retention checks pass. Native Chrome verified validation, a single committed
  fictional inquiry and next-message focus; its exact record was resolved via
  the audited API. The catalog has 111 logical cases, acceptance unverified.
  See `CONTACT_INTERFACE_RECOVERY.md`.

### Gallery event filtering and lightbox recovery — 2026-10-26

- Restored approved event choices dropped by the API. Event/page filters now
  persist in shared URLs; paging retains the current event and handles empty
  out-of-range pages. Gallery requests use scoped stale/error recovery.
- Lightbox captions receive focus on open/arrow browsing, and close/Escape
  returns to the original thumbnail. Failed images retain useful captions and
  controls. The bounded, scrollable mobile lightbox has a 44px close target.
- 704 tests/114 files pass; strict types pass; lint is 0 errors/25 warnings.
  Coverage is 30.90% lines/29.55% branches, below 70%; all 17 critical branch
  gates pass. Forty-six actual media/scanner/storage/HTTP checks pass, including
  the real event filter. Native Chrome keyboard and 375px fit checks pass.
  All temporary publications were revoked and exact fixtures archived; no real
  chapter asset or external provider used. The catalog has 110 logical cases,
  with acceptance unverified. See `PUBLIC_GALLERY_INTERACTIONS.md`.

### Rescheduled event history and complete registration routes — 2026-10-26

- Migration 107 records a previous start date only after publication, preserves
  history through unrelated edits and clears copied history on duplication.
  Mutations return the committed post-trigger row. Client and raw HTML metadata
  expose factual rescheduled state; calendar output includes confirmation or
  cancellation status with stable identity and updated sequence.
- Detail pages show the former date and end time, safe event website and both
  configured registration routes. Missing/unsafe external-only destinations stay
  closed. Share copies the event's canonical address without visitor parameters.
- 695 tests/113 files pass; strict types pass; lint is 0 errors/25 warnings.
  Global coverage is 30.56% lines/29.20% branches, below 70%; all 17 critical
  branch gates pass. Thirty actual local event HTTP checks, clean/legacy SQL
  suites through 107, both capacity races and six backup/restore checks pass.
  The catalog has 109 cases, with full acceptance unverified. See
  `EVENT_RESCHEDULING_OPERATIONS.md`.

### Event inventory and registration interaction safeguards — 2026-10-26

- Public inventory now derives capacity state in one service-only database view,
  sorts availability before pagination and never exposes attendee identities.
  Migration 106 passes clean and legacy-grant suites and both capacity races.
- Independent status/type URL filters, legacy shared-link compatibility,
  timezone/year-aware cards, summaries and registration states are implemented.
  Pending registration freezes inputs, scopes late responses to the current
  event, associates server errors and focuses recovery/success feedback.
- 689 tests/113 files pass; strict types pass; lint is 0 errors/25 warnings.
  Global coverage is 30.54% lines/29.04% branches, still below 70%; all 17
  critical branch gates pass. Ten actual inventory HTTP checks, 21 existing
  event checks and six backup/restore checks pass. The catalog has 108 logical
  cases; acceptance remains unverified. See `PUBLIC_EVENT_INVENTORY.md`.

### External action and Linktree focus safeguards — 2026-10-26

- Managed external actions now signal new tabs and use safe context isolation;
  absolute same-origin actions retain router navigation. Unsafe managed links
  become inert. Public social links and private Markdown gain external cues.
- Fixed Linktree preview/close focus, expanded-trigger toggling and old-frame/
  consent carryover on profile changes. A shared confirmation focus fix allows
  approved destinations to focus correctly while cancellation returns to the
  previous control. Loaded external forms retain their discard safeguard.
- 22 new DOM cases; 666 tests/112 files pass; strict types, zero lint errors/25
  warnings, build and byte limits pass. Thirty-six actual local Linktree checks
  pass and their isolated fixtures were archived. Global unit coverage is
  29.33% lines/27.62% branches, still below 70%; all 17 critical branch gates pass.
  The catalog has 107 logical cases and full acceptance remains unverified. See
  `PUBLIC_LINK_FOCUS.md`.

### Public navigation, partners and image recovery — 2026-10-26

- Added compact top-menu keyboard containment without a body scroll lock or
  modal. Native Chrome scrolling, Tab/Shift+Tab wrapping and Escape restoration
  pass at 200% zoom; 375px DOM measurements show no overflow or scroll lock.
- Added the missing conditional homepage sponsor acknowledgment from the public
  aggregate. Archived rows are excluded explicitly, selected records are stably
  ordered, and empty optional sections disappear. Managed event images, portraits
  and logos now have safe bounded fallbacks. Thirteen actual public HTTP/database
  checks pass and their fictional fixtures were archived afterward.
- 644 tests/110 files pass; strict types pass; lint remains 0 errors/25 warnings.
  Global unit coverage is 28.41% lines/27.00% branches, still below 70%; all 17
  critical-file branch gates pass. The catalog has 106 logical cases. Full PRD
  and manual/device/visual/hosted acceptance remain open. See
  `PUBLIC_NAVIGATION_PARTNERS.md`.

### Public homepage and CMS recovery — 2026-10-26

- Homepage event requests now ask directly for the next three upcoming events.
  Failed reads show retry instead of an empty-calendar claim. Shared chapter
  content preserves its last successful snapshot/timestamp, rejects malformed
  payloads, ignores superseded requests and keeps static identity/navigation/CTAs
  usable. Retry controls retain focus on the main landmark. CMS saves are not
  misreported as failed when their later public refresh fails.
- 22 new DOM/payload cases; 633 tests/109 files pass. Strict types pass; lint is
  0 errors/25 warnings and CI enforces 25. Coverage is 28.13% lines/26.71%
  branches: the global 70% gate still fails and all 17 critical-file gates pass.
  The catalog now has 105 logical cases; acceptance remains unverified. See
  `PUBLIC_CONTENT_RECOVERY.md` for behavior and evidence limits.
- Restored 465 iCloud-offloaded files through macOS and restarted the existing
  isolated local database, API and UI; no database volumes or credentials reset.

### Superseded browser source retirement — 2026-10-24

- Removed 130 unreferenced legacy screens/services after checking both HTML
  entries, all routed modules, tests/scripts and existing untracked work. The
  source remains in Git at local tag `reference/psu-client-before-retirement`;
  historical SQL and original Phase 0 inventory remain untouched. Current hero,
  offline queue, public/admin routes and design primitives remain.
- Added public domain types without password hashes and an AST/import-graph
  regression for browser database isolation and offline entry preservation.
  611 tests/107 files pass. Strict types, build, traceability and public byte
  budgets pass; lint falls to 0 errors/36 warnings and CI enforces that ceiling.
- Global coverage is 26.73% lines/25.45% branches. The denominator changed after
  source retirement; this is not additional feature acceptance. Global 70% still
  fails, all 17 critical-file branch gates pass, and full PRD acceptance remains
  open. The case catalog now has 104 logical cases. See
  `LEGACY_CLIENT_RETIREMENT.md` and its path/hash manifest.

### DOM interaction and complete route-frame smoke checks — 2026-10-24

- Added 25 actual-control DOM tests for overview recovery, audit focus/cursors/
  filters, Forms identity/error/pending/retry/review/preview/offline/copy/resume/
  edit behavior and editable file/pattern policy. 609 tests/106 files pass;
  strict types, lint 0 errors/245 warnings and traceability pass.
- CUA inspected 37 primary route frames at desktop and 375px: no page-wide
  overflow or body scroll lock, no unnamed initial controls or broken public
  loaded images. This is initial-frame smoke evidence, not full accessibility,
  loaded-state/role/workflow testing or visual approval.
- All 146 numbered requirements now map into 103 logical cases, including these
  interaction tests; full acceptance remains unverified. Global coverage improves
  to 16.30% lines/16.61% branches and still fails 70%; all 17 critical-file gates
  remain green. Production audit still has zero high/critical findings.
  See `WORKSPACE_DOM_TESTING.md`.

### Workspace, audit, composition and raw HTML — 2026-10-24

- Added four-metric administrator overview, permission-filtered registration/
  funding charts, own unread messages and task visibility revocation. Editorial
  overview includes actual scoped article states/revision history and personal
  task/message workspaces. Personal finance/communications route entry now matches
  Section 24 while underlying SQL keeps record/action scope.
- Invitations display the current inviter and support recipient decline without
  creating an identity; existing accounts require their own session/CSRF. Audit
  review now has safe details, matching aggregates/search, stable composite
  cursors, full filtered exports and retention inventory. Canonical migration
  chain through 105 passes both grant defaults and both 100-client races.
- CMS saved-draft composition uses actual public components, private bounded
  projections and a read-only canvas. Mutable CMS responses revalidate on every
  read, eliminating the earlier stale publication window. Fifteen workspace,
  21 CMS and extended invitation HTTP checks pass; see
  `WORKSPACE_COMPLETION_OPERATIONS.md` for limitations.
- Public documents now serve route-specific raw HTML/social tags, factual event
  data, safe old-slug redirects and genuine 404/noindex responses. Eleven real
  raw-document checks pass. Vercel function/routing is prepared but unhosted;
  canonical-domain redirects and provider/crawler acceptance remain open. See
  `PUBLIC_DOCUMENT_OPERATIONS.md`.
- Fresh audit found a new high Zod advisory; upgraded to patched 4.6.7 and checked
  compatibility. 584 units, strict types, zero lint errors/245 warnings, build and
  byte gates pass. Real 124 Forms/upload/scanner checks and 22 member transfer
  checks pass. Production audit is again 0 high/critical (2 moderate/4 low).
  Vite no longer watches generated coverage HTML or backend-only files, avoiding
  repeated browser reloads. See `ZOD_VALIDATION_UPGRADE.md`.
- Global coverage remains approximately 14.88% lines/15.28% branches and fails
  the required 70%; all 17 individual critical-file branch gates pass. Manual/
  device/performance/visual/hosted acceptance remain open. All 146 numbered
  requirements now map into 99 reviewed logical cases and real test-source paths;
  their acceptance stays unverified. CI rejects stale/invalid mappings. This
  is a local checkpoint, not full PRD completion.

- Added a real isolated backup/restore regression: all 105 migrations, 130 tables,
  complete row-content fingerprints and schema/grant/constraint/index/RLS/trigger
  inventories restore identically; foreign keys and append-only audit protection
  still enforce. Only fictional data in invocation-owned isolated databases was
  used; successful fixtures removed. Hosted/PITR/object-storage/RPO/RTO proof
  remains open (`BACKUP_RESTORE_OPERATIONS.md`).

### Forms policy controls and public discovery/metadata — 2026-10-24

- Added the missing Forms file count/size/format and restricted-pattern controls,
  associated errors and readiness validation. Real browser editing/reload/API
  readback passes; the invocation-owned draft was recoverably archived. See
  `FORM_VALIDATION_SETTINGS_OPERATIONS.md`.
- Public lists now page server-side, resources expose status/tag filters and
  rate-limited view actions, sponsors group by globally ordered tiers, and impact
  inventory is no longer capped by homepage metrics. Migration 100, canonical
  SQL and both 100-client races pass under new and legacy grants. Ten real public
  HTTP/DB checks and desktop/375px browser checks pass; fictional rows archived.
- Replaced retired sitemap behavior, configured-origin robots and served PSU
  references; added unique route canonical/social metadata and homepage
  Organization data. Six SEO units/eight actual HTTP checks pass. Public errors
  cannot inherit success-cache headers. See `PUBLIC_DISCOVERY_OPERATIONS.md`.
- 549 units, strict types, zero lint errors/245 warnings, production build and
  public/offline byte gates pass. All 17 individual critical-file branch gates
  remain green. Overall lines 14.12%/branches 14.64% remain below 70%; CI coverage
  must still fail. Manual/device/performance/visual/hosted gates and the other
  implementation gaps below remain open; full PRD completion is not claimed.

### Redacted source/history secret gate — 2026-10-22

- Added checksum-pinned official Gitleaks scanning for all local-ref history and
  current tracked/nonignored files. First run: 55 commits/1,246 current files,
  zero unreviewed findings, two exact reviewed fictional test inputs. No broad
  baseline/rule exclusions, inline suppression or data upload; temporary scan
  copies are removed, local credentials untouched.
- Added standalone full-history CI gate and four fail-closed policy tests;
  441 unit tests and lint pass locally. CI execution and broader security/
  accessibility/performance/hosted acceptance remain open. See
  `SECRET_SCAN_OPERATIONS.md` for exact boundaries, pins and evidence.

### Critical transport tests and source attachment review — 2026-10-22

- Added 27 unit tests; 437 pass. Encryption, private storage, scanner transport,
  shared validation and upload content now meet their individual branch gates.
  Ten of seventeen critical-file gates pass; seven route modules and global
  coverage remain red. Overall unit lines are 11.47%, branches 11.44%, not a PRD
  completion percentage. See `CRITICAL_TRANSPORT_TESTING.md`.
- Actual 124 Forms/upload and 16 respondent-copy checks pass after natural
  submission-quota expiry; no limiter reset or spoofing. Copy delivery remains
  loopback SMTP only. Source collaboration attachment review found latent columns/
  types but no operational source uploader; target remains explicitly text-only
  with strict property rejection (`COLLABORATION_ATTACHMENT_REVIEW.md`).
- Strict types/lint/build and byte gates pass; 245 lint warnings and broad
  security/accessibility/performance/device/hosted acceptance remain open.

### Precise Forms fields, accessible focus and pending safety — 2026-10-22

- Added timezone-independent strict local date-time/range checks, canonical
  bounded integer scores and decimal-only numeric syntax. Native rating radios,
  file/identity error associations and first-invalid/review/success focus now work.
  Pending operations freeze controls; file checks/removal participate in busy
  protection. Existing published definitions remain unchanged.
- Eight new field tests, 410 units at this checkpoint, strict types/lint/build,
  nine actual local HTTP/DB cases, 124 existing Forms/upload checks and live
  desktop/375px keyboard/save/submission checks pass. Actual locked-row save
  verified frozen/re-enabled controls. See `FORM_RUNTIME_OPERATIONS.md`.
  Full Forms/manual accessibility/device/quality and PRD gates remain open.

### Complete authorized Forms library filters — 2026-10-22

- Added owner/team/chapter, updated-date and template-origin filters alongside
  title/state, applied before server pagination/counts. Searchable owner/team
  options expose only currently accessible form references, never account emails.
  Historical unknown template origins stay unknown; creation/duplication now
  preserve explicit provenance without altering immutable definitions.
- 99 migrations/both grant-default replays/two 100-client races, 402 units,
  strict types/lint/build, 18 actual new local HTTP/DB checks and existing 124
  Forms/upload checks pass. Desktop/375px verifies combined filters and empty/
  reset states. See `FORM_LIBRARY_OPERATIONS.md`. Broader Forms/quality/device
  and full PRD acceptance remain open; work continues.

### Private capability context and router-safe cleanup — 2026-10-22

- Private-link replacement and Forms preview transitions now isolate component
  state. Cleanup preserves router history metadata and unrelated anchors/query
  values. Setup/invitation/newsletter capture no longer mutates history in render.
- 397 units and 15 actual new local HTTP/storage/scanner/Form checks pass;
  existing team-invitation regression passes. Chrome verifies isolated Alpha/Beta
  resumes, anchor preservation, unsaved-work Stay/Leave and Back/Forward without
  resurrecting stripped private answers. See
  `CAPABILITY_NAVIGATION_OPERATIONS.md`. Broader navigation/device/quality and
  full PRD acceptance remain open; work continues.

### Actual Forms theme, progress and safe shuffling — 2026-10-22

- Implemented approved theme accents, optional progress bar and deterministic
  safe question/choice shuffling without modifying immutable definitions, stable
  IDs or validation. Content/section anchors and ordinal/conditional semantics
  are protected. Old absent settings stay backwards-compatible.
- Builder inspector tabs now support arrow/Home/End, associated panels and proper
  Settings/Edit targets. Keyboard changes autosave and persist after reload.
- 392 units, strict types/lint/build, 16 actual storage/scanner/media/Forms checks,
  existing Forms/upload suite and public byte budgets pass. Desktop/375px verifies
  changed draft preview versus unchanged publication. See
  `FORM_PRESENTATION_OPERATIONS.md`. Remaining broad quality/accessibility and
  full PRD gates remain open; work continues.

### Actual native Forms images and header media — 2026-10-22

- Replaced illustrative image blocks with approved published-media selection,
  alternative text and responsive actual rendering. Header selection/preview/
  rendering now work. No remote tracking URLs or automatic publication.
- Transactional current-publication checks and exact indexed draft/historical
  usage prevent unsafe reference/erasure. Privacy withdrawal remains immediate.
- 98 migrations/both grant-default replays/two 100-client races, 387 units,
  strict types/lint/build, 13 actual new HTTP/storage/scanner checks and existing
  Forms/upload regressions pass. Desktop/375px verifies actual images and builder
  controls. See `FORM_IMAGE_OPERATIONS.md`. Theme/progress/safe shuffling and
  remaining broad quality gates still need completion; work continues.

### Strict types, dependency/build hardening and measured quality gaps — 2026-10-22

- Application/build strict TypeScript passes. Corrected nullable data, async
  retry keys and conditional-hook boundaries; lint is zero errors/245 warnings,
  down from 276. Unrelated user files remain intact.
- Production dependency audit has zero high/critical findings (2 moderate,
  4 low remain). Scoped updates pass 384 units, actual drawing creation/save,
  whiteboard HTTP/socket, 124 Forms/upload and 31 newsletter checks. Development
  dependency findings remain separately open.
- Public entry: 181 KB gzip JS/42 KB CSS/48 KB fonts. Offline install: 11 entries,
  535 KiB, without editors/3D. Byte/artifact gates and limited-device/interaction
  gating now protect initial loading. Runtime/device performance remains open.
- Blocking coverage measurement: about 10.5% overall unit lines, **not feature
  completion**; separate live HTTP/SQL/browser evidence is not included. Auth
  branches 98.52%, security/authorization/HTTP primitives 100%; remaining global
  70% and critical-file 90% gates fail honestly. Full automated UI/integration
  coverage remains substantial work; CI has an independent gate.
- The audit found real Forms image-block/header-media gaps, subsequently addressed
  in the checkpoint above. See `QUALITY_HARDENING.md` for the historical finding.
  Full PRD completion/launch is not claimed.

### Daily retention and sanitized operational monitoring — 2026-10-22

- Added authenticated daily session/security, notification and expired-report-cache
  jobs. Expired session references no longer pin authentication rows through
  retained business evidence; finance and audit are not deleted.
- Added isolated allowlisted request/dependency telemetry, identifier-free metric
  buckets, worker failure observations, bounded CSP reports and leased threshold/
  missed/duplicate-job monitoring. A Super Admin-only read-only status page shows
  actual freshness, outcomes and retention policies without dangerous controls.
- **97 migrations**, full canonical SQL/two 100-client races under both Supabase
  grant defaults, **362 unit tests**, typecheck and changed-file lint pass.
  **13 actual retention HTTP checks**, **13 monitoring HTTP/DB checks** and real
  scanner health/clean/EICAR tests pass. Desktop/375px live browser verifies
  scrolling, layout and persisted status. Separate local workers/scheduler run;
  external sending remains disabled. See `OPERATIONS_RETENTION_MONITORING.md`.
  Hosted watchdog/alert delivery, quality and other full PRD gates remain open.
  Full lint now has zero errors and 276 inherited warnings; strict checking and
  warning remediation remain open. Expanded the development privacy notice to
  cover all public workflows, device queues, retention and administrator requests.

### Reviewed cross-system person-data privacy — 2026-10-22

- Super Admin exact-email review/export/redaction/deletion spans attributable
  public workflows and legacy Forms access HMACs. Current password/session,
  independent ownership attestation, frozen five-minute scope, typed count,
  transactional hold/source checks and idempotency protect approval.
- Sensitive exports are explicitly opt-in; no storage/capability/peer leakage.
  Erasure invalidates access, queued sends and generated exports, removes full
  answer/message/history payloads, and tracks actual private-byte cleanup.
  Finance, audit and private collaboration are retained.
- **95 migrations** replay under both new no-automatic-grants and old Supabase
  defaults, canonical SQL/two 100-client races, **351 unit tests**, typecheck,
  **31 actual HTTP/DB/storage checks** and **19 Forms purge regressions** pass.
  Desktop/375px verifies review/export, focus/navigation protection and scrolling
  without horizontal page overflow. See `PERSON_PRIVACY_OPERATIONS.md`.
  Full PRD, hosted and institutional acceptance remain open; work continues.

### Required respondent identity and direct opt-in response copies — 2026-10-21

- New submissions/saved drafts require name/email, including older published
  forms. Entered details are explicitly unverified; historical records stay
  unknown. Private access fixes the authorized email; editing cannot redirect it.
  Reviewer search and all export formats include the captured identity/provenance.
- Respondent checkbox queues only their own complete questions/answers, directly
  to the entered address without another confirmation step. Exact revision,
  transaction/idempotency/lease/privacy fences and a recipient-wide spam quota
  apply. Sensitive own answers are included as requested; files are filenames
  only. No chapter CC/BCC or private link. Separately reviewed chapter notices
  retain their non-sensitive restrictions; no unrequested receipt is sent.
- **92 migrations**, canonical SQL/both concurrency tests, **345 scoped unit tests**,
  typecheck, changed-UI lint, build and **16 actual new local
  HTTP/DB/SMTP checks**, Forms/access/branch/upload regressions and the separate
  chapter-delivery/history/privacy/export/permanent-erasure suites pass. Browser
  desktop/375px verifies validation, keyboard opt-in, review, submission and
  scrolling without horizontal overflow. See `FORM_RESPONDENT_OPERATIONS.md`.
  SSO/Google, real provider sends and full PRD/hosted acceptance remain open.

### Verified event Push — 2026-10-21

- Added per-event explicit opt-in, account-session or emailed registration proof,
  encrypted endpoint/key retention, device-scoped status/revocation, bounded quotas
  and exact-host/P-256 validation. No account/email ownership comes from the caller.
- Added five-minute authenticated reminder scheduling, unique occurrences, current
  owner/event rechecks, six-attempt/deadline/lease fences, provider failure cleanup,
  generic lock-screen content and canonical clicks that preserve private tabs.
- **91 migrations**, canonical SQL/both capacity tests, **341 unit tests** and
  **27 actual local integration checks** pass. Real HTTP/DB/SMTP uses fictional
  fixtures; push providers use only an explicit fake transport. Desktop/375px
  verifies truthful disabled controls. Real sending is off and no browser
  notification permission was requested. Typecheck, changed-UI lint and build
  pass. See `PUSH_OPERATIONS.md`; actual-device/hosted/full PRD gates remain open.

### Exact event email audience review — 2026-10-21

- Replaced count-only approval with a five-minute session-bound exact audience/
  content/event-revision review, current-password/typed approval and immutable
  single-use batches. Delivery rechecks current sender grants/password generation,
  publication, recipient identity/removal and processing deadline under its lease.
- **89 migrations**, canonical SQL/both concurrency tests and **333 unit tests**
  pass. **22 actual local event-mail checks** pass; exactly one fictional valid
  address received SMTP and its changed peer was skipped. Desktop/375px keyboard,
  focus and draft safeguards verified; typecheck, changed-UI lint and build pass.
  See `EVENT_MAIL_OPERATIONS.md`. Complete PRD/hosted acceptance remains open.

### Contact inbox and private attachments — 2026-10-21

- Added private capability-bound quarantine uploads, actual scanner/normalization,
  atomic clean-file binding, reference-only mail jobs and a restricted chapter
  inbox. Current-revision status and password/typed-confirmed holds protect the
  180-day post-resolution retention flow; actual byte deletion is retryable.
- **88 migrations**, canonical SQL/both concurrency tests, **330 unit tests**,
  typecheck, changed-UI lint and build pass. **30 actual contact checks** and
  **40 Forms-upload regressions** pass. Desktop/375px browser draft/privacy/layout
  checks are recorded. Only synthetic fixture files were purged; no real contact
  was erased. See `CONTACT_OPERATIONS.md`; remaining PRD/hosted gates stay open.

### Newsletter workspace and delivery — 2026-10-21

- Replaced the legacy browser-service/scheduler screen with scoped subscriber,
  template and campaign workflows. Saved preview, confirmed custom audiences,
  five-minute review, current-password/typed approval, immutable snapshot/content,
  schedule/cancel/self-test, truthful provider-result views, audited CSV and
  recoverable atomic bulk cleanup are implemented. Send grants remain separate
  from CRUD. Approved form links cannot be rewritten.
- Dedicated leased worker, shared server mail transport, stable unsubscribe/retry
  identities, signed raw-body callbacks, bounce/complaint suppression and bounded
  retention run locally. Scheduler/worker are running; real Resend/webhook/domain
  configuration remains disabled. No operator newsletter data was erased.
- **87 migrations**, canonical SQL/both concurrency tests, **324 unit tests**,
  typecheck, changed-UI lint and build pass. **31 actual newsletter checks**,
  public signup/contact and **20 reviewed Forms mail checks** pass. Desktop/375px
  browser draft/keyboard/preview/review/cleanup checks are recorded. See
  `NEWSLETTER_OPERATIONS.md`; full PRD and hosted acceptance remain open.

### Private media and gallery workflows — 2026-10-21

- Replaced legacy media/gallery screens with scoped folder/file workflows,
  direct private quarantine/scanning, metadata/SEO and bulk tags/star/move/
  archive/restore. Gallery-only permissions are image-only; general Media CRUD
  never grants publishing. Explicit password-confirmed approval creates bounded
  responsive WebP derivatives; revoke immediately denies new asset requests.
- Added private preview/download, usage guards, quotas, durable artifact tracking,
  30-day recoverable archive and retryable physical cleanup/filename erasure.
  Public gallery has event filtering, pagination, dimensions/srcset, caption/alt,
  keyboard lightbox and allowed-only download controls.
- **81 migrations**, canonical SQL/both concurrency tests, **314 unit tests**,
  typecheck, changed-UI lint and build pass. Real media harness has **43 normal
  checks / 44 with browser fixtures**, plus 12 folder and 40 Forms-upload checks.
  Browser desktop/mobile/draft/keyboard verification is recorded. See
  `MEDIA_OPERATIONS.md`; hosted/security/performance/visual acceptance stays open.

### Private media core — 2026-10-21 (in progress)

- Added scoped inventory DTOs and current-session folder create/rename/move/
  archive APIs with collision/cycle/depth/revision checks. Private object keys
  are excluded from inventory responses. **73 migrations**, canonical SQL and
  both 100-client tests pass; **308 unit tests** and **12 actual local media-core
  checks** pass. No files were published or removed by these tests.
- This is not the complete media/gallery module: quarantine uploads, metadata/
  bulk actions, publication/cleanup and the replacement UI remain. See
  `MEDIA_IMPLEMENTATION_NOTES.md` for the active implementation sequence.

### IndexedDB public submission queue — 2026-10-21 (continuing)

- Added explicit event/newsletter device queue, bounded leased/idempotent replay,
  48-hour expiry, network/5xx-only backoff, permanent 4xx failure, manual retry/
  discard and logout epoch clearing. Final native Forms submissions are excluded.
- Standalone offline fallback now includes real queue controls without needing
  live API data. Browser verifies actual IndexedDB save → local API acceptance →
  persistence after reload; the fictional newsletter remains unconfirmed/inactive.
  A stopped-preview test verifies real public offline fallback and private route
  refusal; the production worker’s waiting update is activated explicitly.
- **305 unit tests**, typecheck, relevant lint and worker build pass. Latest build
  has 199 public precache entries (~7.1 MiB). Full device/cache/queue/logout/error
  acceptance remains open; see `PWA_OPERATIONS.md`. Main development UI/API remain
  running on 8080/8081 and the isolated production preview is restored on 8082.

### PWA foundation — 2026-10-21 (continuing)

- Production-only Workbox worker/manifest/icons, GT offline fallback, strict
  static-asset cache allowlist and draft-guarded update/install guidance are now
  implemented. No API/private-page/form/signed-storage runtime caching. See
  `PWA_OPERATIONS.md`; offline queue/Push/device acceptance remain open.
- **297 unit tests**, typecheck, changed-UI lint and production worker build pass.
  New dependencies are pinned/locked. Production-only audit remains **31 findings
  (16 high, 14 moderate, 1 low; zero critical)**; full dev-inclusive audit differs.
  Cache footprint (~7.1 MiB), bundle warnings and real-device/hosted checks remain
  explicit acceptance work. Existing local API/UI were restarted after restoring
  the exact lockfile dependency install; both are running on loopback again.

### Permanent deletion and compact public navigation — 2026-10-21

- Added Super Admin-only permanent form deletion, separate from ordinary archive:
  current-password/typed confirmation, export warning, short session-bound review,
  retention/hold/reference blockers, immutable audit tombstones, irreversible
  question/answer erasure and retryable physical-byte cleanup. **19 real local
  HTTP/database checks** pass. See `FORM_PERMANENT_DELETION_OPERATIONS.md`.
- Corrected draft-expiry day rounding for small database/server clock differences;
  the absolute stored deadline remains authoritative. Privacy and reviewed-mail
  harnesses both pass 20 checks, and the full existing Forms suite passes again.
- Replaced the public hamburger’s centered modal with a compact header-anchored
  dropdown. No backdrop, focus trap or page-scroll lock. Native/DOM browser checks
  verify Escape/focus return, keyboard opening, outside click, link close and a
  375px phone viewport without overflow. Screenshots: `ui-review/real-header-dropdown-{tablet,mobile}.png`.
- **72 migrations**, canonical SQL/both concurrency tests and **291 unit tests**
  pass. Typecheck, changed-UI lint and build pass. Remaining production dependency,
  bundle and hosted acceptance findings are not waived; continuing the original
  PRD backlog.

### Forms references and identity derivatives — 2026-10-21

- Added published-form reference contracts for events, teams and draft campaigns,
  event/team management dialogs and public event CTAs that exclude restricted
  modes. Current source/form authorization, revisions and idempotency are checked
  server-side. See `FORM_INTEGRATION_OPERATIONS.md`.
- Response erasure also removes encrypted identity derivatives and original file
  names after actual object deletion. Real storage cleanup and retry are tested.
- **71 migrations**, full canonical SQL and both 100-client tests pass. **15 real
  integration checks**, **40 real upload checks**, **283 unit tests**, typecheck,
  changed-UI lint and build pass. Native browser verifies the link dialog and
  draft preservation. Permanent-deletion safeguards are the next implementation
  item; the original backlog and hosted acceptance are not complete.

### Directory transfers, inbox clearing and Forms retention — 2026-10-21

- Tejas clarified import/export means `/admin/members`. Added CSV template/file/
  paste validation, preview, fixed destination, five-minute session-bound review,
  current-password/typed-confirmation commit, atomic create-only batches and
  existing-email skipping. No account/grant/public-profile side effects. Filtered
  exports span all matching pages, honor scope, omit private fields by default
  and escape spreadsheet formulas. See `MEMBER_TRANSFER_OPERATIONS.md`.
- Mark all read switches to Dismiss all after unread count becomes zero. Bulk
  dismissal affects only own read rows; a concurrently arrived unread item stays.
  Native browser verified real CSV download and in-app import discard/stay paths;
  screenshots include desktop/mobile review. Operator inbox was not cleared.
- Added independent form/response holds, Admin-only release, original-version
  response deadlines, bounded retention erasure and configurable incomplete-draft
  expiry with truthful runtime deadlines. Password/revision/confirmation controls
  and privacy review UI are implemented. See `FORM_PRIVACY_OPERATIONS.md`.
- **69 migrations**, full canonical SQL and both 100-client tests pass. **283 unit
  tests**, typecheck, clean UI lint and build pass; full lint remains zero errors
  and 276 warnings. **22 actual member-transfer**, **7 bulk-inbox** and **20 Forms
  privacy** checks pass. Remaining build/dependency/hosted acceptance warnings are
  not waived. Continuing with permanent form deletion and internal references,
  then general media/gallery/campaigns and the other original backlog items.

### Reviewed Forms mail — 2026-10-21

- Receipts and explicit chapter notifications now have a password-confirmed,
  version-matched recipient review in the builder. Atomic, deduplicated outbox
  creation and leased workers recheck current authorization, response privacy and
  review validity. Sensitive answers/files are never mailed; non-sensitive answers
  require Admin review and oversized sets fall back to metadata-only delivery.
- **65 migrations**, full canonical SQL and both 100-client tests pass. **274 unit
  tests**, typecheck, UI lint and build pass. **20 actual HTTP/database/local-SMTP
  checks** pass. Desktop/mobile review and real keyboard scrolling verified.
  See `FORM_DELIVERY_OPERATIONS.md`. Real external provider acceptance remains open.
- Repaired macOS iCloud-offloaded dependencies without deleting the old copies:
  installed the locked dependencies in `/Users/tejas/.cache/gdg-gt-deps.2bjp3O`,
  linked project `node_modules`, preserved ignored `node_modules.offloaded-backup`
  and `excalidraw.offloaded-backup`, regenerated local fonts outside public backup
  paths, and downloaded the existing source/version-history folders. API/frontend
  run on the same loopback ports. No global iCloud setting was changed.
- Continuing with retention/holds/deletion and the other feature/acceptance work
  in `PRD_EXECUTION_BACKLOG.md`; this is not a full PRD completion claim.

### Forms background exports and historical review — 2026-10-21

- Re-read the full v1.5 specification, including sections 21–33. SSO and
  Bevy/Engage are deferred per Tejas. `PRD_EXECUTION_BACKLOG.md` separates remaining
  feature work from all required acceptance/launch gates; the complete PRD is
  **not finished**. Historical checkpoints below are not current pending lists.
- Added durable background CSV/XLSX/JSON export jobs, frozen response membership
  and revision fingerprints, server-derived requester/session, idempotency,
  account quotas, bounded worker leases/retry/recovery, private artifacts and
  24-hour expiry/cleanup. Recheck current permissions and source changes during
  processing, promotion and 60-second download authorization. Sensitive answers
  require explicit separate permission; audit metadata never contains answers.
- Response workspace now has final export review, job state, cancellation and
  short-lived in-memory download links. Individual response review has paginated
  historical snapshots, original version labels, masking and audited sensitive
  reveal. Redaction affects history and invalidates export snapshots; deleted
  responses cannot be reviewed. Published-version inspection and draft/version
  comparison are read-only and preserve stable field identities.
- **64 migrations**, full canonical SQL suite, both 100-client capacity tests,
  **270 unit tests**, TypeScript checks, UI/scoped lint and production build pass.
  **28 actual export checks** include 1,001 stored responses, all three
  formats and direct private Storage downloads; **15 actual history checks**
  include two edits, immutable labels, redaction and deletion. Browser verified
  real queue → ready → download authorization/link clearing, mobile widths and
  history/version review. Fixed version-dialog height/overflow and verified
  actual native scrolling. See `FORM_EXPORT_HISTORY_OPERATIONS.md`.
- The existing complete local Forms regression suite also passes after these
  changes: builder/submission/edit/redaction, token invitations/verification,
  branching and 36 actual private upload/scanner/storage checks. Local mail
  remains restricted to the SMTP sink, never an external recipient.
- Added a least-privilege, SHA-pinned GitHub CI foundation for lint, current type
  checking, unit tests, reproducible SQL/concurrency tests, build and a separate
  blocking production audit. No remote workflow was run or code pushed. Local
  repository lint reports **zero errors and 276 warnings**. Production-only
  dependency audit still reports **31 findings (16 high)**; strict app TypeScript,
  browser/coverage/visual/hosted/security acceptance remain open.
- Receipts/notifications, retention, integration references, general media/gallery,
  campaigns/scoped mail, PWA/offline/push and final quality gates remain in scope.
  No real provider mail, external publication, deployment or user data was used.

### Private Blog file scanning and downloads — 2026-10-21

- Added session/owner/scoped idempotent editorial uploads, one-object two-minute
  quarantine capabilities, bounded file/account quotas, actual-object completion
  verification and real checksum/MIME/ClamAV/image normalization. Promotion repeats
  current session/account/team/grant/revision checks; clean files are immutable.
  Authorized readers receive audited 60-second downloads, held only in UI memory.
  Review approval never bypasses file safety; unverified legacy paths remain denied.
- Added private upload/download controls, separate file-safety labels and scan
  refresh. File selection and busy operations use shared navigation protection.
  Non-clean quarantine cleanup is bounded and skips active leases; clean evidence
  is retained through record archival. Existing Forms/Finance scanning is delegated
  without new browser table/worker grants.
- **62 migrations**, full SQL/capacity suite, **261 unit tests**, TypeScript,
  UI/scoped lint and build pass. **23 real Blog file checks**, **36 Forms** and
  **22 Finance** regression checks pass. Browser verified clean-file authorization/
  link clearing and 375 px/339 px mobile upload fit. Exact fictional fixtures
  recoverably archived; no real user files/provider/mail. See BLOG_FILE_OPERATIONS.md.
- The native file-picker handoff is still blocked by the previously reported
  extension permission restriction; no protections were weakened. Legacy-file
  import, crash-orphan inventory reconciliation, hosted storage/CORS/scanner,
  accessibility/multibrowser/load and general media/gallery remain open. The
  complete PRD is not finished.

### Private Blog editorial workflows — 2026-10-21

- Replaced direct-browser Blog/admin/editor screens with protected scoped
  article/category/submission/comment APIs and a neutral responsive workspace.
  Ownership/explicit assignment and current-team grants fence details/counts.
  Editors cannot approve/publish/moderate; administrator-only submission notes/
  discussion/contact and storage paths are excluded from editor DTOs.
- Proposed article changes preserve the retained base until administrator review.
  Approval, internal publication, rejection/resubmission, assignment and retained
  moderation are revision/idempotency/CSRF/session-fenced. Sensitive operations
  require current password/full reference. Soft archive/restore preserves history
  and never automatically republishes. Markdown uses shared AST write/render
  sanitization, no raw HTML or automatic image loads; literal code is escaped.
- **61 migrations**, full SQL/capacity regressions and **260 unit tests** pass.
  **35 real HTTP checks** are recorded. Browser checks cover actual proposal/
  approval/discussion, stale-input retention, Stay/discard, unchanged close and
  375 px/339 px mobile fit. Exact fictional fixtures recoverably archived, no real
  files/provider/mail/public Blog created. See BLOG_OPERATIONS.md and
  ui-review/real-blog-*.png.
- Blog/media quarantine, scan promotion and short-lived file downloads are next;
  unverified legacy file paths remain denied. This does not complete BLOG-005,
  all editorial media, or the full PRD. Campaigns/scoped mail, remaining Forms
  export/receipt/retention contracts, PWA/offline/push and final quality/security
  gates remain open. npm reported 42 audit findings, including 25 high; safe
  dependency remediation and hosted operational acceptance are still required.

### Session-generation safety — 2026-10-21

- Private requests now carry a non-authorizing in-memory generation digest, checked
  centrally against the current cookie. Changed/malformed bindings return 409
  before private access; stale writes cannot refresh CSRF into another session.
  Session clear/login cancel pending private fetches and fence late decoded/error
  results. Password rotation abandons other in-flight generation results. Private
  identity/team state clears alongside editors; public Form-access failures do
  not sign out an unrelated admin or supply new CSRF material.
- **252 unit tests** and **six actual two-session HTTP checks** pass. Existing
  browser login still loads, and actual UI create/confirmed recoverable archive
  succeeds with the hardened transport. Fictional record retained inactive; only
  test-owned HTTP sessions revoked. Proof: `real-session-bound-*.png`. No new
  database migration, external provider, permission or private cache was added.
  See `SESSION_TRANSPORT_SAFETY.md`. Already-accepted writes still rely on server
  transaction fences; this is not a complete race/Realtime/hosted security pass.

### Private community members and local file protection — 2026-10-21

- Replaced legacy direct-browser member management with scoped protected CRUD,
  filtered/minimized lists, individual private details/activity, category/academic/
  interests/core/active fields and recoverable archive/restore. Community people
  remain separate from officer accounts. Current team page/action grants, current
  session, revision, CSRF, idempotency and metadata-only auditing fence changes.
- Public-profile synchronization is separately authorized and always draft-only.
  Identity/deactivation/team archival revoke publication atomically; reactivation
  never republishes. Merge is an administrator-reviewed, same-scope retained alias,
  with session-bound expiring proof, two revisions/references and current password.
  Current project/profile links require prior review. Canonical fields and private
  histories are not destructively combined. Explicit unmerge restores inactive.
- **60 migrations**, full SQL/capacity regressions and **238 unit tests** pass.
  **45 actual HTTP checks** plus a minimized-list check are recorded in phase0.
  Browser verification covers actual saving, conflict/input retention, merge and
  unmerge, Stay/discard, mobile fit and native scrolling. Fictional fixtures are
  recoverably archived. See `MEMBERS_OPERATIONS.md` and `real-members-*.png`.
- Closed confirmed loopback Vite file exposure of ignored local credentials;
  private documentation, server/database/infrastructure and secret-file patterns
  now deny browser serving. **11 HTTP checks** verify denial and functioning app/
  modules/assets/health. Probe retained no file contents; no outside access is
  evidenced. Full security certification is not claimed. Session-switch transport
  review is next, followed by remaining media/editorial/campaign/Forms/PWA work.

### Site availability and maintenance controls — 2026-10-20

- Replaced the legacy status manager with password/typed-confirmed protected
  GET/PATCH APIs and a responsive editor/preview. Current Admin/Super Admin or an
  explicit current-team site-status read/update grant is required. Read-only
  grants, Blog Editors and removed operators cannot change state. Revision,
  idempotency, current-session/password rechecks and metadata-only audit records
  fence state changes. No operational row is seeded; initial live state is a
  virtual default until the first authorized change.
- Public destinations are restricted to an active local Linktree or exact approved
  Georgia Tech/GDG HTTPS hosts, without private query parameters. Automatic
  routing is local-only; inactive local destinations fall back to maintenance.
  Admin/gate/login, liveness health, Linktree and necessary privacy/token/setup
  routes remain reachable. Maintenance does not act as an authorization bypass
  or blanket API shutdown. Public status DTOs omit operator identity/permissions
  and are no-store. Revalidated public-only offline snapshots have a 30-day bound
  and a five-second initial-fetch timeout; full PWA offline support is still open.
- Added the configured maintenance page/banner, safe manual link, preview,
  stale-input protection and navigation guard. Removed obsolete legacy status
  manager and PSU/global-window testing utility (recoverable in Git). Corrected
  privacy copy that incorrectly claimed all local test data stayed in-browser;
  approved production privacy content remains a launch dependency.
- Verification: **57 migrations**, all SQL/capacity regressions, **227 unit
  tests**, TypeScript, UI/scoped lint and production build pass. **21 actual HTTP
  checks** are in `phase0/local-site-status-integration.json`. Browser checks
  cover normal maintenance routing, active local redirection, deactivation
  fallback, privacy access, stale-input retention/disabled save and actual
  confirmed UI saving of unchanged live settings. At 375 px the document and
  339 px editor fit. Proofs: `ui-review/real-maintenance-*.png`.
  The exact original availability was restored and the site is live. Fictional
  fixtures were recoverably archived, temporary viewports reset, and no external
  provider or email used. Full accessibility, multibrowser/hosted operations and
  PWA/offline acceptance remain pending. See `SITE_STATUS_OPERATIONS.md`.

### Private Projects CRUD and participants — 2026-10-20

- Replaced legacy direct-browser database calls with protected scoped APIs and a
  neutral, responsive workspace. Preserved project fields, internal featured
  state, categories/statuses, technology/tag arrays, links, planned capacity and
  dates. `/projects` remains the branded 404, with no anonymous project API or
  browser table/function grants. No data becomes public through featuring.
- Current team page/action grants are enforced for lists, totals, filtered
  statistics, details and mutations. Blog Editors are denied. Account/team
  removal revokes ordinary access; global administrators retain read-only
  inactive-team history. Transactions require current session, CSRF,
  idempotency and aggregate revisions; action revocation also fences replays.
- Participant management matches only an exact unambiguous active community
  email, without exposing a whole directory or participant contact data. Project
  roles do not grant chapter access or send invitations. Removal retains inactive
  history; rejoining reuses it. Star rows/identities remain private; actual retained
  counts are reported separately from the preserved legacy cached counter.
- Archive/restore require current password and exact title. Hard deletion is
  disabled, preserving participant/star history and finance references. Editor
  input survives independent updates; stale saves are disabled. Async private
  reads/results are fenced against session clear, and navigation is guarded.
- Verification: **56 migrations**, all SQL/capacity regressions, **217 unit
  tests**, TypeScript, UI/scoped lint and production build pass; existing bundle
  warnings remain. **28 actual local HTTP checks** are recorded in
  `phase0/local-projects-integration.json`. Browser review covers actual edit/save,
  stale revision/input preservation, discard dialog, 375 px editor fit, 1440 px
  desktop, 432 px native wheel scrolling and public 404. Proofs:
  `ui-review/real-projects-*.png`. Fictional fixtures are recoverably archived,
  participant/star history retained, and viewport overrides reset. No external
  provider, real invitation, mail or payment was used.
- Remaining acceptance includes exhaustive accessibility, multibrowser/load and
  hosted operations. Full PRD work is still open, including private Blog/media,
  campaigns/scoped mail, member-management gaps, remaining Forms export/receipt/
  retention contracts, PWA/offline/push and final quality/security gates. See
  `PROJECTS_OPERATIONS.md`.

### Scoped Linktree management and public link pages — 2026-10-20

- Replaced the legacy browser-table Linktree screens with protected APIs and a
  scoped profile/link editor. New profiles and links are private drafts. Current
  team membership plus explicit CRUD/page grants are required; publication has a
  separate grant. Live changes, activation, deactivation, archive and restore
  require typed confirmation and a current password. Aggregate revisions,
  idempotency, immutable audit records and reserved former usernames prevent
  stale overwrites, duplicate actions and abandoned-URL takeover.
- Active public profiles expose only active, ordered links from active teams.
  Team archival unpublishes profiles and fences revisions; restoration does not
  republish them. Unknown/inactive profiles share the branded 404. Public DTOs
  exclude ownership, scope, private counters and archived content. URL validation
  rejects unsafe protocols, credentials, private token parameters and local URLs.
- Only canonical Google Forms and privacy-enhanced YouTube embeds are allowed.
  They load only after explicit visitor consent; other destinations are native
  external links. Native first-party form/event links remain on the chapter site.
  Embedded Google Forms warn before abandoning potentially entered answers.
- Rate-limited click/view tracking accepts only a target, not arbitrary counter
  values. Analytics retain daily UTC aggregate counts without raw IP, user agent,
  referrer or visitor identifiers. Counts are approximate, not unique visitors.
- Verification: 54 canonical migrations and all SQL/concurrency regressions,
  **210 unit tests**, TypeScript, `lint:ui` and production build pass. Actual local
  HTTP evidence contains **37 checks** in `phase0/local-linktree-integration.json`.
  Browser checks cover draft profile/link creation, unsaved-text preservation
  under an independent revision update, disabled stale save, desktop/mobile
  layouts, provider opt-in with zero pre-consent iframes and branded inactive 404.
  Proofs: `ui-review/real-linktree-*.png`. Fictional profiles/teams/accounts are
  recoverably archived; the browser-created draft was never published. Temporary
  viewport overrides were reset. No external provider page or iframe was loaded.
- Remaining acceptance: actual approved provider rendering, hosted CSP,
  exhaustive accessibility and multibrowser/load testing. This is a subsystem
  checkpoint, not complete-PRD or launch certification. See `LINKTREE_OPERATIONS.md`.

### Shared unsaved-work navigation protection — 2026-10-20

- Added a data-router-backed navigation boundary for ordinary links, browser
  Back/Forward, record-selection query changes, explicit sign-out and protected
  local workspace transitions. A focus-trapped, labeled dialog initially focuses
  **Stay here**. Declining leaves the route and input unchanged. Busy operations
  offer no discard action until they finish. Refresh/close use the browser's
  native before-unload warning. Approved successful saves/local discard flows
  receive a synchronous, one-transition bypass rather than disabling protection.
- Integrated the implemented event, collection/CMS, Forms builder/respondent,
  profile/security, user, team/invitation/announcement/chat-setup, channel, task,
  private-message, chapter-announcement, whiteboard and finance editors, plus
  public event registration and contact forms. Team-tab switches now consider
  nested editor state. Finance tab/request switches use the same in-app dialog.
  Saved/resumed Form snapshots do not count as fresh unsaved answers; completed
  submissions stop warning. A builder preview bypass is allowed only after its
  save succeeds.
- The registry holds only transient flags and generic labels, not draft content,
  credentials or browser storage. Session-clear suppresses private session-bound
  guards so revoked access cannot trap a user; unrelated public respondent work
  remains protected. This is a UX safeguard, not an authorization mechanism.
- Verification: **197 unit tests**, TypeScript, `lint:ui` and production build
  pass (existing bundle warnings remain). Browser checks cover local tab changes,
  cross-route navigation, explicit discard, Stay preserving exact editor text,
  browser Back both across routes and between finance record query states,
  sign-out cancellation without losing the session, and Tab focus cycling.
  At 375 px the dialog is 343 px wide, within a 375 px document, and starts with
  Stay focused. Proofs: `ui-review/real-navigation-unsaved-{desktop,mobile}.png`.
  All fictional unsaved input was cleared without creating an event or note;
  temporary viewport overrides were reset.
- The earlier login quota expired naturally: all **36 existing actual local
  Forms-upload HTTP/storage/scanner checks** subsequently passed with the new
  finance-aware worker, including removal fencing, response ownership, immutable
  promotion, metadata stripping, malware rejection and audited downloads. Evidence
  remains `phase0/local-upload-integration.json`. No quota or job reset occurred.
- Remaining acceptance includes native close/refresh dialogs across browsers,
  exhaustive save-in-flight/forced-revocation timing checks, integration into
  remaining legacy workflows as they are replaced, and full accessibility/
  multibrowser regression. This checkpoint does not certify the complete PRD.

### Private finance ledger, allocations and scanned receipts — 2026-10-20

- Replaced the legacy browser-database finance screen with protected APIs and a
  scoped request/budget/report workspace. Money crosses JSON as decimal strings;
  browser availability calculations use integer cents. No PSU transactions,
  budgets or approvals were imported. PRD funding reference cards and the source
  chart are explicitly labeled planning references, not live balances or spend
  authority; requested workshop funding is not included in approved funding.
- Implemented private draft editing, submission, required own-team lead/co-lead
  approval, independent administrator approval, rejection with a reason,
  completion, cancellation and append-only notes/history. Decisions require a
  current opaque session, CSRF, password, exact request reference, revision and
  idempotency key. Self-approval is denied even to global administrators.
  Submitted amounts/scope cannot be rewritten, and final records cannot be
  changed except for retained notes under the implemented policy.
- Current ordinary members see their own records and explicitly granted team
  scope; another team lead cannot see a private draft. Removed members lose
  historical team access, counts, chart data and exports. Blog Editors are denied.
  Financial data has no Realtime publication or browser table/RPC grant.
- Administrators manage scoped allocations with typed/password confirmation and
  revision checks. Approvals atomically reserve exact funds; completion moves
  reservation to spent without initiating a payment. Simultaneous approvals
  cannot overbook a budget. Committed requests prevent budget closure or invalid
  reductions. Inactive-team history remains readable to administrators but is
  not writable. Reports, filters, pagination, scoped state charts and audited,
  formula-safe CSV exports are implemented (1,000-record/2.5 MB export bound).
- Supporting PDF/PNG/JPEG/WebP files use signed direct upload into the private
  `finance-attachments` quarantine, a 10 MB/file and ten-active-file/request
  bound, checksum/content verification, real malware scanning and image metadata
  stripping. Completion is idempotent. Promotion rechecks current request
  revision, uploader permission and session; stale uploads are rejected rather
  than attached. Only authorized readers of clean files can obtain an audited
  60-second signed attachment download. Keys/checksums are absent from list DTOs.
- Conservative attachment policy: add files only to authorized draft/pending
  requests; no clean-file replacement or deletion, and no new attachments on
  terminal requests. Financial records, receipt metadata and clean receipt bytes
  remain retained until chapter leadership defines retention. Cleanup may remove
  only abandoned/rejected quarantine bytes after a day, never clean receipts.
- Verification: complete SQL suite through 52 canonical migrations, both existing
  100-client capacity regressions, 192 unit tests, TypeScript, scoped lint and
  production build pass; existing large-chunk warnings remain. Evidence:
  `phase0/local-finances-integration.json` (37 actual isolated HTTP checks) and
  `phase0/local-finance-uploads-integration.json` (22 real local storage/scanner
  checks). Valid images lose private metadata; the standard harmless antivirus
  test signature is rejected. No real payments, external messages or user-file
  uploads were performed. Fictional financial evidence is retained, and fixture
  accounts/teams are recoverably archived. Earlier failed fixture runs also left
  clearly labeled financial test records; retention was not bypassed to erase them.
- Browser checks: actual draft save, request details, allocation usage, reports,
  clean/rejected file states and a declined unsaved-note navigation warning.
  At 375 px the document and editor fit the viewport; a native wheel scroll moved
  812 px. Mobile funding cards use a compact two-column layout. Proofs:
  `ui-review/real-finance-*.png`; temporary viewport overrides were reset and the
  fictional browser-created draft was cancelled through the protected API.
  Browser file selection is not certified: the Chrome extension needs file-URL
  access, which was not granted. The actual upload pipeline was tested over HTTP.
- A repeat of the existing Forms-upload HTTP regression initially hit the shared
  login quota before setup. After natural expiry all 36 checks passed; the quota
  was not bypassed or reset.
  The existing Forms upload/scan/removal/draft-cleanup SQL regressions pass with
  the new shared scanner completion function. Hosted storage, scanner operations,
  long-running load, comprehensive accessibility and production acceptance remain
  unverified. This is an implementation checkpoint, not full FIN sign-off or
  complete-PRD certification.

### Normal gate submission and planned Georgia Tech SSO — 2026-10-20

- The footer accepts the configured gate using ordinary Enter or Subscribe,
  including email-shaped codes. Recognition is server-side; matching entries
  issue only the existing 15-minute private gate cookie, never a newsletter row
  or email job. The user still needs a chapter login. Existing gate lockouts are
  checked, and the shared email-entry endpoint has a five-request/risk/15-minute
  cap. Normal email addresses retain the opt-in workflow. No code/hash is in JS.
- User-requested Georgia Tech SSO is visibly planned, not active: disabled login
  and Forms-verification buttons, a disabled builder access-mode option, and
  honest explanatory copy. No provider call, SSO session, account linking, role
  grant or verification proof was implemented. Forged SSO form settings fail
  validation. Activation still requires institutional approval/configuration and
  a separately tested server integration; see `GEORGIA_TECH_SSO_PLAN.md`.
- Verification: 180 unit tests, TypeScript, scoped lint and production build pass
  (existing bundle warnings remain). Browser verified ordinary Enter and actual
  Subscribe each open the login, login SSO is disabled, and restricted Forms keep
  existing email verification alongside disabled SSO. At 375 px, login fits the
  viewport and the public form has no document-width overflow. Builder inspection
  confirms the SSO option cannot be selected. Proofs use the prefixes
  `ui-review/real-gate-normal-entry-sso-` and `ui-review/real-form-planned-sso-`.
  The fictional verified-email
  form was archived after review; temporary viewport overrides were reset.

### Managed team chat and durable reconnect recovery — 2026-10-20

- Added a Chat tab to each authorized team workspace and one explicitly provisioned
  conversation per team. Read-only inspection never creates a room. Setup requires
  current lead/co-lead or chapter-admin authority, the exact team name, the current
  password, CSRF, a current opaque session and a bounded confirmation quota. Two
  concurrent setup requests resolve to the same database-enforced room.
- Team-chat access follows current parent-team membership. Moderation follows the
  current lead/co-lead role; stale explicit channel ownership cannot retain that
  authority. Separate room-member edits are rejected. Removed members lose HTTP
  reads and replacement socket grants. Inactive teams become read-only even for
  chapter administrators; restoration preserves conversation history. The UI
  explicitly discloses chapter-administrator oversight.
- Channels now use transaction-serialized, per-room change cursors. Initial
  history and its high-water mark share a stable database snapshot. Bounded
  100-message change pages recover gaps beyond the latest-50 history window,
  including edits, pins and removed-body placeholders. Cursors advance only after
  applying a page; newly created messages remain eligible across coalesced edits
  and multiple pages. Older history responses cannot overwrite newer changes.
  No duplicate message-body change log or browser table/RPC grant was added.
- Current room actions control visible message permissions. Staged room and
  message edits retain their original revision, preserve draft text on a remote
  conflict, and disable stale saves. Late responses cannot retarget a newly
  selected room. Known reply previews refresh when their original is removed.
  Full-length 10,000-character Unicode messages fit the protected byte bound.
- Verification: **49 canonical migrations**, the complete SQL suite (including a
  125-message reconnect gap, edits, rollback-safe cursors, tombstones, private
  scope and both 100-client capacity regressions), **169 unit tests**, TypeScript,
  scoped ESLint and the production build pass. Build still warns about large
  vendor/whiteboard chunks; this is not a performance-budget pass.
- **30 actual local HTTP/private-WebSocket checks** (including two independent
  browser-review updates) passed. Lifecycle evidence is recorded in
  `phase0/local-team-chat-integration.json`. Browser checks verified sending,
  pinned/full views, independent-session updates without losing an unsent draft,
  parent-team navigation, and the earlier staged-edit conflicts. At 375 px the
  document width was 375 px, height 1,864 px, with a real wheel movement of 812 px.
  Screenshots: `ui-review/real-team-chat-*`. Temporary viewport overrides were
  reset and fictional drafts cleared. Test accounts, team and conversation are
  recoverably archived; no external messages or permanent deletions were made.
- A repeated transport test initially missed an event during a local Realtime
  database-worker rebalance. The socket can report SUBSCRIBED before that worker
  is ready. Tests now establish readiness with a metadata-only control probe on
  the exact fictional private topic before asserting the business trigger; they
  do not retry the business write. Application correctness now has durable HTTP
  catch-up independent of advisory broadcasts. Hosted transport acceptance and
  longer-running reconnect/load checks remain unverified.

This completes this implementation milestone, **not the complete PRD**. Remaining
work includes remaining private attachments/media workflows, private editorial
workflows, newsletter campaigns/scoped mail, member-management gaps,
remaining Forms export/receipt/retention contracts, remaining navigation-guard
integration and acceptance, PWA/offline/push, dependency/strictness/performance remediation, CI,
and comprehensive accessibility/security/multibrowser acceptance. Existing UI
routes or earlier subsystem checkpoints do not certify those remaining contracts.

### Chapter announcements, audiences and scheduling — 2026-10-20

- Added the protected Announcements workspace alongside Tasks and Messages.
  Chapter publishing is restricted to current Admin/Super Admin accounts; existing
  scoped team announcements remain in Teams. Readers see only currently published,
  unexpired announcements for their current role/team/account. Drafts, schedules,
  archived records and audience/read inventories are hidden from ordinary readers.
- Implemented draft CRUD, role/team/exact-email audiences, pinning, per-publication
  read acknowledgments, unpublish/cancel schedule, retained archive and restoration
  as an unpublished draft. Explicit recipients bind to immutable account IDs, not
  reusable email addresses. Published text cannot be silently edited. Counts and
  lists are scoped before pagination. Plain text and UTC instants are validated.
- Publication requires a ten-minute server-stored audience preview bound to the
  current actor/session/record revision, a visible final count/name sample, exact
  title confirmation and the current password. Confirm rechecks the account hash
  under the hierarchy lock and rejects changed audiences. Each publication freezes
  1–1,000 notification recipients; repeated requests cannot duplicate fan-out.
- Added a five-minute secret-authenticated, distributed-lease announcement job.
  Due schedules publish once, expiry removes reader access, and scheduled approval
  is cancelled if its author loses publishing authority. The local runner includes
  the new cadence. A browser origin is rejected even with a valid cron credential.
- Durable per-recipient jobs recheck the publication, current audience/account,
  frozen email and publisher authority. Generic in-app notices deduplicate. Optional
  email carries a protected link, never the private subject/body. The UI separates
  queued/processed/dead jobs from provider-confirmed email count; in-app-only work
  never calls a mail provider. New eligible people may read published content but
  are not silently added to an already-approved notification batch.
- Real local integration: 29 HTTP/WebSocket/job/worker/Mailpit checks, plus a held
  browser fixture with a remote pin change. Draft updates do not invalidate reader
  sockets; approved publication does, with only kind/generated transport identity.
  Browser verified read acknowledgment, stale-action input preservation, creating
  and editing a draft, a one-account preview with disabled unconfirmed send,
  cancelling publication and typed recoverable archiving. Phone width 375/375 px;
  preview/editor heights 1816/2028 px, real wheel scroll 812 px, viewport reset.
  Evidence: `ui-review/real-announcement-preview-desktop.jpg`,
  `ui-review/real-announcement-preview-mobile.jpg`,
  `ui-review/real-announcement-editor-mobile.jpg`,
  `ui-review/real-announcement-conflict.jpg`,
  `ui-review/real-announcement-browser-cleanup.jpg`. Impeccable kept the existing
  calm palette, familiar controls and inline confirmations. Fictional records and
  accounts are recoverably archived, notices read; no external email was sent.
- All 47 canonical migrations applied locally; isolated SQL and both existing
  100-client capacity regressions pass. All 160 units, TypeScript, scoped ESLint
  and production build pass. Existing bundle warnings remain. This is not complete
  PRD acceptance: team-chat entry, private attachments, scoped custom/marketing
  campaigns, other unfinished modules and final quality/security gates remain.

### Private direct messages and audited review — 2026-10-20

- Communications now has Tasks and Messages workspaces. The inbox uses protected
  APIs, fixed one-to-one participants, exact-email addressing, normalized search,
  scoped counts and cursor pagination. Sender/session identities are server-owned.
  Ordinary Admins cannot read unrelated conversations; Super Admins do not receive
  implicit private-body access. No browser table-read or RPC grants were added.
- Added same-thread replies/quote references, bounded plain text, author-only
  revision-checked edits, retained removal placeholders/restoration, explicit
  recipient-only read acknowledgments and independent personal archives. New
  replies unarchive both personal inboxes. Inactive recipients cannot receive new
  messages, but authorized historical records remain readable.
- Source Super Admin oversight is an explicit password-confirmed, reason-recorded,
  five-minute review bound to one opaque session. Review is read-only and reads
  are audited. Stop/expiry denies the next HTTP request/token mint. Review socket
  JWTs cannot outlive their proof, including near-expiry issuance. Browser review
  data clears at its deadline; unsent drafts survive ordinary live refresh.
- Private exact-topic sockets and durable jobs carry identifiers only. Delivery
  rechecks accounts/message/worker lease, deduplicates generic in-app notices and
  emails a protected link without the subject/body. Local Mailpit delivery was
  verified. No external mail or production send was enabled.
- Actual local suite: 39 independent-session HTTP/WebSocket/mail checks, plus a
  held browser fixture with a real remote follow-up. Browser sent, edited, removed
  and restored a message, and preserved an unsent draft during live refresh.
  Desktop 1280/1280 px; phone 375/375 px (height 1789 px). Real wheel scrolling
  reached 812 px. Overrides reset; fictional threads/accounts recoverably archived
  and notices read. Evidence: `ui-review/real-direct-message-wide.jpg`,
  `ui-review/real-direct-message-mobile.jpg`,
  `ui-review/real-direct-message-cleanup.jpg`. Impeccable kept the existing calm
  palette/controls and moved exceptional review into a disclosure.
- All 44 canonical migrations applied locally. SQL covers participants/reviewers,
  archives, conflicts, read receipts, tombstones, notice fencing/deduplication,
  session/socket expiry and both 100-client capacity regressions. All 155 unit
  tests, TypeScript, scoped ESLint and production build pass; existing bundle
  warnings remain. Read errors recover separately from action errors, and short
  proof-bound renewal avoids once-per-second churn throughout the final minute.
- Full PRD/COMM acceptance remains open: chapter announcements, scoped email
  campaigns, private attachments, remaining modules and final quality/security/
  accessibility gates still need implementation and verification.

### Scoped tasks, comments and overdue automation — 2026-10-20

- Communications now opens the protected Tasks workspace; the legacy page entry
  is a compatibility wrapper, not a browser database/scheduler implementation.
  Active accounts receive an own-communications route, while every record read and
  mutation is resolved separately. Blog Editors see assigned/own task summaries,
  not unrelated chapter work. Navigation links respect current route eligibility.
- Implemented private creator/assignee and explicitly granted team scope,
  server-owned creation/attribution, eligible assignment, filters/counts/paging,
  detail editing, revision conflicts, status transitions, recoverable archive /
  restore and password/title-confirmed reassignment. Former private assignees lose
  access immediately on the next request. Private personal-task recipient probes
  receive a uniform denial before any unrelated account lookup.
- Comments have cursor history, idempotent posting, author-only edits, permitted
  soft deletion, tombstones and revision checks. Status and assignment activity is
  immutable through the comment API and projects safe, readable transition data.
  Private account emails are not returned in task or comment projections. Shared
  validation covers date-only calendars, bounded plain text, tags and state; byte
  limits accommodate valid full-length Unicode descriptions/comments.
- Added a separate-secret, distributed-lease overdue job at 15-minute cadence.
  UTC calendar deadlines are marked once per deadline occurrence. Reopening a
  late task does not duplicate its notice; changing the deadline creates a new
  occurrence. Completed/archived tasks and inactive teams are excluded. Durable
  notification delivery rechecks current assignee, scope, occurrence and worker
  lease, and carries only generic text with a protected task deep link.
- Actual local integration: 41 task/worker checks plus 7 recipient-privacy /
  Unicode regression checks. Real independent sessions exercised editor/assignee /
  outsider boundaries, comments, reassignment, stale writes, date round-trips,
  authenticated scheduling, duplicate suppression and fenced delivery. No rate or
  scheduler state was reset. All new fictional tasks/accounts were recoverably
  archived; their notifications were marked read. Local scheduler restarted with
  the new cadence and completed a clean zero-work overdue run.
- Browser posted a fictional note, completed a task, reviewed the safe activity
  history and confirmed preservation/blocking of a stale staged title. Phone
  editor viewport/document widths 375/375 px, height 2811 px; override reset.
  Actual wheel scrolling moved the review page from 0 to 604.5 px, then reset.
  Evidence: `ui-review/real-task-completed-desktop.jpg`,
  `ui-review/real-task-editor-mobile.jpg`, `ui-review/real-task-conflict.jpg`.
  Impeccable guidance kept the existing restrained admin controls/palette and
  improved task-navigation spacing rather than introducing a new visual system.
- All 42 canonical migrations applied locally. Isolated SQL covers nullable
  assignees failing closed, private scope, revisions, comments, occurrence/worker
  fencing and both existing 100-client capacity checks. All 141 units, TypeScript,
  scoped ESLint and production build pass, with prior bundle warnings remaining.
- This is not complete COMM/PRD acceptance. Chapter-wide announcements, direct
  messages, scoped email fan-out, private attachments and remaining modules/gates
  still require implementation and verification. No production deployment or
  external mail was performed.

### Protected, versioned live whiteboards — 2026-10-20

- The active Whiteboards route and legacy compatibility entry points now use
  protected APIs instead of browser database reads/writes or Postgres Changes.
  Private creator/explicit-collaborator scope and team-scoped action grants are
  checked per operation. Explicit viewer/editor admission does not change chapter
  roles; former team members cannot retain a team board through collaboration.
- Implemented scoped search/counts/pagination, create, rename, explicit sharing /
  revocation with password confirmation, read-only viewers, portable scene export,
  recoverable archive and administrative restoration. Sharing changes recheck
  current password identity under the hierarchy lock. Collaborator email inventory
  is available only to board managers. Archived boards cannot be written.
- Autosaves require both version and saved timestamp, use idempotency keys and
  serialize concurrent edits. Stale writes return 409. Unsaved drawing/details
  remain in tab memory; users can download a local drawing copy or explicitly
  reload the server version. An open metadata form also blocks silent adoption of
  a remote version. Native drawing normalization does not count as a user edit.
- Shared Zod validation runs in the editor and API. Scene limits reject embeds,
  images, files, executable links, invalid coordinates/styles, excessive nesting,
  duplicate IDs, overlong text and oversized drawings. Editor cloud features and
  file imports are disabled. Editor JS/CSS load lazily; packaged fonts are prepared
  locally, with asset-path configuration evaluated before the editor package.
- Private whiteboard sockets use the existing short-lived single-topic role and
  restrictive policy. Broadcasts contain only board identity, never scene data.
  Rejoins reread the API. Revocation requests immediate reauthorization, with the
  same five-minute hard expiry bound. No application-table browser grants added.
- Actual independent-session HTTP/WebSocket integration: 38 checks, including
  exactly one winner from two concurrent saves, timestamp conflicts, scope and
  viewer/editor boundaries, private socket topic isolation, metadata-only
  broadcasts, table-read denial, export and archive recovery. Temporary accounts
  and boards were recoverably archived. Repeated runs respect confirmation/login
  quotas; a read-only preflight avoids creating fixtures during cooldown.
- Browser created a separate fictional board, drew/autosaved a shape, fitted it
  at 375 px, downloaded and verified its `.excalidraw` scene, and recoverably
  archived it. The generated export remains in Downloads. A second live fixture
  demonstrated remote refresh, preservation of a staged rename on conflict, and
  explicit server-version recovery. Responsive override reset. Evidence:
  `ui-review/real-whiteboard-live-desktop.jpg`,
  `ui-review/real-whiteboard-fit-mobile.jpg` (375/375 px width, height 1512 px),
  `ui-review/real-whiteboard-conflict.jpg`, and
  `ui-review/real-whiteboard-review-cleanup.jpg`. Existing restrained admin tokens
  and controls were preserved under the Impeccable product-UI guidance.
- All 37 migrations applied locally; isolated SQL covers team and explicit scope,
  session revocation, idempotency and Realtime, plus both 100-client capacity tests.
  All 135 unit tests, TypeScript and scoped ESLint pass. Production build passes
  with existing bundle warnings. This is not full PRD/production completion:
  communications/tasks, team chat, financial workflows, other unfinished content
  modules and final accessibility/security/performance gates remain.

### Private Realtime channels and notifications — 2026-10-20

- Connected the active channel workspace and notification bell/inbox to private
  Broadcast subscriptions. Content still travels through authorized HTTP reads,
  not socket payloads or browser database queries. A rejoin triggers a fresh read;
  foreground polling remains a recovery/backstop path.
- PRD token endpoint is `/api/v1/auth/realtime-token`; the earlier local spelling
  remains a compatibility alias. Session + CSRF issuance validates current scope
  and produces a maximum-five-minute token containing a least-privileged socket
  role, exact topic, permission version and server-backed grant identity. A
  restrictive policy prevents future permissive policies widening this role.
- Production signing accepts imported ES256 P-256 keys; symmetric signing is
  explicitly restricted to the isolated loopback development stack. No signing
  material, bearer token or private profile data is stored in browser storage.
  Separate clients prevent channel and notification tokens broadening each other.
- Logout/session failure disconnect immediately. Account/session/membership and
  team-state changes broadcast a body-free reauthorization instruction. Clients
  tear down old scopes and request current grants; the five-minute expiry remains
  the hard server-enforced maximum for a client ignoring that instruction.
- Actual local integration: 19 checks, including real private joins, cross-room /
  cross-account rejection, signature tampering, token expiry, revoked sessions,
  PostgREST table/RPC denial and metadata-only database broadcasts. Additional
  browser review saw a new message and unread count appear without page reload.
  Fictional rooms recoverably archived; only the review notification marked read.
- Browser evidence: `ui-review/real-channel-live-desktop.jpg` (natural 885 px
  viewport, full page), `ui-review/real-channel-live-mobile.jpg` (375 px viewport,
  document width 375 px, height 1348 px), `ui-review/real-notification-live.jpg`.
  Temporary responsive override reset. The restrained approved admin palette and
  existing control vocabulary were preserved during this Impeccable UI pass.
- Canonical migrations through 033 applied locally, with isolated SQL scope and
  concurrency checks. All 129 unit tests, TypeScript, scoped ESLint and production
  build pass; existing bundle warnings and broader production acceptance remain
  open. This is not complete COMM or full PRD acceptance.
  Whiteboards/team chat/content refresh, private attachments, tasks, finances,
  remaining modules and final accessibility/performance/security gates remain.

### Protected channel core — 2026-10-20

- Active Channels route now uses protected room and message APIs. Private rooms
  default to explicit membership, internal rooms have a defined chapter audience,
  and team rooms require current active team membership. Existing editor accounts
  receive a channel route only after explicit room admission; admission does not
  expose other internal rooms. Metadata edits cannot silently widen room scope.
- Room administration confirms the actor's password; role/member changes and
  archive/restore are revision-checked and audited. Messages support session-owned
  senders, idempotent sends, sender-only edits, moderator pins, same-room replies,
  soft-deleted tombstones, read markers and derived unread counts. Deleted text
  is excluded from message projections and reply previews. Archived rooms are
  read-only, including for administrators.
- Message history uses stable timestamp/ID cursors; explicit memberships are
  paginated and ordinary recipients do not receive private account emails. UI
  preserves an unsent draft on failure, separates room-change state, supports
  replies and pin views, and refreshes through the protected API every five seconds.
  This polling is explicitly not claimed as the required scoped Realtime feature.
- Actual independent-session local HTTP integration: 33 checks. Isolated SQL
  includes NULL-denial checks, private scope, idempotency, cross-room reply denial,
  sender/moderator boundaries, deleted-preview removal and unread markers. All 29
  migrations are applied locally. Unit count: 113; TypeScript, scoped ESLint and
  build pass, with existing bundle warnings remaining.
- Browser sent a fictional message, replied and pinned the original in a private
  test-only room. Evidence: `ui-review/real-channel-conversation-desktop.jpg`
  (1440 px full-page capture), `ui-review/real-channel-conversation-mobile.jpg`
  (375 × 812). Mobile viewport/document widths 375/375 px; height 1559 px. Temporary
  viewport reset and room recoverably archived, preserving fictional messages.
- Scoped Realtime, private message attachments, richer search/notifications and
  remaining collaboration/PRD modules are still required. No production or full
  channel acceptance claim is made by this checkpoint.

### Team announcements and durable notifications — 2026-10-20

- Team announcements now have protected draft/edit/publication, scheduling,
  expiry, priority, independent pinning, account-owned read acknowledgements,
  revision conflicts, recoverable archive and restore-as-draft workflows.
  Ordinary members cannot see drafts or scheduled/expired posts, and inaccessible
  records are filtered before counts. Editing a published body returns it to draft.
- Publication snapshots the active team audience and queues a durable, scheduled
  notification job. The fenced worker rechecks current team/account membership,
  publication version, expiry and active team state before delivery. Duplicate
  claims do not duplicate notifications. Notifications contain generic metadata
  and a protected deep link, never the private post body. Pinning does not change
  publication identity or accidentally cancel scheduled delivery.
- Actual local API/notification integration: 24 checks. Isolated SQL additionally
  covers worker lease rejection and delivery/read idempotency. All 28 migrations
  are applied locally. Current unit count: 108; TypeScript, scoped ESLint and
  production build pass, with the previously documented bundle warnings remaining.
- Browser-created a fictional draft, explicitly confirmed publication, and read
  the real committed post. Captures:
  `ui-review/real-team-announcement-published-desktop.jpg` (1440 × 900), and
  `ui-review/real-team-announcement-published-mobile.jpg` (375 × 812). Phone
  viewport/document widths are both 375 px, content height 1471 px. Viewport reset.
  The temporary team was recoverably archived and the scheduler restored.
- Corrected team-workspace title/sidebar selection so a team deep link is not
  mislabeled as the unrelated public-profile editor. Restored visible selected-tab
  styling for the team navigation. No external recipient or production data used.
- Richer team statistics, messages/tasks/channels/whiteboards, finances, remaining
  private/content modules and final cross-browser/security/accessibility gates
  remain unfinished. Full PRD and production completion are not claimed.

### Secure team invitation lifecycle — 2026-10-20

- Team invitation management and the recipient route now use same-origin APIs.
  The active legacy path-token invitation page no longer loads the browser
  database flow; new invitations use `/team/join#invite=...` and remove the fragment
  from the visible address. Raw capabilities never appear in manager responses.
- Invitations are single-use, email/account-bound, valid for seven days, and
  hashed at rest. Encrypted outbox delivery supports deduplicated recipients,
  cooldown-protected resend rotation and revocation. Acceptance rechecks the
  inviter's current authority and team state. Losing lead/admin authority closes
  outstanding links rather than preserving a stale privilege.
- Existing recipients must sign in as the intended account and pass CSRF; the
  invitation cannot overwrite credentials or change their chapter role. New
  recipients choose a password and receive only the fixed Team Member account
  role, plus the explicitly approved team membership role. No automatic session
  or chapter-gate bypass is issued.
- Actual local HTTP/SMTP integration: 28 checks, including encrypted-secret
  cleanup after local delivery, duplicate prevention, email mismatch, replay,
  wrong-account rejection, unchanged existing credentials, resend/revoke and
  inviter-authority loss. All fictional teams/accounts were archived. Local mail
  capture only; no external email or remote account changes occurred.
- All 27 migrations and isolated SQL checks pass, with 104 unit tests, TypeScript,
  scoped ESLint and build checks passing. Browser review covered the invitation
  composer and unsaved granular Forms-grant controls; no browser-created
  credential or permission change was submitted. Evidence:
  `ui-review/real-team-invitations-desktop.jpg` (1440 × 900),
  `ui-review/real-team-invitations-mobile.jpg` (375 × 812), and
  `ui-review/real-team-grants-desktop.jpg`. Mobile document width is 375 px,
  content height 1577 px; actual wheel scrolling moved 765 px. Viewport reset.
- The temporary visual fixture was recoverably archived after review. The local
  scheduler was restored after deterministic delivery tests. Team announcements,
  richer historical statistics, collaboration, broader security/accessibility
  acceptance and the remaining PRD modules are still required.

### Team membership and grant administration — 2026-10-20

- Team directory and individual team routes now use protected APIs. Chapter
  administrators can create/edit/archive/restore teams, with a required founding
  lead and no default page grants. Team members see only their current active
  memberships; unrelated records are filtered before counts and pagination.
- Leads/co-leads can add/remove ordinary members within their own team but cannot
  grant officer roles, change chapter roles, edit security permissions or transfer
  people across teams. Chapter administrators can assign team roles and transfer
  memberships atomically. The final active lead is protected in both membership
  operations and account deactivation. Account roles are not team roles.
- A structured page/action editor covers 16 operational surfaces and explicit
  Forms response/sensitive/export actions. Security/user/audit controls cannot be
  delegated here. Special-action rows no longer imply general read/edit access.
  Current grants are applied on the next request. Team restoration leaves previous
  page grants disabled for deliberate reapproval.
- Transfers preserve inactive source membership, create member-level destination
  access, append a transfer record and activity entries in one transaction, and
  drop old team grants immediately. Activity and transfer records are append-only.
  Ordinary members receive display names, not private account emails. Counts are
  derived from actual current memberships rather than placeholder statistics.
- Local HTTP integration: 28 checks with independent lead/member/outsider
  sessions. Only newly created fictional teams/accounts were used and archived.
  All 26 migrations are applied locally. Isolated SQL, 104 units, TypeScript,
  scoped ESLint and production build pass; existing production performance and
  security acceptance gates remain open. Mobile editor width/document width:
  375/375 px; content height 1762 px. Proof: `ui-review/real-team-editor-mobile.jpg`.
- Invitations, announcements, richer historical statistics and collaboration
  remain unfinished. This checkpoint does not claim complete TEAM acceptance,
  full PRD completion or production readiness.

### Protected account management — 2026-10-20

- The active Users screen now uses protected server APIs, not the legacy browser
  database service. Creation, role/name edits, activation, session inspection and
  revocation, reset, recoverable archival and inactive restoration are connected.
  Directory access is Super Admin only; Admin API operations are restricted to
  Team Member / Blog Editor targets and cannot grant privileged roles.
- Every account mutation confirms the actor's password; high-impact actions also
  require typed target identity. The database rechecks the current actor, session,
  verified password hash, target hierarchy and optimistic revision under a shared
  hierarchy lock. Self-management uses the separate own-profile routes; users
  cannot self-elevate, deactivate or archive through this API.
- New accounts use an undisclosed random credential and must complete setup.
  Single-use, email-bound setup/reset capabilities expire in 24 hours, are hashed
  at rest, and enter the outbox only encrypted. Administrators never receive raw
  links or temporary passwords. The recipient page removes the URL fragment and
  stores no capability/password in browser storage. Reset blocks old passwords
  and revokes existing sessions; role and activation changes also revoke sessions.
- Real local HTTP integration: 31 checks, including setup replay/email binding,
  immediate next-request revocation, role escalation denial, resend cooldown,
  recoverable archival and restore-as-inactive. Fictional accounts were archived.
  Local scheduler handles the added delivery kind; no external email was sent.
- Isolated database tests pass with 24 forward migrations, plus both existing
  100-client concurrency checks. Existing 97 unit tests, TypeScript, scoped ESLint
  and production build pass. Mobile editor is 375 px wide with document width
  375 px and 1865 px scrollable content. Screenshot:
  `ui-review/real-account-editor-mobile.jpg`. Browser creation was inspected but
  not submitted; credential/setup flows were tested through the local HTTP suite.
- This is not full security/teams completion. Security-event/alert tooling,
  team administration/invitations/transfers, short-lived Realtime scopes and the
  broader PRD modules below remain required, along with final accessibility,
  security coverage, dependency and performance acceptance.

### Public content operations — 2026-10-20

- Resource, sponsor, sponsorship-tier, impact-statistic and public team-profile
  routes now use same-origin server APIs instead of legacy browser database
  services. New records are private drafts. Publishing is a separate permission;
  edits return published records to review. Optimistic revisions, team ownership,
  explicit team grants, duplication where valid, archive/restore, filtered
  inventory and mutation audits are implemented. Tier levels remain unique.
  Linked public-profile edits cannot silently bypass publication review.
- Site-content editing covers approved identity settings and links, structured
  page copy, navigation, social links, and footer copy. Configuration keys are
  allowlisted; server credentials cannot be read or changed through this editor.
  Private Blog/Projects routes cannot be added as public navigation or page copy.
  Navigation parent cycles are rejected. Public aggregates include only published
  copy and omit editor identities. Header/home/contact copy, public navigation,
  footer/social links, sponsorship packages and approved impact figures consume
  those values. Unsupported legacy content shapes still need migration review;
  this is not a claim of complete CMS schema or visual acceptance.
- Actual local content API integration: 23 checks. Site-content API/public
  serialization integration: 16 checks. All fictional fixtures were archived,
  including the resource created and published through the browser. The browser
  proof captures the temporary published fixture, not real chapter content.
- Twenty-two migrations are applied in actual local Supabase. Isolated SQL tests
  cover scoped content grants, draft/publication separation, stale revisions,
  recoverable archival, CMS field restrictions and navigation cycles, as well as
  the existing event/Form 100-client tests. Unit count is now 97; type-check,
  scoped ESLint and production build pass. Existing vendor chunk/performance,
  dependency, strictness, coverage and broad accessibility gates remain open.
- Mobile CMS copy editor: viewport/document width both 375 px, content height
  2115 px, observed scroll movement 812 px. Human-readable section-specific fields
  replace the initial all-fields-at-once editor. Evidence:
  `ui-review/real-cms-editor-mobile.jpg` and
  `ui-review/real-resource-published-desktop.jpg` (1440 × 900).
- Finances, users/team administration, channels/whiteboards, private editorial
  workflows, campaigns, media management and Linktree still need their own real
  server migrations. Forms work noted below remains partial. Full PRD completion
  and production readiness are not claimed.

### Private Forms workflows and worker runtime — 2026-10-20

This pass extends the checkpoint below; the complete PRD remains unfinished.

- Invitation, unlisted-link, and verified-email issuance now use hashed access
  tokens, encrypted recipient/delivery secrets, deduplicated recipient batches,
  final confirmation, resend rotation/cooldown, revocation, and masked status UI.
  The local SMTP worker delivers private fragment links, not raw tokens to admins.
  Actual local API/database/mail integration: 34 checks.
- Private form uploads use 120-second, one-object signed direct PUTs, expected
  size/MIME/checksum validation, durable scan jobs, a real native ClamAV worker,
  detected-content validation, image metadata stripping, and separate randomized
  clean objects. A replayed upload cannot modify promoted bytes. Response-file
  downloads require current form/response/sensitive permissions and are audited;
  download capabilities expire in 60 seconds. Real Storage/scanner/API checks: 36.
- File association and removal serialize with final submission. Saved drafts bind
  files to the respondent capability; cleanup preserves active resume drafts and
  committed response attachments. Expired/abandoned/rejected form uploads are
  tombstoned and cleaned after the retention delay, with retries on object errors.
- Section routing and early endings are shared between browser and server.
  Publication rejects backward cycles, invalid destinations, conflicting rules,
  unreachable sections, and tested unreachable required-field conditions. Actual
  HTTP branching/republication integration: 11 checks. Five distinct reusable
  templates and a blank starter contain structure only. Stable option IDs survive
  reorder-plus-rename without duplication.
- A separate bearer-authenticated scheduler rejects browser origins/cookies,
  records fenced run IDs, counters and retries, and deduplicates completed cadence
  occurrences. Local form schedules run every five minutes, draft/upload cleanup
  hourly, and mail delivery every minute. Scan work runs outside request handlers.
  Job API integration: 10 checks; actual scanner health/clean/EICAR checks: 3.
- Nineteen forward migrations are applied to actual local Supabase. Isolated SQL
  tests include access, upload quotas, draft-file binding, cleanup protection,
  worker/job lease fencing, and both 100-client concurrency checks. Latest unit
  count: 91. TypeScript and scoped ESLint checks pass. Production build still has
  vendor chunk warnings; full security/coverage/accessibility gates remain open.
- Browser review confirmed the inspector dialog scrolls (589 px viewport,
  708 px content, 119.5 px actual scroll movement) and public form document width
  equals its 885 px viewport. File-picker automation requires the browser
  extension's file-URL permission; it was not broadened silently. Actual signed
  byte upload and scanning are independently verified through integration tests.
- Native scanner, local scan worker, and precise local scheduler are development
  processes only. No production scanner/scheduler or email provider was deployed.
  Forms still needs asynchronous large exports, full historical-revision UI,
  reviewed receipts/notification settings, comprehensive privacy retention, and
  complete role/browser/accessibility acceptance. Other PRD modules listed below
  remain in scope and require implementation, not just UI routes.
- `.env.example` no longer recommends browser-exposed email-provider secrets.
  Dedicated local credentials remain ignored and mode 0600. Dependency audit
  remediation is still required; passing build/tests is not a zero-vulnerability
  or production-readiness claim. Current disk check: about 18 GiB free.

### Real local workflows — latest implementation pass, 2026-10-19

This section supersedes older prototype-only statements below. The full PRD is
**not complete**; no staging/production or final visual acceptance is claimed.

- The active browser now uses `/api/v1`, real opaque sessions, and the dedicated
  loopback Supabase database. The fixture adapter is disabled in real-API mode.
  No browser application-table privileges were opened to make this work.
- Event draft/edit/publication, revision conflicts, slug redirects, registrations,
  attendee correction/check-in/soft deletion, CSV, and audience-snapshot email
  enqueueing have server implementations. Local event HTTP evidence has 21 checks;
  audience delivery and all team permission combinations still need more coverage.
- Public CMS reads, team/resources/sponsors/gallery metadata, newsletter double
  opt-in, and contact persistence are server-backed. Local SMTP captures mail;
  no external provider delivery is enabled. Newsletter/contact integration evidence
  has 16 checks. Public image-byte delivery and contact attachments remain open.
- Own-account/profile, password/session management, dashboard widgets, own
  notifications, and append-only audit list/export are connected. Dashboard
  widgets fail independently and omit ungranted sections. Workspace integration
  has 15 real HTTP/database checks, including current-role revocation.
- Forms now has an RLS-locked schema, shared bounded browser/server validation,
  action/team/collaborator authorization, optimistic draft saves, immutable
  published versions, atomic online submissions, hashed resume/edit tokens,
  protected answer revisions, masked sensitive values, filtered responses,
  version-aware summaries, account-owned saved views, CSV/XLSX/JSON downloads,
  operational-hold checks, and identity redaction across historical answers.
  Active library/builder/respondent/response routes use these APIs. No real answers
  or authentication tokens are saved to browser localStorage by these routes.
- Forms remains partial: invitation/verification issuance and delivery UI, complete
  branch/end logic, scanned private uploads, large asynchronous exports, full
  history UI, retention cleanup, reviewed receipts, richer settings/templates,
  and complete action/access-mode acceptance coverage remain required. Publication
  of file fields and receipts is fail-closed until their services are connected.
- Thirteen target migrations applied in actual local Supabase. Isolated SQL tests
  also pass, including **100 event clients: one final-seat registration** and
  **100 form clients: one final-slot response**, with one deduplicated outbox job
  per committed operation. Evidence: `phase0/canonical-tests.json`.
- Latest full verification at this checkpoint: 74 unit tests, TypeScript check,
  ESLint with zero errors, and production build passed. This is not complete
  mandatory PRD test coverage. Build still reports large/circular vendor chunks;
  strict TypeScript, coverage/CI, security/dependency remediation, and browser
  acceptance across all routes remain open.
- Added bounded CSRF refresh/retry for stale tokens, transient auth-error retry
  instead of treating an API outage as logout, and single-request sidebar access
  discovery. The gate now counts failed entries separately from successful opens;
  its five-failure lockout is persistent, with a separate bounded request quota.
- Browser proof: created/published a fictional form, submitted fictional answers,
  then read the committed response in the protected workspace. Dashboard phone
  viewport was 375 px with document width 375 px and real scroll movement of
  812 px. Evidence screenshots are under `ui-review/real-*`. These are verification
  captures, not user visual approval. Temporary viewport was reset.
- Other legacy admin modules still need server migration (CMS mutation, teams,
  users, finance, communications/channels/whiteboards, media, campaigns, private
  blog/projects, and Linktree). Do not mistake an accessible route for a completed
  workflow. The real API no longer silently substitutes preview records.
- Runtime: Vite `127.0.0.1:8080`, watch-mode Node API `127.0.0.1:8081`, isolated
  Colima/Supabase. Current disk check showed about 27 GiB free; older disk errors
  below are historical, not a current blocker. No cloud resources were changed.

- Local public/admin UI prototype exists; see `UI_LOCAL_REVIEW.md` for its limits.
- The yellow palette was rejected. Surfaces now use low-chroma neutral off-whites;
  homepage framing is peach again. Coral and charcoal remain.
- Main public pages and all sidebar destinations were opened and screenshot
  inspected at desktop width after the palette change. No document-width overflow
  was observed. Loading captures are not final visual approval.
- Removed inherited universal scroll-chain suppression. Real wheel input on the
  admin profile moved the document from 0 to approximately 848 CSS pixels.
  Keyboard scrolling also worked on Events. Overlapping legacy modal locks now
  restore the document only when their final owner releases it.
- The new phone-width review was interrupted by browser-control timeouts. It
  remains pending; a viewport reset was attempted but could not be confirmed.
- Resolved the ten inherited ESLint errors without weakening rules. Input-safety
  tests cover normalization, control-character filtering, and HTML text escaping.
  This does not certify the existing sanitizer or legacy API security.
- Mechanical inventory and numbered requirement tracking are generated under
  `phase0/`. Every requirement starts unverified; test IDs/evidence must be filled
  by actual implementation and execution. Normative non-numbered sections apply
  in addition to these numbered IDs.

## Original execution plan — historical 2026-10-19

1. Phase 0: execute the historical schema in an isolated disposable database,
   record failures and effective catalogs, reconstruct missing objects, derive a
   reviewed canonical GT baseline. Do not run old seed/policy scripts on GT.
2. Local/test infrastructure and CI; dependency remediation and bundle budgets.
3. Deny-by-default data/storage grants, server-only application access, secure
   gate/session/CSRF/authorization primitives and negative tests.
4. Migrate services subsystem by subsystem, preserving route/action/team scope.
5. Complete event registration, collaboration, finance, CMS, newsletter, and
   first-party Forms contracts with real persistence and transaction tests.
6. PWA/offline/push only after protected API and cache security gates pass.
7. Browser/accessibility/load/security/visual acceptance, then authorized staging.

No phase exits on the strength of mock UI behavior. No protected feature is
production-ready while the browser still uses the legacy direct table services.

## Initial external inputs / gates — historical 2026-10-19

- Hosted GT-owned Supabase, Redis/rate-limit, email, scanner/queue, Realtime signing, and
  deployment credentials are not configured. Do not reuse PSU credentials.
- No domains are assumed to be controlled; no purchase or remote deploy is authorized
  by this local checkpoint.
- Approved marks, final content/recipients, financial retention policy, and Tejas's
  visual sign-off remain launch inputs.
- The production dependency audit at that initial checkpoint reported 31 findings (16 high, 14 moderate,
  1 low). These remain open pending individually tested remediation; no blanket
  acceptance or `audit fix --force` has been applied.

At that initial checkpoint Phase 0 was in progress. Consult the newest checkpoint
for current implementation and validation results; full acceptance remains open.

## Backend foundation checkpoint — 2026-10-19

- Explicit repair transforms reproduce all 83 historical SQL files with zero
  failures and all 62 source-defined tables in network-isolated PostgreSQL 17.
  Evidence: `phase0/source-replay-repaired.json`. This is source archaeology,
  not a copy of source data or source security policies into GT.
- `database/migrations/202610190001_canonical_structure.sql` reconstructs clean
  structure only. Target tables have RLS and deny browser table/function access.
  Security and public-workflow additions are separate forward migrations.
- All four current target migrations and database tests passed against isolated
  PostgreSQL. A 100-independent-client final-seat test produced exactly one
  registration, 99 full-capacity outcomes, and one durable confirmation job.
  Evidence: `phase0/canonical-tests.json`. Storage/Realtime remain unverified.
- Added server-only scrypt verification, opaque hashed sessions, bound CSRF,
  persistent sliding risk limits, current-role checks, central authorization,
  same-origin validation, safe request envelopes, and redacted telemetry.
- Added `/api/v1` deployment entry and loopback local Node API/Vite proxy.
  Auth, password rotation, and manual Super Admin gate rotation are implemented
  server-side. **The browser UI has not migrated to these real endpoints.**
- Retired unsafe source session, CSRF, arbitrary-email, media, feed, sitemap,
  and keep-alive handlers with no-store HTTP 410 responses. Historical code is
  preserved in Git. Public sitemap must be rebuilt before launch.
- Removed obsolete keep-alive cron and unsafe-eval/third-party tracking hosts
  from production CSP. Staging report-only verification is still required.
- Latest code verification: **58 unit tests pass, typecheck passes, ESLint has
  zero errors, production build passes**. Inherited lint warnings, non-strict TS,
  large chunks, stale browser compatibility data, and dependency vulnerabilities
  remain open. Unit tests use an injected fake store; they do not certify live
  Supabase HTTP integration or complete the PRD's mandatory security suite.
- Migration `202610190004_password_and_lockout.sql` and its SQL test now pass,
  including persistent account lockout, token rotation, other-session revocation,
  and rejection of a stale verified password hash. The canonical test report was
  refreshed after the runtime recovery.

## Resolved local infrastructure blocker

The Mac's disk reached approximately 100 MB free during the updated Supabase
image pull. File writes and Vitest initially failed with `ENOSPC`; Docker then
reported containerd metadata I/O errors. Removed only the 127 MB temporary npm
CLI download created during this work (re-downloadable). File tests/build work
again with approximately 229 MB free, but this is insufficient for the stack.
The attempt to remove eight stopped generated test containers failed with I/O
errors; no successful database/container deletion is claimed.

Follow-up checks showed host space had increased to 39–41 GiB. A non-destructive
Colima restart cleared the runtime's metadata I/O errors. Its kernel log recorded
filesystem recovery from prior I/O failure; a newly downloaded Postgres image
still contained a zero-filled ELF loader. Removing/re-pulling that image reused
the damaged cache. Three stopped diagnostic containers and that image reference
were removed/re-downloadable; no initialized application database was erased.
The full repaired historical replay was also repeated in the new profile:
83/83 SQL files passed and the 62-table catalog was unchanged (only its forensic
container identifier changed). No historical data entered the GT application DB.

The project now uses a separate **`gdg-gt` Colima profile** with 4 CPUs, 4 GiB RAM,
and a 40 GiB sparse virtual data disk. The old default profile is stopped and its
data remains intact. Project commands explicitly select `colima-gdg-gt`, without
requiring a global Docker context switch. Fresh image downloads run successfully.
Supabase CLI **2.121.0** is now pinned in project dev dependencies; the old global
CLI is untouched. No cloud project was changed.

All four migrations applied in actual local Supabase. Database, gateway, Auth,
Storage, Realtime, and local mail containers are healthy. Published ports bind
only to `127.0.0.1`. Platform Auth is enabled for transport key generation; signup
is disabled and application accounts still use custom opaque server sessions.

Local auth was bootstrapped with random, non-default credentials for one fictional
development Super Admin. Private configuration and credentials are ignored by Git
and mode 0600. Nothing was copied from source accounts. Re-running bootstrap
verifies existing credentials and never resets them silently.

`npm run test:local-auth` passed **16 real HTTP integration checks** through Vite,
the Node API, and Supabase, including anonymous table/RPC denial, gate enforcement,
origin checks, role-property rejection, hashed sessions and CSRF, current account
lookup, unsigned-cookie rejection, logout, and revoked-token replay rejection.
Evidence: `phase0/local-auth-integration.json`. This is not full PRD certification.

The UI preview remains on `http://127.0.0.1:8080`. The configured real Node API
listens on loopback port 8081 and is proxied at `/api/v1`. The browser's legacy UI
fixtures have **not** yet been migrated to the real API. No default target admin
password or source credentials were installed. Host space was approximately
34 GiB free after setup; historical free-space readings are not current readings.

## First isolated source replay

`npm run audit:db:source` runs PostgreSQL 17 in a labeled, resource-limited Docker
container with network disabled, no published ports, and no host mounts. It runs
the historical baseline and 82 migrations in lexical order, each in its own
transaction. Historical failures roll back and are recorded, not ignored.

First result: 67 files applied, 16 rolled back, and 53 public tables created versus
62 defined in repository SQL. The report includes SQLSTATEs, image ID, catalog,
constraints, and effective policies: `phase0/source-replay.json`.

Auth/storage in this first source replay are **minimal platform shims**, not a
Supabase security implementation. This is a forensic source-only database, not a
GT target environment. Standalone seed files are not executed; embedded migration
DML remains inside the network-isolated audit container and is never copied to GT.
The exact container is stopped and recoverable; no user containers were deleted.

Remaining Phase 0 work includes resolving dependency order and invalid source SQL,
complete platform-specific verification, reconstructing missing objects, checking
effective grants, and reviewing a clean GT canonical baseline. The replay is
evidence of the reconstruction problem, not completion of the reconstruction.
