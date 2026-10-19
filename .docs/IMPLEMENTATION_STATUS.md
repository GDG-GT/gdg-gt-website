# PRD v1.5 implementation status

The full PRD is now in scope following Tejas's request on 2026-10-19. This is an
incremental implementation tracker, not a completion or launch claim.

## Current checkpoint

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
