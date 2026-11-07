# GDG GT local release checkpoint — 2026-11-07

The user authorized finishing all feasible local PRD work. All confirmed local
implementation gaps from this audit are addressed and the final local regression
passes. Full PRD/launch acceptance remains separate. Do not invent a percentage.
Read PUBLIC_RENDERING_AND_RELEASE_CHECKS.md and
phase0/public-rendering-release-20261107.json for the exact final evidence.

## Boundaries to preserve

Owner's chosen host/domain, Resend email already integrated, live keys supplied
at launch. Missing keys are launch inputs, not unfinished local features.
SSO/Google and Bevy/Engage remain deferred. No deployment, production changes,
purchases, real provider sends, new timers, subagents or AI commit trailers.
Keep public officer-entry instructions hidden. Preserve the moving hero and
neutral off-white workspace; no new yellow/pure-white redesign.

Preserve/exclude these unrelated files from staging:
- supabase/.temp/cli-latest
- src/components/admin/PageAccessGuard 2.tsx
- src/ui/linktree/useLinktreeRead 2.ts

Never print .env.server.local or .docs/local-auth.local. Migrations 138–140 were
applied forward once to the dedicated local DB. Do not reset/replay migrations,
recreate accounts or change the existing gate. Local gate/cursor SQL fixtures
rolled back; destructive first-owner tests ran only in disposable databases.
Temporary read-only API authentication was signed out. Do not repeat bootstrap.

## Implemented and verified

Saved functional commit 3ad1777 adds reviewed password-confirmed account-security
metrics/gate rotation with atomic receipts, Operations denial clearing, media
cursor pagination, production supervised-worker commands and first-owner setup.
Read ACCOUNT_SECURITY_AND_MEDIA_CURSOR.md and PRODUCTION_RUNTIME.md.

The subsequent public startup work:
- Home/Events/Contact render the actual React tree from fresh public content and
  status. Escaped/validated bootstrap hydrates the same DOM. Known maintenance
  redirects before controls; private/Forms/query-bearing routes retain CSR.
  Native forms stay inert until handlers attach; a failed framework download
  leaves them inert and offers refresh recovery. No inline executable JS.
- Deterministic public CSS closure reduces initial CSS from 29,947 to 18,145 gzip
  bytes. Admin reapplies all canonical sheets in original order. Lossless logo/
  wordmark variants preserve visible RGBA; original artwork/font/moving 3D remain.
- Bounded external loader gives fonts/primary-image decoding and paint an initial
  opportunity, with 200 ms fallback and immediate hidden-tab path. It uses no
  metric API. Public officer session restoration follows load/paint and expedites
  on input/login/workspace intent; direct admin entry stays immediate.
- PWA registration follows load/idle. Stable offline-event subscription fixes two
  real regression failures without changing original assertions. Collapsing the
  account-security disclosure preserves uncertain original operation intent.
- Server renderer lives in private .build/ssr and is explicitly denied by Vite.
  Host packaging includes it with api/site.mjs, never in static public storage.
- Serialized native CSS watcher survives source/config HMR and server restart.
  CI runs the compiled renderer probe. CI browser job budget is 40 minutes because
  604-case shards took up to 21.6 minutes locally; no per-test timeout/retry/gate
  was weakened. No remote CI run occurred.

## Final checks — all completed, no active verification jobs

- Source coverage: 2,755 tests / 228 files, zero failures, exit 0. Lines 78.24%,
  statements 76.17%, functions 71.02%, branches 75.67%. Unchanged global 70% and
  all 22 individual 90%-branch gates pass. Raw report
  artifacts/quality/completion-final-tests.json; coverage/completion-final-20261107;
  log /tmp/gdg-completion-final-coverage.log. Do not repeat without new concerns.
- Full browser inventory: 1,804 passed, eight expected profile skips, zero failures,
  retries/flaky. Exact 1,812 identity match; three disjoint 604-case shards, 302
  cases per each of six profiles. Both original desktop moving-WebGL checks pass.
  All 90 cascade, 24 hydration/failure and 18 security/media checks pass.
  Sessions 76840/21411/23905 reaped exit 0. Raw reports/listed/executed identities
  copied to artifacts/browser/full-prd-20261107/reports; original /tmp shard files
  also remain. Searchable index links 1,336 original unapproved screenshots.
- PWA 15, update 9, HTTPS/CSP/cache 52 pass. Final HTTPS probe now exercises actual
  compiled public HTML, external loader and form unlock under enforced policy.
  Previous CSR-only 46-check report preserved in artifacts/quality. Logs
  /tmp/gdg-completion-pwa.log, /tmp/gdg-completion-pwa-update.log,
  /tmp/gdg-completion-https-ssr.log. Final probe scoped lint passes.
- Strict types, build, byte budgets, compiled-renderer 25, traceability and
  development-file 12 checks pass. Lint zero errors / nine inherited warnings.
  Production dependency audit zero findings. No install/version churn.
- Normal and legacy-default complete 140-migration DB suites pass, including two
  100-client last-slot checks. Isolated 140-migration restore passes. Real local
  security/media API reads returned 200, no actual gate mutation. No DB rerun needed.
- Simultaneous no-content Home/config touches completed HMR and restart; UI root,
  source module and API health read 200. No content/artifact changed afterward.
- Final source/history secret scan passes: 159 commits, 1,992 current files, zero
  unreviewed findings. The public test-identity checksum required an exact-line
  non-secret review, recomputed from its retained identity artifact. No scanner
  rule/path exclusion was added. See phase0/secret-scan.json and
  /tmp/gdg-completion-final-secret-scan-reviewed.log.

## Current performance — all six unchanged lab gates pass

Lighthouse 13.6 default simulated mobile/desktop, gzip, 2,500 ms LCP gate:
mobile Home 1,954.850 ms, Events 909.047 ms, Contact 901.798 ms;
desktop 645.443 / 252.625 / 253.824 ms. Accessibility 100, visible labels match,
CLS zero on all six. Independent earlier decoded-paint Home 1,953.908 ms also
passes. Exact performance artifact hashes match the current dist/private renderer.
See phase0/production-performance.json and artifacts/performance.
Do not rerun without new source/build changes. Local lab evidence does not certify
field p75 INP/LCP, chosen-host latency or representative physical 3D hardware.

Rejected trials and original failing runs remain separate; no degraded image,
font axis or lowered test/coverage/performance threshold was adopted. Scratch
trace scripts were preserved in ignored artifacts/performance/diagnostics.

## Remaining external acceptance

Owner-approved content/assets/visual fidelity and golden baselines; manual AT,
actual 200% zoom and forced colors; physical Safari/mobile/install/update/push;
chosen-host keys/domain/routing/CSP/cache/supervised jobs/scanner/watchdog;
authorized live Resend + signed webhook and VAPID smoke checks after keys;
hosted PITR/object restore/rollback and measured RPO/RTO; 48 hours of observation
AFTER deployment. These are distinct from unfinished local features. All 146
requirements / 307 logical mandatory cases remain conservatively unverified
against the full PRD acceptance definition. No full PRD acceptance is claimed.

## Running local environment

UI http://127.0.0.1:8080 (owned session 97296 / PID 60171), API 8081 (PID 44949).
Existing preview 4173 / PID 1531 was used by browser fixtures; do not kill or
create duplicates. Supabase 54361 / DB 54362 / Mailpit 54364, colima-gdg-gt,
DB supabase_db_gdg-gt-prd-local. Existing dependency cache symlink, no install.
Node 26.13 locally / Node 24 in CI. Last free space approximately 54 GiB.
Earlier detailed checkpoints are preserved in CHECKPOINT_HISTORY_PUBLIC_STARTUP_20261107.md
and CHECKPOINT_HISTORY_TABLES_20261107.md; this checkpoint supersedes them.
