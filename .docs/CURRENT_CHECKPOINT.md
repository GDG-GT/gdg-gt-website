# Current GDG GT continuation checkpoint

Updated 2026-11-07. Full PRD remains incomplete. Continue feasible local work;
this file is a recovery checkpoint, not an acceptance certificate.

## Authorization and preservation

Local only: no push/deployment, production changes, purchases, real provider sends,
new timers or AI commit trailers. SSO/Google and Bevy/Engage remain deferred.
No subagents requested; no goal or timer created. Canonical SQL is applied through
137. No SQL/API writes were made in the current dependency/editor continuation.
Do not reset/bootstrap/replay applied migrations or recreate test actors.

Preserve and exclude from staging:

- modified `supabase/.temp/cli-latest`
- untracked `src/components/admin/PageAccessGuard 2.tsx`
- untracked `src/ui/linktree/useLinktreeRead 2.ts`

Never print `.env.server.local` or `.docs/local-auth.local`.

## Saved and active source

Branch `feat/ui-local`; HEAD `4ed0b55` saves visible accessible labels and expanded
event review. Earlier `01f8859` saves the lightweight public availability reader;
`1439a91` saves React Router 7.18.5. Historical details and failed invocations are
retained in the dedicated documents and phase0 JSON, rather than repeated here
as stale current instructions.

Current uncommitted source:

1. Scoped Mermaid => KaTeX 0.18.2 override. Installed already; do not reinstall.
   Only `node_modules/katex` resolved lock entry changed. Root/cache/hidden lock
   metadata aligned; SharpWASM/Emnapi retained. Production audit exits 0 with zero
   findings. Rollback `/Users/tejas/.cache/gdg-katex-patch-mys214iv` holds old live
   package plus manifests/locks. Pointer `/tmp/gdg-katex-patch-backup-path`.
   Six actual installed-package inherited-trust/ordinary-math regressions pass;
   old-vs-patched proof and 66 Mermaid/converter plus six actual BoardCanvas
   engine/version compatibility checks are preserved. See
   `DEPENDENCY_SECURITY_REVIEW.md` and `phase0/katex-patch-audit.json`.
2. Native drawing-menu and visible zoom-percentage accessible names via scoped,
   disconnectable DOM adapter in `BoardCanvas`; no vendor edits/editor-state
   changes. Two adapter units pass. Twelve actual editor/collaborator browser
   cases across six profiles pass in the final KaTeX focused invocation.
3. Hero sprinkle instancing: the same 84 capsule transforms, colors, geometry and
   roughness now use one draw call. Independent real-Three geometry/color unit
   passes. No artwork, lighting, DPR, animation or motion policy changes. Build
   completed successfully at `/tmp/gdg-hero-instancing-build.log`.

Temporary hero diagnostic spec was copied to
`/tmp/gdg-katex-hero-diagnostic-preserved.spec.ts` and removed from repository.
Do not restore it to the inventory. GPU ReadPixels stalls were observed; no
performance fix is claimed from that diagnostic or the instancing unit.

## Actual browser status

Saved 4ed0b55 full 1380-case invocation: 1372 passed, eight expected skips,
zero failures/retries. This is the pre-KaTeX/pre-instancing baseline.

Current dependency/editor 102-case scope: 92 passed, eight expected skips,
two Chromium software-WebGL failures. All 12 actual editor and six complete
workspace navigation cases pass. Evidence `phase0/katex-focused-browser.json`;
raw `/tmp/gdg-katex-final-browser.json`. Editor-only extraction explicitly
records that the enclosing invocation failed.

Unchanged motion isolation before instancing: 0/2 pass; raw
`/tmp/gdg-katex-isolated-motion.json`. Diagnostic then observed loaded canvas
and GPU readback stalls. Post-instancing original two desktop cases also fail
screenshot readback at unchanged 10-second limit, one worker, with no concurrent
build/types/coverage/performance. Session23795 completed/reaped exit1. Evidence
`phase0/hero-instancing-motion.json`; raw `/tmp/gdg-hero-instancing-motion.json`;
artifacts `artifacts/browser/hero-instancing-motion`.

Do not weaken limits, retries, assertions, skips or the real moving-WebGL
requirement. Do not claim complete current 1392-case browser acceptance.

## Verification in progress / next

Latest source build, strict types, lint0errors/10inherited warnings, byte budgets
and PRD catalog pass. Complete one-worker coverage session41721 completed/reaped0:
**2696tests/220files**, lines78.16/statements76.16/functions70.80/branches75.62;
all unchanged global70 and21critical90 branch gates pass. No competing browser/
build/types/performance ran. Raw `artifacts/quality/katex-instancing-coverage.json`,
log `/tmp/gdg-katex-instancing-coverage.log`, evidence
`phase0/katex-instancing-quality.json`. Do not duplicate the full coverage run.
Earlier full failures are preserved separately.

New `tests/browser/task-message-compositions.spec.ts` adds six read-only states:
task inventory/discussion/editor, private conversation/compose/review request.
First desktop diagnostic58718 completed/reaped1:2pass/4fail from new exact-label
locators omitting native required asterisks/help; snapshots show controls present.
Semantic textbox+anchored-prefix locators corrected these harness mistakes without
product/limit/gate changes. Corrected desktop85997 passes6/6. Failure evidence
`phase0/task-message-initial-browser.json`; raw files under/tmp retained.

Expanded secondary invocation67249 completed/reaped0: **162pass/0skip/0fail/0retry**
across six profiles,27states/210captures. Includes actual whiteboard and newtask/
message states with same axe/scroll/overflow/heading/no-write/exception checks.
Evidence `phase0/collaboration-secondary-browser.json`; actual raw
`artifacts/browser/secondary-review/results.json`; log
`/tmp/gdg-collaboration-secondary-browser.log`. Strict secondary index generation
passes. Desktop/mobile task-editor/conversation and earlier whiteboard captures
were inspected; no human approval/goldens/device acceptance inferred.

Previous19-state/full-primary source directory moved intact to
`artifacts/browser/secondary-review-before-collaboration-20261107` before newrun.
Current primary generator reads that preserved successful full invocation and
resolves its original attachment paths relative to moved source; report/image
bytes unchanged. First generation refused original unmapped attachment paths
(`/tmp/gdg-collaboration-preserved-primary.log`); explicit safe relocation mapping
corrected generator, then138primary checks/162captures regenerate successfully
(`/tmp/gdg-collaboration-preserved-primary-final.log`). SourceCaptureDirectory and
captureRelocation recorded. New secondary-only run does not claim primary checks.

Fresh types57403 andlint64275 completed/reaped0,0errors/10inherited warnings.
Expanded list/shards30330 completed/reaped0:1428unique cases,476per shard, exact
one-to-one disjoint union. Catalog regenerated0 and4traceabilityunits pass
session44200. New exact public inventorydigest line reviewed as nonsecret; no
rule/path exclusions. No full1428case execution claimed.

Final-artifact PWA boundary52411 passes15; changed-asset/two-tab update97644
passes9. No actualAPI/provider writes. Logs
`/tmp/gdg-katex-instancing-{pwa-boundaries,pwa-update}.log`; probe listeners closed.
HTTPS/header85483 completed/reaped0,46checks pass. Evidence
`phase0/katex-instancing-artifact-probes.json` binds all three probes to current
index/manifest/helper hashes. IsolatedLighthouse16952 nowrunning with explicit
labelgate, log `/tmp/gdg-katex-instancing-performance.log`; no competingbrowser/
build/types/coverage. Priorperformance preserved as
`phase0/production-performance-before-katex-instancing.json`.
Lighthouse16952 completed/reaped1 as expected for failingmobileLCP2841/3161/3156ms.
Desktop100/accessibility100/visiblelabels/CLS0 pass throughout; report binds
currentbuild. No competingverification/threshold changes. Current source/artifact
checks complete; secret scan/localcommit remain. After saving, evaluate early
public-route module hints to reduce the remaining route download waterfall; no
new implementation has started yet. Do not repeat completed checks or weaken gates.
Source/history scan5197 completed/reaped0:151commits/1874currentfiles,
zero unreviewed findings. Log/tmp/gdg-katex-instancing-secrets.log. Localcommit
ownedpaths only, no AItrailers; preservedthreefiles muststayunstaged.

## Runtime and evidence limits

Main UI8080/API8081, Supabase54361/DB54362, Mailpit54364, Colima `colima-gdg-gt`,
DB `supabase_db_gdg-gt-prd-local`. Existing production preview4173 serves current
dist for fictional browser review only; real admin writes use primary8080.
Probe ports4184–4188 are owned only during their scripts and close in finally.
Do not duplicate services or touch user browser tabs/zoom/preferences.

Pinned Lighthouse13.6 CLI:
`/Users/tejas/.npm/_npx/ba16b138af87a83e/node_modules/lighthouse/cli/index.js`.
Dependency symlink target `/Users/tejas/.cache/gdg-gt-deps.8xnflb18/node_modules`.
Native shared-Chrome zoom review was deferred and CUA completion sent.

Current primary review:22groups/138checks/162unapproved captures at
`artifacts/browser/current-primary-review/index.html`. Secondary19states/
114checks/162unapproved captures at `artifacts/browser/secondary-review/index.html`.
Whiteboard adds two separately recorded states/12 checks. No approved goldens,
human fidelity approval or1% acceptance is implied. Extend remaining secondary
team-task/DM, campaign audience, media upload/publication, builder access/version/
publish, response history/privacy/export/reveal and content/account/operations
dialog review after saving the current checkpoint.

Current isolated mobileLCP2841/3161/3156ms fails2.5s; desktop100,
accessibility100/visiblelabels/CLS0. Current15PWA/nine update/46HTTPSchecks pass. Font-axis trial was rejected for glyph/metric
changes; originalfont/preload remain. Do not repeat the rejected trial.

All146requirements/307mandatory logical cases are mapped, acceptance unverified.
Human fidelity/approved chapter assets and content, manual keyboard/AT/actual
200% zoom/forced colors, physical Safari/device/install/push, representative
3D hardware/load/field p75, GT staging/domains/providers/CSP/CI/scheduler/monitoring,
hostedPITR/object restore/RPO-RTO/migration rollback48h observation and institutional
brand/privacy/retention/finance sign-off remain. Local tests cannot invent those.
