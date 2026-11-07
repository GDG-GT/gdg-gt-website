# GDG GT continuation checkpoint — 2026-11-07

The full PRD remains incomplete. Continue feasible local work, preserve edits
and verify uncertain partial operations before repeating commands. No owned
verification or experimental server process is currently running. Historical
intermediate checkpoints are preserved in CHECKPOINT_HISTORY_TABLES_20261107.md.
Read git log for the latest documentation save.

## Authorization and preservation

Local only: no push/deploy, production changes, purchases, real provider sends,
new timers or AI commit trailers. SSO/Google and Bevy/Engage remain deferred.
No subagents requested; no goal or timer created. Keep the officer entrance
hidden in public copy; preserve the moving hero and neutral workspace.

Preserve and exclude from staging:

- supabase/.temp/cli-latest (modified)
- src/components/admin/PageAccessGuard 2.tsx (untracked)
- src/ui/linktree/useLinktreeRead 2.ts (untracked)

Never print .env.server.local or .docs/local-auth.local. SQL is applied through137.
No SQL or actual application API mutation occurred in this continuation. Do not
reset/bootstrap/replay migrations, reinstall packages or recreate actors. Do not
touch shared user browser tabs/zoom/preferences or kill user processes.

## Latest verified application

Branch feat/ui-local. Source fixes saved **aeb6fca** (39 owned paths); preceding
finance/content fixes **9ebb6a8** (31 paths), earlier **20b59e2** and **f163842**.
All saves have no AI trailer. Only the three preserved user files were dirty
immediately after the source save; subsequent changes are trial evidence/docs.

All36 native JSX tables now use existing named ScrollableTable keyboard handling,
including finance, CMS, collections, newsletter, forms, media, editorial and native
answer grids. Nested radio/checkbox controls preserve their native key behavior.
A scoped min-width0 rule on the builder dialog's direct tab panel fixes actual
mobile clipping when populated private-link rows set a minimum content width.
No global dialog or artwork redesign. Source ancestry audit:
phase0/table-keyboard-source-audit.json.

The finance review fixture was corrected to canonical pending status, matching
count and a different submitting officer; unsupported previous fixture label was
not a production state. Original and corrected invocations/captures are separate.

## Completed checks — do not blindly repeat

- Full current source coverage11866 finished/reaped0: **2722 tests/222 files**.
  Unchanged global70% and all21 individual critical90%-branch gates pass.
  Lines78.16/statements76.17/functions70.77/branches75.63. One worker, no competing
  browser/build/types/performance. Raw artifacts/quality/table-keyboard-tests.json;
  coverage/table-keyboard-final-20261107; /tmp/gdg-final-table-coverage.log;
  phase0/table-keyboard-quality.json. App source unchanged afterward.
- New finance/content78, remaining-table30 and inventory/grid24 browser checks
  pass across all six profiles, with no skips/failures/retries. Twelve existing
  builder Settings/Logic checks also pass. These are separate invocations/source
  checkpoints, not one complete final-build run. Logs /tmp/gdg-finance-content-
  refreshed-browser.log, /tmp/gdg-remaining-tables-final-browser.log,
  /tmp/gdg-inventory-keyboard-final-browser.log and
  /tmp/gdg-builder-tools-table-fix-browser.log. Sessions75056/89882 reaped0.
- Targeted source scopes52/103/100 tests pass; full current2722 run supersedes
  their source-count uncertainty. All types/build/byte/catalog checks pass.
  Latest initialJS108187 gzip, public-route union149001, CSS29947, font48432,
  offline493327 raw. New browser cases are mapped without accepting PRD IDs.
- Latest artifact34141 reaped0: PWA15/update9/HTTPS46. See
  phase0/final-table-artifact-probes.json and /tmp/gdg-final-tables-*.log.
- Final full lint74094 reaped0: zero errors/10 inherited warnings, unchanged
  warning budget. Initial full lint found three generated coverage-helper
  warnings outside the existing coverage/** exclusion. Report moved intact into
  coverage/table-keyboard-final-20261107; no rule/exclusion/limit changed. Original
  failure log /tmp/gdg-final-tables-lint.log; passing final-lint.log separate.
- Latest production dependency audit has zero findings; no dependency changed.
  Source/history secret scans pass with exact non-secret checksum-line reviews,
  no broad exclusions. Final docs scan54414 reaped0:157commits/1940files/0unreviewed.
  Original intermediate scans remain historical; no rule/path exclusions added.
- Exact list-only catalog: **1680 unique cases**, disjoint560-case shards.
  phase0/browser-shard-inventory.json; /tmp/gdg-final-table-inventory[-1/-2/-3].json.
  This is not execution or remote CI.

The previous complete1548-case run18562 passed1540/eight expected profile skips
with zero failures/retries, on saved f163842-source artifact. Both original desktop
WebGL motion checks pass. Four skips are mobile-menu checks on desktop; four are
desktop-motion checks on unsupported profiles. Raw final-current-inventory and
phase0/final-current-inventory-browser.json remain preserved. Do not call it a
complete current1680-case execution.

## Visual review evidence

All captures remain unapproved. Index paths are under artifacts/browser/:

- current-primary-review/index.html:138 checks/162 captures/22 prompt groups from
  the saved complete invocation.
- secondary-review/index.html:44 states/264 checks/344 captures, separate run.
- current-recovery-review/index.html:18 functional states/108 original captures;
  scroll/table positions differ from initial composition views.
- finance-content-current-review/index.html:13 states/78 checks/78 captures.
  Earlier finance-content-review remains preserved with the original fixture.
- remaining-table-review/index.html:5 states/30 checks/32 captures, including two
  mobile private-link lower-control views.
- inventory-keyboard-review/index.html:4 states/24 checks/24 captures.

Mobile finance/resource editors, private-link dialog top/lower controls, native
answer grid and editorial inventory, plus desktop finance reports were inspected.
No human fidelity, approved goldens, physical-device or manual accessibility
approval is inferred. Read REMAINING_TABLE_KEYBOARD_REVIEW.md for exact scope.
Fixtures refuse real writes/decisions/publication/invitations/responses/sends.

## Mobile performance — still failing; prototypes unadopted

Last main baseline Home/Events/Contact mobileLCP3040/2859/3007ms fails2500. All
desktop performance100, accessibility100/visible-label match, CLS0. This is a
prior-source measurement, not a fresh run for final table wrappers.

Separate rejected Home trials, same pinned Lighthouse13.6/default mobile/gzip:

- Naive real-markup static replacement3063ms.
- Matching React hydration2669ms; retained hero DOM and native lock proven.
- Home CSS subset2714ms; scheduled attachment2785ms.
- Native Home media hints2732ms; low module fetch priority2735ms.
- Paint-first actual module download2884ms, TTI2948ms;12 browser cases pass.
- Primary image decoding=async2808ms, TTI2889ms;12 browser cases pass.

None meets the threshold or demonstrates a gain over simple matching hydration.
No experimental app source or image/font change was adopted. See
FIRST_PAINT_FEASIBILITY.md, phase0/hydration-*-trial.json and ignored
artifacts/performance/hydration-* raw reports. All timing jobs/servers reaped.
The initial malformed static fixture and wrong-heading test failures remain
separate; no test/preset/timeout/retry/gate was weakened.

Existing isolated trial root:
/Users/tejas/.cache/gdg-hydration-trial-7shvwpda
Detached checkout based on f163842, reused reviewed dependency cache, no install.
Its source retains matching-hydration prototype changes; CSS loader/scheduler
variants archived in probe/rejected-scheduled-source. Primary async hint source
was restored; generated checkout dist/server/SSR document still contain the last
async trial until a fresh baseline build. Do not infer restored generated files.
Original source backups: probe/hydration-only-source and
probe/home-before-async-decode.tsx. Last variants archived under probe/paint-first-*
and probe/*async-decode*, immutable performance-*-dist clones retained. No active
probe server. Do not recreate worktree, dependencies, prior trials or measurements.

## Runtime

Main UI8080/API8081; preview4173 for fictional browser review only. Supabase54361,
DB54362, Mailpit54364, Colima colima-gdg-gt, DB supabase_db_gdg-gt-prd-local. Do not
duplicate services. Last free space54GiB. Dependencies symlink to
/Users/tejas/.cache/gdg-gt-deps.8xnflb18/node_modules; Node26.13.
Pinned Lighthouse CLI:
/Users/tejas/.npm/_npx/ba16b138af87a83e/node_modules/lighthouse/cli/index.js

## Remaining PRD acceptance

All146 requirements/307 logical cases are source-mapped; full acceptance remains
unverified. Remaining: mobileLCP; representative3Dhardware/load and fieldp75
LCP/INP/CLS; applicable content/account/operations secondary and complete manual
keyboard/AT/actual200%zoom/forced-colors review; approved chapter assets/copy,
blocking Tejas fidelity approval and approved1%goldens; physicalSafari/devices,
install/update/push; GT staging/hosting/domains/secrets/providers/CORS/scanners/
scheduler/CSP/CI/monitoring/alerts; hostedPITR/objectrestore/RPO-RTO/migration/
rollback/48hour observation; institutional brand/privacy/retention/finance signoff.
SSO/Google and Bevy/Engage remain explicitly deferred. No completion percentage
or full PRD/launch success claim is warranted.
