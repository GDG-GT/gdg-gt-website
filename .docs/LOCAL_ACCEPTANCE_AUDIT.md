# Local implementation and acceptance audit — 2026-11-07

Latest functional continuation — 2026-11-07:
read [LOCAL_FUNCTIONAL_VERIFICATION.md](LOCAL_FUNCTIONAL_VERIFICATION.md) and
[the exact current evidence](phase0/local-functional-release-20261107.json).
The additional audit fixed the populated Audit history accessible name,
notification poll cancellation/order, and an actual Forms actions-menu Escape
failure. Final source coverage passes 2,757 tests/228 files with unchanged gates.
Real UI/API/database/local-SMTP workflows pass 144 checks across six profiles;
actual browser zoom passes 164 checks. The broad 1,812-case invocation finished
1,802 passes/eight expected skips/two failures. Both failures were investigated:
the menu fix passes 18 repeated checks and the final affected public/Forms scope
passes 178/eight expected skips. Original failures remain separate; this is not
a fabricated single-invocation green result. Build/types/bytes/SSR25, PWA15/update9/
HTTPS52 and all six performance gates pass on the final artifact.

No confirmed local implementation gap remains from this continuation. Human
screen-reader acceptance is unproved (native tool output failed; preferences were
restored), and physical-device/OS acceptance remains distinct. Visual approval is
excluded from the functional task. Full PRD acceptance is not claimed.

The user has now authorized GDG-GT organization push and production deployment.
Setup is in progress, not claimed live. Domain/provider configuration, hosted
workers/storage/scanner, owner setup and hosted release validation are separate
production work. Live keys are supplied inputs, not missing local features.
SSO/Google and Bevy/Engage remain deferred. No AI commit trailers.


## Previous saved release evidence (d498366)

- Source: 2,755 tests / 228 files, zero failures. Coverage is 78.24% lines,
  76.17% statements, 71.02% functions and 75.67% branches. The global 70% gates
  and all 22 individual 90%-branch gates pass without threshold changes.
- Browser: 1,804 passed / eight expected skips, six profiles, three disjoint
  604-case shards. Every executed identity matches the listed inventory exactly.
  No retries, flaky tests or failures. Both original desktop moving-WebGL cases
  pass; all 90 canonical-style comparisons, 24 hydration/recovery cases and 18
  security/media checks pass. See phase0/public-rendering-release-20261107.json.
- Artifact: build, strict types, byte budgets and compiled SSR 25 checks pass.
  Lint has zero errors and nine inherited warnings; the added HTTPS probe also
  passes scoped lint. Production dependency audit has zero findings.
- Runtime: 12 development-file boundaries pass; HMR and config restart survive
  simultaneous no-content source/config touches and UI/API health return 200.
  Final production PWA boundaries 15, update 9 and HTTPS/CSP/cache 52 pass. The
  HTTPS probe includes actual compiled public trees and external hydration.
- Database: both normal and legacy automatic-grants suites through migration 140
  pass, including two 100-client last-slot checks. Isolated 140-migration restore
  passes. No reset/replay of the existing local database or account/gate change.
- Performance: Lighthouse 13.6 default simulated mobile LCP Home 1,954.850 ms,
  Events 909.047 ms, Contact 901.798 ms. Desktop 645.443 / 252.625 / 253.824 ms.
  All accessibility scores are 100, visible-label checks pass and CLS is zero.
  The report's artifact hashes match the current build. Local lab evidence does
  not establish field p75, actual device performance or chosen-host latency.
- Visual: 1,336 original current-run captures have a searchable local index at
  artifacts/browser/full-prd-20261107/index.html. Representative mobile security,
  Contact and finance review captures were inspected. All remain unapproved,
  with no golden baseline or full human fidelity/assistive-technology claim.

All 146 numbered requirements and 307 logical mandatory cases remain mapped,
with complete acceptance unverified. This conservative state includes manual,
physical-device, owner visual and hosted gates; it does not mean all local
features are missing. CI is configured but no remote CI execution is claimed.
The browser job budget is now 40 minutes because 604-case shards took up to
21.6 minutes locally before CI setup; per-test timeouts/retries/assertions remain
unchanged. Failed earlier trials remain separate from the passing invocation.

## Historical implementation evidence

The dated scopes below record earlier local checkpoints; the current summary
above and `phase0/current-local-status.json` supersede their current-count wording.

## Confirmed local work

Public-reader continuation: exact six-field browser projection removes the Zod
startup dependency while keeping the independent authoritative server schema.
Initial JS107,948 gzip bytes (16,623 less than v7 baseline). Full coverage2,687
tests/217files and unchanged gates pass. Final public/lazy-shell scope112passes/
eight expected skips across six profiles; the initial111/eight/one WebKit
automation-fill-while-inert failure is retained separately. Explicit native-unlock
test preconditions and added field focus/value assertions address the fixture
race without changing production footer logic. All15PWA/nine update/46HTTPS checks
pass. MobileLCP2,977/3,157/3,154ms still fails2.5s. Inspecting individual Lighthouse
audits also exposed a concrete brand-link visible-label/accessible-name mismatch
(WCAG2.5.3), despite aggregate accessibility100; correction/explicit-rule review
is the next local action. See `PUBLIC_ENTRY_PERFORMANCE.md` and current evidence.

1. Community directory: parent permission/inventory/detail/activity reads are
   implemented and verified locally (`MEMBER_READ_RECOVERY.md`). Complete eligible
   merge candidate paging, current source-bound independent selected-target reads
   and the destination-team ceiling are now addressed locally in
   `MEMBER_SELECTION_RECOVERY.md`. Ordinary create/update/archive/restore/profile-
   sync/unmerge original-outcome recovery is now implemented locally in
   `MEMBER_WRITE_RECOVERY.md`, applied migration 133. Merge review/commit original-outcome recovery is also
   implemented locally (`MEMBER_MERGE_WRITE_RECOVERY.md`, applied migration 135),
   preserving source/target/revision/current proof/profile rules and CSV transfers.
2. Contact inbox: selected refresh/retry, retained dated snapshots/proposals,
   denial/context/offline clearing, malformed-result refusal, reviewed stale reload,
   immediate redaction clearing and scoped short-lived attachment links are now
   implemented locally (`CONTACT_INBOX_READ_RECOVERY.md`). Status/hold mutation
   original-outcome recovery is now implemented locally (`CONTACT_WRITE_RECOVERY.md`,
   applied migration 134). Minimal current-session receipts and exact fresh-proof
   retries cover accepted-but-lost replies; full acceptance remains separate.
3. Person-data privacy: retained timestamped cleanup metadata, explicit initial/
   background/stuck-read retry, current-denial private clearing, account/session
   isolation, offline approval fencing and guarded review navigation are now
   implemented locally (`PRIVACY_READ_RECOVERY.md`). Original review/commit
   reconciliation is also implemented locally (`PERSON_PRIVACY_WRITE_RECOVERY.md`,
   applied migrations 136/137), preserving exact source/hold/expiry/current proof
   and single-use exports. A fresh final implementation audit remains required;
   this does not certify physical erasure or complete PRD acceptance.
4. Final coverage passes unchanged gates: all 2,672 tests/214 files pass,
   lines 78.09%, branches 75.59%, statements 76.10%, functions 70.75%; all 21
   critical branch gates pass. See `phase0/final-public-entry-quality.json`.
   The earlier unused-helper retirement denominator change is separately
   documented in `UNUSED_HELPER_RETIREMENT.md`. Complete broad browser baseline
   passed 1,228 cases plus eight expected skips, with zero failures. Final
   rebuilt-artifact navigation/lazy-shell/workspace scope passes all 90 cases.
   The current catalog partitions 1,242 cases into three shards of 414, with no
   missing/duplicate cases; no GitHub run is claimed.
   The 22 primary prompt groups have 162 unapproved screenshots from 138 passing
   composition checks. See `POPULATED_VISUAL_REVIEW.md`.
5. Production PWA: 15 real CacheStorage/IndexedDB boundary checks and nine
   two-tab update checks pass locally. The latter now covers changed offline HTML,
   exact precache revision changes, approved activation and obsolete cache cleanup;
   no real application writes or provider sends. Actual installed-device and
   hosted hashed-asset rollout/rollback acceptance remains open.
6. Public entry: route-lazy shell/sign-in/public-page loading, preserved pending
   route focus, safe shell-error fallback and progressive homepage availability
   are implemented. Public identity paints while controls remain natively inert
   until availability resolves; live confirmation preserves mounted content and
   maintenance still redirects. Current public JavaScript is about 126 kB gzip.
   Drawer/search invocation and destination focus are corrected, including
   Chromium-mobile Escape and active composition. All nine unit cases and the
   final 90-case browser scope pass (`WORKSPACE_NAVIGATION_CHECKS.md`). Mobile
   LCP remains a confirmed performance gap; actual zoom remains unverified.
7. Local HTTPS/CSP enforcement passes 45 checks, including inline-script refusal
   and stable-versus-hashed asset response caching. Stable artwork/fonts revalidate;
   only hashed JS/CSS are immutable (`PRODUCTION_HEADER_CHECKS.md`). Local secret
   scanning passes with exact non-secret line reviews; no rules or paths excluded.
   Types/build/budgets pass; lint has zero errors/10 existing warnings. The
   production dependency audit has zero high/critical findings, with two moderate
   and four low findings remaining. Actual hosted/staging security sign-off is open.

## Acceptance work still separate

- Full acceptance of all mapped mandatory IDs and normative Sections 21–33,
  including complete negative-role/team and populated/mutation/dialog states.
- Complete secondary prompt surfaces, approved assets/content and Tejas's
  blocking fidelity approval, then approved baselines and 1% visual diffs at
  1920×1080, 1440×900 and mobile. Primary review captures do not close this gate.
- Manual keyboard, assistive technology, 200% zoom, actual Safari/devices,
  Lighthouse accessibility 100/performance targets, runtime Web Vitals and
  representative 3D hardware/load testing.
- Physical PWA installation/update/cache/queue multi-tab and logout scenarios;
  actual supported-device opt-in push permission/delivery/click acceptance.
- GT-owned hosting/domains/secrets/mail DNS/VAPID/storage CORS/scanner/scheduler,
  hosted headers/CSP/CI/staging, supervised monitoring/alerts, PITR/object restore,
  RPO/RTO and 48-hour rollback/observation; institutional retention/finance/privacy
  and brand approval.

SSO/Google and Bevy/Engage remain explicitly deferred. Local-only authorization
does not authorize deployment, production changes, purchases, real provider sends,
another auto-resume timer or AI commit trailers. Existing user edits remain intact.
