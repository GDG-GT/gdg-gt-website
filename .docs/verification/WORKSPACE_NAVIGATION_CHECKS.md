# Complete workspace navigation and focus

## V7 correction verification

The complete 1,320-case React Router 7.18.5 browser run passed 1,311 cases, skipped
eight expected profile cases and found one real Chromium-mobile failure: after
pointer reopening, Escape left the drawer open and hid the original opener from
the accessibility tree. Original failure evidence is retained in
`../phase0/router-v7-initial-browser.json` and ignored local captures.

The drawer now uses the same capture-phase Escape dismissal and native composition
guard as command search. All 11 focus unit cases pass, including repeated reopening
with a bubbling consumer and IME handling. The final rebuilt scope passes all 108
cases across six profiles: complete navigation, lazy-shell entry/errors, footer
entry, native availability, command search and eight workspace routes. See
`../phase0/router-v7-final-navigation.json`. Full final coverage passes 2,684 tests/
216 files, including these cases. This is separate from the initial complete
browser invocation; no fully passing new1,320-case run is claimed.

## Deferred navigation review

The unsaved-work registry and router blocker remain synchronous, while the Radix
review dialog now loads only when navigation actually needs review. A small native
modal contains focus during loading or chunk failure and offers cancellation.
It never approves navigation automatically. The loaded review preserves the same
busy-operation protection, Stay and explicit Discard behavior. Cancellation
restores the invoking control; accepted navigation retains destination focus.

The final rebuilt-artifact invocation passes all 162 cases across the six
profiles: ordinary browsing does not request the dialog chunk, delayed/failed
loading retains draft values and blocks background focus, Escape/Stay returns
keyboard focus, accepted Discard reaches the destination, and existing contact,
member, merge, privacy and respondent recovery paths remain intact. No actual
database writes or provider sends occur. `../phase0/navigation-review-browser.json`
records the exact build and case outcomes.

The initial run passed 158 cases and failed four new WebKit anchor-focus
assertions after pointer invocation. Keyboard activation is now explicit for the
keyboard-return test; the corrected six-case WebKit scope and final 162-case scope
pass. These failures remain recorded in
`../phase0/navigation-review-initial-browser.json`. No timeout or retry was changed.
The native pending modal was inspected at a mobile viewport and its action spacing
was corrected before the final run. The existing nine-check real two-tab PWA
update probe also passes with this deferred review.

Initial JavaScript is now 114,581 gzip bytes, down from 126,485 immediately before
this change. The byte gate requires the dialog to remain outside the public
startup graph. New loading/error/focus lifecycle unit coverage supplements the
existing guard tests. The isolated mobile LCP threshold still fails; byte savings
do not close performance or manual/device acceptance.

## Previous shared-shell baseline

The primary populated review fixtures intentionally expose a limited permitted
route inventory. A separate production-browser check now supplies all 26
Super Admin destinations to inspect the long desktop sidebar and mobile drawer.
It traverses every link, verifies the final profile link is in the viewport and
the navigation has scrolled, checks that Sign out remains visible, runs axe and
captures the result. WebKit uses Option-Tab for clickable-item traversal,
matching [Apple's documented Safari keyboard behavior](https://support.apple.com/en-lamr/guide/safari/cpsh003/mac),
without changing any browser or OS preference. Emulated WebKit remains separate
from actual Safari/device acceptance.

The first invocation mixed pointer opening with an assumption that the browser
had focused the invoking button, and used plain Tab in WebKit. After correcting
the test to exercise keyboard opening and the platform link-traversal key, the
four desktop profiles passed; both mobile profiles still failed Escape focus
return. That exposed the product bug: the drawer used an independent opener
rather than a dialog trigger, so its default dismissal did not reliably restore
that button's focus.

`AdminShell.tsx` now records its actual opener and opening route. Escape and
Close restore that opener on the same route. Choosing a different destination
allows its landmark to retain focus; choosing the current page deliberately
focuses the existing content. Search returns to its invoking button or the field
that used the keyboard shortcut. A capture-phase Escape handler fixes Chromium
mobile command dismissal, while native composition protection keeps an active
IME from dismissing the palette.

All nine unit cases pass. The final rebuilt-artifact scope passes all 90 cases
across six browser profiles, including the full navigation case, route-lazy shell
focus, sign-in entry and the eight baseline workspace routes. Search readiness
is asserted through its actual `searchbox` role before keyboard dismissal. No
assertion or timeout was weakened; initial wrong-role/readiness diagnostics and
the real Chromium-mobile failure remain in separate local logs/artifacts.
`../phase0/final-navigation-browser.json` records the final scope and build hashes.
The separate broad baseline passed 1,228 cases with eight expected profile skips;
it predates the focused drawer/search correction and is not presented as a
single new 1,242-case invocation.

The separate native zoom review was deferred when the shared Chrome window
changed pages during testing. No zoom preference was changed and no tab was
closed. Real 200% zoom, screen-reader and physical-device acceptance remain open.
