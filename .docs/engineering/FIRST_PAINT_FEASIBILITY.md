# Earlier public paint investigation — 2026-11-07

Current mobile LCP still fails 2,500ms. Source review found an existing per-route
HTML handler (`api/site.mjs` and `shared/site-document.mjs`) that renders a text
fallback before the client application replaces it. The laboratory performance
probe serves the static build directly; these delivery paths remain distinct.

A scratch renderer used the actual HomePage, SiteShell and existing providers,
with a static router, environment files disabled and every fetch refused. It
renders 11,707 bytes with one h1 and the real hero; no network read occurs. Two
hero images intentionally depend on commit-time src assignment for WebKit's
picture behavior. The initial scratch loader also started default dependency
discovery into shutdown; that diagnostic and the development React prop warning
are preserved. A separate production/no-discovery run finishes without warnings.
See `../phase0/first-paint-render-feasibility.json`.

An isolated clone then inserted that real markup, native inertness and parser
image sources, retaining the current createRoot application. The corrected
Home-mobile trial records **LCP3,063ms**, accessibility100, matching visible
labels andCLS0. It still fails the unchanged threshold and does not demonstrate
an improvement over the current3,040ms measurement. The simple replacement
prototype is **rejected**; no app source or main dist change was adopted.
See `../phase0/first-paint-static-replacement-trial.json` and ignored raw reports
under `artifacts/performance/first-paint-trial`.

The first fixture placed attributes after a self-closing slash on two images.
Its summary/log remain as rejected malformed-fixture evidence. Its raw Lighthouse
file was overwritten by the corrected run before an archive could be verified;
no preserved raw initial report or usable performance result is claimed.

A proper hydration trial needs identical initial server/client trees and data,
not warning suppression. React documents that contract in
[hydrateRoot](https://react.dev/reference/react-dom/client/hydrateRoot).
The project's router needs a data-router server provider; compare the installed
7.18.5 implementation with
[StaticRouterProvider](https://api.reactrouter.com/v7/functions/react_router.StaticRouterProvider.html).
Current online state, route initialization, inertness and picture-source
assignment need explicit treatment. Approved public copy, route selection,
maintenance, private/Form boundaries, CSP and cache behavior must remain intact.
Keep such a trial isolated until actual browser identity, interaction, image,
accessibility and unchanged performance checks demonstrate it works.

## Matching hydration investigation

An isolated detached worktree based on f163842 renders the same real React tree
under the installed data-router server provider, with no inline hydration script,
network reads, new dependencies or production bootstrap. Its explicit Home marker
selects hydrateRoot; other documents retain createRoot. Initial picture sources
are latched so hydration preserves the actual hero DOM node and later navigation
retains the existing WebKit fallback behavior. Native inertness remains until the
current availability read resolves. Six-profile browser checks pass.

The simple matching version measures mobile LCP **2,669ms**, still above 2,500ms.
A compiled Home CSS subset measures **2,714ms**; a two-frame attachment scheduler
measures **2,785ms**. Their 18-case route/CSS/native-lock browser proof passes,
but neither demonstrates a speed gain. Both variants are archived outside the
checkout and rejected. Original font, full CSS and main app remain unchanged.

Native media-specific Home image preload links then replace only the redundant
Home helper script. Twelve immediate/delayed availability cases pass across all
six profiles, including DOM identity, native focus lock, navigation away/back,
mobile image selection, axe, and zero hydration/page errors or writes. An initial
12-case failure was a newly written wrong Events-heading expectation, corrected
to the actual heading; its original report/source are retained separately.
The resulting LCP is **2,732ms**. Giving the module script and modulepreload low
priority also passes twelve checks, but measures **2,735ms**, TBT5.5ms and
TTI2,803ms. Neither variant meets the target or demonstrates an improvement.
Native fetch priority is a browser hint, as specified in the
[HTML standard](https://html.spec.whatwg.org/multipage/scripting.html).

All trials use the same pinned Lighthouse13.6/default mobile preset, gzip delivery
and 2,500ms threshold, with browser/build/type/coverage jobs stopped for timing.
All report accessibility100, matching visible labels andCLS0. Their prototype
results do not replace the current main Home/Events/Contact measurements or
certify field/device/hosted acceptance. No experimental application source was
adopted. Results: `../phase0/hydration-*-trial.json`, `../phase0/hydration-*-browser.json`;
raw reports are under ignored `artifacts/performance/hydration-*`.

## Scheduling the module download

A distinct HTML-only trial replaces the initial main script/modulepreload with
a 383-byte external bootstrap. The bootstrap starts the actual React import
after two animation frames, with a 100ms fallback and immediate initialization
when hidden. The matching inert server tree, full CSS, font, imagery and other
route documents remain unchanged. Twelve immediate/delayed availability checks
pass across all six profiles, preserving the actual hero DOM, native lock, image
selection, navigation, accessibility and zero application writes/errors.

The unchanged isolated Lighthouse mobile run measures **LCP2,884ms**, FCP1,064ms,
TTI2,948ms, performance95, accessibility100 andCLS0. The main graph starts loading
at about125ms in the raw trace. This still fails2,500ms and does not demonstrate
a gain over the simpler matching hydration version. It is rejected. The
prototype is archived, its plain hydration fixture restored, and the verified
main app/artifact remains untouched. Source/evidence: existing isolated
probe/paint-first-* and performance-paint-first-dist;
../phase0/hydration-paint-first-browser.json,
../phase0/hydration-home-mobile-paint-first-trial.json and ignored raw
artifacts/performance/hydration-paint-first. This is not production SSR delivery
or complete PRD acceptance.

## Primary-image decoding hint

A final separate trial adds only decoding=async to the primary hero image. The
secondary campus image already used that hint and remains unchanged. Matching
server/client builds render 11,929 bytes with one h1, native inertness, no inline
scripts and no render-time fetch. All twelve immediate/delayed availability cases
pass across six profiles, including DOM identity, native focus lock, navigation,
mobile image selection, axe and zero page/hydration errors or writes.

The unchanged isolated mobile measurement is **LCP2,808ms**, FCP972ms, TTI2,889ms,
TBT34.5ms, performance96, accessibility100 andCLS0. This still fails2,500ms and
does not demonstrate an improvement over simple matching hydration. It is
rejected. Source/test variants and the immutable build/raw measurement are
archived; the isolated source is restored. Its generated dist/server document
still contains the last async trial until a new baseline build, and no fixture
server remains running. Main source/dist remains the verified aeb6fca artifact.
See ../phase0/hydration-async-decode-browser.json and
../phase0/hydration-home-mobile-async-decode-trial.json, with raw reports under
ignored artifacts/performance/hydration-async-decode.

## Shared modulepreload diagnostic

An HTML-only diagnostic retained the immutable native-hint hydration build and
removed its shared modulepreload link, without changing the React module, full
CSS, font, artwork, default mobile preset or 2,500ms threshold. It measures
LCP2,769ms, accessibility100, matching labels andCLS0. It still fails and does
not demonstrate an improvement. No application source or immutable trial build
was changed. The distinct probe and raw report remain under the existing trial
root / `artifacts/performance/hydration-no-shared-preload`; summary:
`../phase0/hydration-home-mobile-no-shared-preload-trial.json`. This result is
rejected and is not production performance evidence.
