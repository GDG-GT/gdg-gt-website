# Public rendering and local release verification — 2026-11-07

This checkpoint completes the known local implementation gaps identified by the
fresh audit and verifies the public startup changes. It does not substitute for
owner visual approval, physical-device testing or a production launch exercise.
Complete current source coverage, the full browser inventory and final artifact
probes pass. Exact machine evidence is in
[phase0/public-rendering-release-20261107.json](phase0/public-rendering-release-20261107.json).

## Local behavior implemented

The saved account-security, Operations and media work is described in
[ACCOUNT_SECURITY_AND_MEDIA_CURSOR.md](ACCOUNT_SECURITY_AND_MEDIA_CURSOR.md).
Gate rotation is reviewed and atomic, denies stale versions and revoked authority,
and reconciles lost output without rotating twice. The account-security disclosure
now preserves an unconfirmed operation when collapsed. The new security and media
reads returned 200 through the real local API. No actual gate code was rotated.

Home, Events and Contact now render actual React content using fresh public-only
content/availability projections. Escaped, validated bootstrap JSON hydrates the
same tree. A known maintenance state redirects before public controls are served.
Private routes, native Forms and query-bearing public flows retain their existing
client boundary. Server-rendered forms are inert until their real handlers attach;
a framework download failure leaves them inert and shows explicit refresh help.
No public copy reveals the officer entrance.

The public document gives fonts and the primary image a decoding/paint opportunity
before downloading the framework graph. Its external bootstrap has a 200 ms bound
and an immediate hidden-tab path; it does not inspect or manipulate Web Vitals.
Officer-session restoration is separate from public reading and expedites on
user/login/workspace intent. Direct admin startup remains immediate. PWA
registration waits for load/idle. Native offline events keep their state without
an effect rerun overwriting them from navigator.onLine.

A deterministic stylesheet closure includes all public paths, native Forms,
Linktree, login/setup/invitation children, dynamic class prefixes and router loading
markup. Private pages reapply complete canonical sheets in their original order.
This reduces public CSS from 29,947 to 18,145 gzip bytes without inventing a
new visual design. Lossless delivery marks preserve every visible color and alpha
value; original PNGs, artwork, fonts and the moving hero remain canonical.

The renderer is built into private .build/ssr and explicitly denied by the local
file server. It is packaged with the HTML handler, never copied into public dist.
Production worker/scheduler and first-owner procedures are in
[PRODUCTION_RUNTIME.md](PRODUCTION_RUNTIME.md). The owner chooses hosting/domain;
Resend is already integrated. Exact live keys remain planned launch inputs.

## Measured performance

Same pinned Lighthouse 13.6, default simulated mobile/desktop, gzip and 2,500 ms gate.
No competing build, browser suite or coverage process ran during measurement.

| Route | Mobile LCP | Desktop LCP | Accessibility | CLS |
| --- | ---: | ---: | ---: | ---: |
| Home | 1,954.850 ms | 645.443 ms | 100 | 0 |
| Events | 909.047 ms | 252.625 ms | 100 | 0 |
| Contact | 901.798 ms | 253.824 ms | 100 | 0 |

All six lab gates pass. Home also passed an independent earlier decoded-paint
measurement at 1,953.908 ms. Source summary: phase0/production-performance.json;
raw reports: artifacts/performance; log /tmp/gdg-public-completion-performance.log.
These are local lab results, not field p75 INP/LCP or chosen-host latency proof.

Rejected static-replacement/hydration, CSS, font-axis, native-hint, eager-loader,
AVIF and timing variants remain separate. No font/artwork degradation or lowered
preset, threshold, timeout, retry, skip or coverage gate was adopted. The trace
showed the early session request and framework download competing with first
paint. Failed hypotheses were not relabeled as passes.

## Verification record

- Normal and legacy-default 140-migration database suites pass, including new gate,
  cursor and first-owner boundaries plus both 100-client last-slot checks.
- The 140-migration isolated backup/restore proof passes. No production database,
  live backup service, private production object storage or provider was touched.
- Earlier full source run passed 2,750 tests / 227 files after correcting two real
  offline-state regressions. Their original assertions remain unchanged; the
  failed and passing raw reports are separate. Final complete source coverage
  now passes 2,755 tests / 228 files, including five session-start cases, with unchanged
  70% global and all 22 individual 90%-branch gates. Coverage: lines 78.24%, statements
  76.17%, functions 71.02%, branches 75.67%.
- Types/build/bundles/compiled-renderer/traceability checks pass; lint zero errors with
  nine inherited warnings. Production dependency audit reports zero findings.
  Final source/history secret scanning covers 159 commits and 1,992 current files
  with zero unreviewed findings. A public identity-digest line was recomputed and
  reviewed exactly; no scanner rule or path was excluded.
- Earlier 18 six-profile hydration checks pass, preserving heading/hero DOM,
  responsive artwork selection, native form lock and absence of duplicate artwork
  requests. Final six-profile module-failure recovery is in the full current run.
- The initial CSS comparison exposed lazy used-value resolution in closed details.
  Both snapshots now settle the same computed-style walk without removing any
  property/assertion. Final 90-case style comparison is included in the full run.
- Complete current browser execution passes **1,804 / 1,812 cases**, with eight
  expected profile skips, zero failures, retries or flaky cases. All identities
  exactly match the inventory in three disjoint 604-case shards. Both original
  desktop motion cases, all 90 style-cascade, 24 hydration/failure and 18 security/
  media cases pass. Six profiles each contain 302 cases.
- The rebuilt artifact passes 15 PWA boundaries, nine update and 52 HTTPS/CSP/
  cache checks. The strengthened HTTPS probe serves actual compiled public trees
  with fictional bootstrap data and verifies external hydration/unlocked forms,
  alongside the original policy and blocked-inline-execution checks. The earlier
  46-check CSR-only report is preserved separately. The running development
  server passes 12 file-policy checks, including 403 for private renderer and
  credentials, without retaining bodies. A no-content simultaneous source/config
  touch confirms HMR/restart remains alive, with UI/API reads returning 200.
- The local capture index links 1,336 original screenshots from the passing full
  run: artifacts/browser/full-prd-20261107/index.html. Representative mobile
  security, Contact and finance captures were inspected; no approval is implied.
- CI browser job budget is 40 minutes to allow setup plus observed 19–22 minute
  shards. Per-test timeouts, retries and assertions remain unchanged. No remote
  CI run is claimed. Types/build/bundles and all performance artifact hashes match.

All captures are review evidence, not approved visual goldens. No feature count,
source mapping, passing suite or Lighthouse score grants full PRD acceptance.

## Launch-only acceptance remains separate

Owner-approved content/visual fidelity, manual assistive technology/actual 200%
zoom/forced colors, physical Safari/mobile/install/push, live Resend/VAPID checks,
chosen-host secrets/routing/worker/scanner/watchdog, hosted restore/rollback/RPO-RTO
and 48 hours of post-deployment observation remain. SSO/Google and Bevy/Engage are
explicitly deferred. No deployment, production changes, purchases, real provider
sends, new timers, subagents or AI commit trailers are authorized by this record.
