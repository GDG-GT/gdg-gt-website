# PRD v1.5 implementation status

The full PRD is now in scope following Tejas's request on 2026-10-19. This is an
incremental implementation tracker, not a completion or launch claim.

## Current checkpoint

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
