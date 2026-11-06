# Current local continuation checkpoint

Updated 2026-11-06. Continue the GDG GT PRD task from this verified local
checkpoint; do not repeat completed mutations/probes or rebuild setup from scratch.
This checkpoint does not declare the entire PRD complete.

## Verified router declaration review after c06757a

The installed router was already react-router-dom/react-router 6.30.6 and
@remix-run/router 1.23.4, despite the package.json lower range of ^6.30.1.
Only that declaration and the root lock dependency range are now pinned exactly
to 6.30.6. Every resolved lock entry and all three installed package trees remain
unchanged; a fresh production build has exactly the c06757a entry/manifest/crop/
helper digests. No runtime upgrade or advisory fix is claimed.

The controlled cache operation completed. Snapshot:
`/Users/tejas/.cache/gdg-router-v6-pdgsv9_o`; logs
`/tmp/gdg-router-v6-install.json`, `/tmp/gdg-router-security-audit.json`.
The cache is `/Users/tejas/.cache/gdg-gt-deps.8xnflb18`, still the original
node_modules symlink target. Same-version Playwright packages were normalized;
pruned optional @img/sharp-wasm32 0.35.5 and @emnapi/runtime 1.11.3 were restored
from tarballs after checking original lockfile SHA-512. Do not repeat installation
or restoration; compare actual state first if interruption is suspected.

Production audit remains zero high/critical, two moderate/four low package entries.
Its raw exit is 1, not a clean audit. The two router advisories require 7.18+;
one is a remaining redirect bypass, the other SSR error hydration. Current SSR
error hydration is unused, but the package finding remains. See
`DEPENDENCY_SECURITY_REVIEW.md` and `phase0/router-v6-declaration-review.json`.

Next save this review checkpoint, then perform a controlled local 7.18.5 migration
and verify it. Read-only npm metadata confirms React >=18 and Node >=20; current
React 18.3/Node 26 satisfy that. Metadata: `/tmp/gdg-router-v7-metadata.json`.
No v7 install or SSR implementation has started. A major migration is separate
implementation work within the authorized local PRD scope, not permission to
use an audit force sweep. Preserve all tests/assertions, user edits and cache
rollback snapshots; deployment/production changes/provider sends remain excluded.

## Latest verified route-aware preload continuation after 49f49e6

The navigation-review correction below is saved in local commit 49f49e6. The new
owned changes are ready for a local checkpoint commit: asynchronous home-only
image hints, their source/byte/digest gates and verification evidence. All jobs
are complete. Source/history scanning covers 146 commits and 1,831 current files
with zero unreviewed findings. Preserve the three
unrelated files named below. No app/SQL mutations or dependency upgrades occurred.

`public/assets/public-entry.js` adds the original media-specific atmosphere hints
only on pathname `/`, before the React graph is ready. Other public pages no
longer fetch home artwork. Normal pictures still load when the optional helper
fails. The budget counts its 362 gzip bytes explicitly, caps its raw source at
1,500 bytes and includes its digest in performance evidence. Initial JS totals
114,943 gzip bytes. Stable helper URL revalidates, without any CSP widening.

Removing the font preload was measured/rejected: Home LCP 2,891 ms, CLS 0.031.
The font preload is fully restored. Evidence is retained in
`phase0/production-performance-no-font-preload.json`. An initial premature probe
exited on missing build output before Lighthouse started; its ENOENT log remains
`/tmp/gdg-font-hint-trial.log`. Intermediate deferred-helper results remain in
`phase0/production-performance-deferred-route-hints.json`; the final helper uses
`async` to avoid waiting for stylesheet execution. Nothing from a failed attempt
is treated as accepted measurement.

Final async production public smoke: 76 pass/eight expected profile skips, zero
failures/retries. All six profiles prove no home images on nonhome public pages,
correct Home image pair and failed-helper fallback. An initial parallel GPU case
sampled before software rendering warmed up; the original isolated case passed.
The final check observes motion first, then retains both original consecutive-
frame assertions and all timeouts/250-ms intervals. Default single-worker final
scope passes, without certifying hardware FPS. Evidence:
`phase0/route-hints-browser.json` and `route-hints-initial-browser.json`.

All 46 current HTTPS/header checks and 13 focused helper/traceability unit cases
pass; types/build/byte gates pass; lint remains zero errors/10 inherited warnings.
The full application-source coverage is still the 49f49e6 invocation (2,673 tests/
215 files, all unchanged gates), not a new sum of separate unit runs. Inventory
contains 1,320 cases, three shards of 440, no duplicates; no complete new 1,320-
case invocation or remote CI run is claimed.

Current complete isolated Lighthouse report binds index/manifest/crops/helper
hashes: mobile performance 95/95/95, accessibility 100, CLS zero, LCP
3,003/3,012/3,007 ms. All mobile LCP gates remain failing. Desktop scores 100.
Full earlier metrics remain `phase0/production-performance-before-route-hints.json`.
The current consolidated status and quality/browser evidence state their exact
scopes. Do not overlap future performance runs with build/types/coverage/browser.

Next save this verified local checkpoint without AI trailers, then continue the
remaining dependency review and rendering/secondary acceptance work. A read-only
npm lookup confirmed react-router-dom 6.30.6 depends on react-router 6.30.6 and
@remix-run/router 1.23.4. No install or source dependency change has started.
The owned dependency cache manifest differs from the repo only because it lacks
@playwright/test; lockfiles also differ. Do not blindly overwrite or duplicate
node_modules. Preserve/backup any owned cache metadata before a controlled patch.
Review upstream advisories before any later SSR/manual hydration; it is not yet
implemented. SSO/Google/Bevy/Engage stay deferred, with no deployment or sends.

## Latest verified performance continuation after 2a92521

The secondary chart/review correction below is saved in local commit 2a92521.
Current uncommitted work extracts only the Radix navigation-review dialog into
a deferred chunk. The registry/router blockers remain synchronous. While its
chunk is pending or failed, a small native modal contains focus, refuses
background focus and offers cancellation only. Focus restores to the original
control on cancellation, while accepted navigation owns its destination focus.
No app mutation or SQL change is involved. Startup JavaScript dropped from
126,485 to 114,581 gzip bytes; the build gate now requires this boundary.

Full coverage passes 2,673 tests/215 files and all unchanged global 70% and 21
critical 90%-branch gates: lines 78.11%, statements 76.12%, branches 75.60%,
functions 70.80%. Types/build/byte gates pass; lint remains zero errors/10 warnings.
An initial 162-case browser invocation passed 158 and failed four new WebKit
focus assertions because pointer activation blurs anchors there. Correct explicit
keyboard activation passes all six WebKit new cases. Diagnostics are retained,
and no timeout/retry was changed. The final rebuilt six-profile navigation and
recovery invocation passes all 162 cases. The nine real two-tab PWA update checks
also pass. There are 1,314 browser cases in the current list-only inventory, 438
per shard; no single fresh complete 1,314-case run is claimed.

Isolated six-route Lighthouse measurement completed with expected exit 1: mobile
scores 96/93/92, accessibility 100, CLS zero, LCP 2,858/3,161/3,305 ms; desktop
scores 100. All mobile LCP gates remain open. Evidence matches the current browser
build hashes. `phase0/production-performance.json` retains the failing results;
the previous report is `phase0/production-performance-before-navigation-review.json`.
All measured jobs and source/history scanning are complete. The scan covers
145 commits and 1,823 current files with zero unreviewed findings.

Next save this verified local correction without trailers, then investigate
resource hints: the global HTML preloads home hero artwork on Events/Contact
(37,624 raw bytes on mobile despite no displayed hero), and every route starts
the 48,432-byte font at high priority. These are measured waterfall findings,
not assumed improvements. Measure font/preload changes in isolation, preserve
both successful and failing evidence and keep private/cache/availability rules.
No SSR, dependency upgrade or deployment has started. If later evaluating SSR,
review [the upstream hydration advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg)
first; manual Data Router SSR hydration has a version-specific advisory absent
from the current client-only render path. Keep that architecture work separate and verified.

## Latest continuation after checkpoint 422970e

The baseline described below was saved in local commit 422970e, without AI
trailers. The new scoped correction fixes response-summary grid layout, adds
question/answer names and value text to meters, and styles coral chart bars
consistently in Chromium/Firefox/WebKit. No SQL or application mutations occurred.

Nine fictional secondary UI states pass all 54 cases across six profiles, with
72 unapproved captures including dialog top/lower-control views. The preceding
60-case invocation on the same build also passes existing response-read recovery.
The initial two failures were wrong inline-inspector test locators after opening
the dialog; their output is retained. No timeout/retry/assertion was weakened.
Twenty-four targeted unit cases, types/build/byte gates pass; lint remains zero
errors/10 inherited warnings. Current inventory is 1,296 cases, 432 per shard.

Read `POPULATED_VISUAL_REVIEW.md` and
`phase0/secondary-composition-browser.json`; browse the ignored local index at
`artifacts/browser/secondary-review/index.html`. Primary index generation now
also includes the existing 12 supplemental private-project/Linktree captures.
Full prior coverage/PWA/header/broad-browser evidence below is baseline evidence.
The preserved performance measurements predate this scoped chart correction;
the known failing mobile LCP threshold remains open.

Continue mobile LCP and remaining secondary/confirmation states, preserving the
baseline and all authorization boundaries. There are no partially applied writes.

## Authorization and preservation

Local only: no deployment/push, production changes, purchases, real provider
sends, another auto-resume timer or AI commit trailers. SSO/Google and
Bevy/Engage remain deferred. Preserve unrelated modified
`supabase/.temp/cli-latest` and untracked
`src/components/admin/PageAccessGuard 2.tsx` and
`src/ui/linktree/useLinktreeRead 2.ts`; keep them out of staging.
Never print `.env.server.local` or `.docs/local-auth.local`.

Applied canonical migrations stop at immutable 137. No SQL changed in this
checkpoint. Existing canonical/legacy-grants/concurrency/restore evidence remains
applicable; do not reset, bootstrap, replay applied migrations or recreate actors.
The earlier directory/contact/merge/privacy recovery probes are complete; their
owned cleanup already passed. Do not resend invitations/mail/exports or replay
those completed API mutations.

## Verified implementation and evidence

- Full unit/coverage invocation: 2,672 tests/214 files, all unchanged global 70%
  and 21 critical 90%-branch gates pass. Lines 78.09%, statements 76.10%, branches
  75.59%, functions 70.75%. Raw JSON: `artifacts/quality/final-unit-coverage.json`;
  summary: `.docs/phase0/final-public-entry-quality.json`.
- Complete broad production-browser baseline: 1,228 passed, eight expected profile
  skips, zero failures/retries. `.docs/phase0/final-public-entry-browser.json`.
  After the final drawer/search correction, all 90 rebuilt-artifact shell cases
  pass across six profiles: `.docs/phase0/final-navigation-browser.json`. These
  are separate invocations, not a single new 1,242-case run.
- Complete current inventory: 1,242 cases, three balanced shards of 414, no
  duplicates or omissions. CI configuration is ready, not remotely executed.
- Primary 22 prompt groups: 138 populated composition cases and 162 unapproved
  captures. Browse `artifacts/browser/visual-review/index.html`; the index and
  `.docs/phase0/populated-visual-review.json` come from the broad baseline.
  Secondary surfaces, approved content/assets, fidelity approval and 1% approved
  baselines remain separate gates.
- Source fixes include route-lazy admin/sign-in/public-page loading, a canonical
  small public availability parser with parity tests, progressive natively inert
  homepage identity, deferred landmark focus and safe shell-load fallback.
  Unused query/toast/tooltip startup mounts have no consumers and were removed;
  packages/helper files remain preserved.
- Portrait crops derive from existing local artwork; both are <=50 kB and now
  mode 0644 for separate static servers. Regeneration is byte-identical. All six
  profiles request exactly the selected hero pair; WebKit's premature fallback
  fetch was corrected by assigning fallback at DOM commit.
- Full 26-link drawer testing found actual mobile opener-focus loss and Chromium
  mobile command Escape refusal. Both are corrected. Search retains invoking
  field/button focus, same-page selections focus existing content, different
  routes retain destination focus, and active IME composition does not close
  the palette. All nine unit cases and final 90 browser cases pass.
- WebKit link traversal uses Option+Tab per Apple's documented behavior, without
  changing browser preferences. Initial wrong-role/readiness/keyboard fixture
  diagnostics and the genuine failures are retained in separate ignored outputs.
- Production PWA checks: 15 real CacheStorage/IndexedDB boundary cases and nine
  changed-offline-asset/two-tab activation/cache-cleanup cases pass. No actual
  application writes/provider sends. `.docs/phase0/production-pwa-*.json`.
- Local HTTPS/CSP checks: 45 pass, including exact configured common headers,
  inline-script refusal and stable-versus-hashed cache responses. Browser CSP
  reports terminate in the owned no-op server. Its initial report-refusal
  harness failure is preserved. Certificates/contexts/listeners were cleaned up.
  Stable artwork/fonts revalidate; only hashed JS/CSS are immutable. Actual
  provider pattern parsing, hosted headers and report-only staging remain open.
- Strict types/build and byte gates pass; lint is zero errors/10 inherited
  warnings (one belongs to preserved untracked user source). Initial gzip JS is
  about 126,480 bytes, CSS 29,746, font 48,432; offline raw install 463,800 bytes.
- Current/history source secret scan passes zero unreviewed findings. The SHA-256
  of public test IDs/profile names has an exact non-secret line review alongside
  two earlier fictional inputs. No scanner rule/path was excluded. Its reviewed
  digest was refreshed for the final 1,242-case inventory. Production audit has
  zero high/critical advisories, with two moderate/four low findings remaining.
- All 307 mandatory IDs and all 146 numbered requirements have reviewed mappings;
  normative Sections 21–33 are represented. Every case/requirement remains
  unverified against complete manual/device/visual/hosted acceptance. The checker
  refuses missing IDs or fabricated acceptance; seven cases are manual-only.

## Performance and running services

Final six-route isolated Lighthouse measurement matches the current build hashes:
mobile performance 94/94/95, accessibility 100, CLS zero, LCP 3,021/3,147/2,899 ms.
Desktop performance 100, accessibility 100, CLS zero. The 2.5-second mobile LCP
threshold is still missed and the script correctly exits nonzero. Do not weaken
it or call field p75 verified. Source: `.docs/phase0/production-performance.json`.
Pinned CLI: `/Users/tejas/.npm/_npx/ba16b138af87a83e/node_modules/lighthouse/cli/index.js`;
set `GDG_LIGHTHOUSE_CLI` for `scripts/test-production-performance.mjs`.
Run measurements without competing build/types/coverage/browser loads.

Main local app `http://127.0.0.1:8080/` and API health on 8081 were verified 200.
Existing Supabase remains on 54361/54362, Mailpit 54364, Colima context
`colima-gdg-gt`, DB `supabase_db_gdg-gt-prd-local`. Do not duplicate services.
Owned production preview 4173 session 93659 remains for browser tests; it is a
review origin, not the primary app origin for real admin mutations. Native zoom
review was deferred because shared Chrome was in use; no zoom changes or tab
closures were made. Do not close the user's current browser tab.

All verification invocations above completed. There are no active mutations or
partially applied database changes. Earlier active session numbers in conversation
are historical; inspect current state before rerunning. The latest source secret
scan/metadata finalization may still be returning its completion output.

## Next work

The public-entry baseline is saved in 422970e. Save the latest scoped secondary
review correction without AI trailers, excluding the three unrelated user files.
Next local work is mobile LCP and remaining secondary/confirmation review states. Investigate rendering/delivery with measurements; preserve
all private/cache/session boundaries and never prerender or cache private routes.
Do not repeat broad checks without a new change or unresolved failure.

Full PRD acceptance still needs mobile/field p75 LCP-INP-CLS and representative
3D/load profiles, complete secondary visuals and approved chapter content/assets,
human fidelity/brand approval, manual keyboard/assistive technology/actual 200%
zoom/forced colors, physical Safari/device/install/push acceptance, actual GT
staging/hosting/domains/secrets/providers/report-only CSP/CI/scheduler/monitoring,
PITR/object restore with measured RPO-RTO, migration rehearsal, rollback/48-hour
observation and institutional privacy/retention/finance sign-off. Local-only
constraints remain; no accepted PRD percentage or full-completion claim is earned.

Machine-readable consolidated evidence: `.docs/phase0/current-local-status.json`.
Current audit and ledgers: `LOCAL_ACCEPTANCE_AUDIT.md`, `IMPLEMENTATION_STATUS.md`,
`PRD_EXECUTION_BACKLOG.md`. Dedicated public/PWA/header/navigation documents explain
changes, failed diagnostics, results and limits.
