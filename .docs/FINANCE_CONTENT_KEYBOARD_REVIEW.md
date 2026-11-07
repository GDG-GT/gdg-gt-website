# Finance and content keyboard review — 2026-11-07

Later continuation: complete current source coverage now passes all 2,722 tests
after the remaining table/grid/mobile sizing fixes. The text below records the
9ebb6a8 finance checkpoint. See REMAINING_TABLE_KEYBOARD_REVIEW.md for the newer
132-case review scope, additional regressions and precise invocation boundaries.

Finance requests, budget allocations and the two finance report tables now use
the existing named, focusable ScrollableTable. Resource, sponsor, sponsorship-tier,
verified-impact and public-team collections share the same correction. This
preserves native table semantics, styling and nested control behavior while
allowing ArrowLeft/Right and Home/End on an overflowing table region, including
mobile WebKit. Initial WebKit finance/budget checks failed because both regions
were absent; the original failure report remains separate.

Thirteen new fictional, read-only states pass all78cases across six profiles:
finance/budget/report tables, finance and budget draft editors, budget management,
approval/rejection reviews, resource/sponsor/team editors, resource publication
and sponsor archive reviews. Reviews never confirm decisions; all application
writes are refused. No real passwords, ledger mutations or provider sends occur.
The shared capture helper checks axe/contrast, document width and working scroll.
The tests additionally verify named focus and actual Home/End scrolling whenever
a table overflows. Mobile editors and desktop reports were visually inspected;
all78captures remain unapproved at
`artifacts/browser/finance-content-review/index.html`. The original primary,
44-state secondary and functional recovery indexes remain intact.

All types,52targeted unit tests/5files,4catalog tests, scoped lint, build and byte
limits pass. Rebuilt artifact also passes15PWA boundaries,9update and46configured
HTTPS/header checks. Existing full2722coverage and1540browser/eight skips are
saved-source evidence; a full current invocation was not repeated for these
focused wrapper changes. Source mapping remains307mandatory IDs/146requirements
with full acceptance unverified. See phase0/finance-content-secondary-browser.json,
finance-content-artifact-probes.json and finance-content-visual-review.json.

Mobile LCP remains an open gate. Isolated matching hydration, CSS, scheduling,
native image hints and module priority trials all fail2500ms and are unadopted.
Human fidelity/assets/content approval, manual accessibility/actual zoom, physical
devices/push, field/hardware performance, hosted operations/restore/rollback and
institutional approvals remain separate. SSO/Google and Bevy/Engage stay deferred.
