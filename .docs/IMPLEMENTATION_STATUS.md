# PRD v1.5 implementation status

The full PRD is now in scope following Tejas's request on 2026-10-19. This is an
incremental implementation tracker, not a completion or launch claim.

## Current checkpoint

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

## Required order from here

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

## Current external inputs / gates

- Hosted GT-owned Supabase, Redis/rate-limit, email, scanner/queue, Realtime signing, and
  deployment credentials are not configured. Do not reuse PSU credentials.
- No domains are assumed to be controlled; no purchase or remote deploy is authorized
  by this local checkpoint.
- Approved marks, final content/recipients, financial retention policy, and Tejas's
  visual sign-off remain launch inputs.
- The latest production dependency audit reports 31 findings (16 high, 14 moderate,
  1 low). These remain open pending individually tested remediation; no blanket
  acceptance or `audit fix --force` has been applied.

Phase 0 is in progress. All later phase exit gates remain open.

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
