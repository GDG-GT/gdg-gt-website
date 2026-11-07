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
See `phase0/first-paint-render-feasibility.json`.

An isolated clone then inserted that real markup, native inertness and parser
image sources, retaining the current createRoot application. The corrected
Home-mobile trial records **LCP3,063ms**, accessibility100, matching visible
labels andCLS0. It still fails the unchanged threshold and does not demonstrate
an improvement over the current3,040ms measurement. The simple replacement
prototype is **rejected**; no app source or main dist change was adopted.
See `phase0/first-paint-static-replacement-trial.json` and ignored raw reports
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
adopted. Results: `phase0/hydration-*-trial.json`, `phase0/hydration-*-browser.json`;
raw reports are under ignored `artifacts/performance/hydration-*`.
