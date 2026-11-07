# Local implementation and acceptance audit — 2026-11-07

The current local application includes canonical recovery migrations through 137,
React Router 7.18.5, the scoped KaTeX 0.18.2 security patch, visible-label and
native drawing-control fixes, keyboard scrolling for long reviews/tables, and
publication/history contrast and target-size corrections. Source fixes are saved
in 20b59e2. No deployment, production change or provider send occurred.

Complete source coverage passes **2,722 tests in 222 files**, with the unchanged
70% global and all 21 individual 90%-branch gates. Coverage is 78.16% lines,
76.17% statements, 70.77% functions and 75.63% branches. Subsequent application
changes were CSS only; instrumented source stayed unchanged. Build, strict types,
byte and traceability checks pass. Lint has zero errors and ten inherited warnings.
The fresh production dependency audit has zero findings; the final source/history
scan has zero unreviewed findings. None of these is a launch certificate.

The **complete 1,548-case browser invocation passes 1,540 cases with eight
expected profile-specific skips**, zero failures or retries, across six profiles.
All case identities match the listed inventory. Both original desktop WebGL
motion checks pass. Four skips are the mobile-menu test on desktop profiles;
four are the desktop-motion test on unsupported profiles. Earlier failing
invocations remain historical evidence. See
`phase0/final-current-inventory-browser.json`.

The primary index now has 138 checks and 162 unapproved captures from that same
full invocation. The secondary index has 44 states, 264 passing checks and 344
unapproved captures. A separate recovery index links 18 states and 108 original
functional screenshots; their retained scroll positions differ from initial
composition views. Some mobile account/member/privacy and desktop privacy
captures were inspected. No human visual approval, approved golden baseline or
physical-device acceptance is claimed.

The final artifact passes 15 PWA boundaries, nine update checks and 46 configured
HTTPS/header checks. Isolated mobile LCP is **3,040 / 2,859 / 3,007ms** for
Home/Events/Contact, still over 2,500ms. All three desktop performance scores and
all accessibility scores are 100; explicit visible-label checks pass and CLS is
zero. A scratch static-replacement first-paint trial still fails at 3,063ms and
was rejected without changing the verified app. See `FIRST_PAINT_FEASIBILITY.md`.

**The full PRD remains incomplete.** All 146 numbered requirements and 307 logical
cases are source-mapped, with full acceptance unverified. Field/hardware,
manual accessibility, approved visual/content, physical-device and hosted
operations gates remain separate. The dated entries below are historical.

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
