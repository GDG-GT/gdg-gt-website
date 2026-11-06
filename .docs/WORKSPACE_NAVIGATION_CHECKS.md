# Complete workspace navigation and focus

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
`phase0/final-navigation-browser.json` records the final scope and build hashes.
The separate broad baseline passed 1,228 cases with eight expected profile skips;
it predates the focused drawer/search correction and is not presented as a
single new 1,242-case invocation.

The separate native zoom review was deferred when the shared Chrome window
changed pages during testing. No zoom preference was changed and no tab was
closed. Real 200% zoom, screen-reader and physical-device acceptance remain open.
