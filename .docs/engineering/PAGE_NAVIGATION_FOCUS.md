# Page navigation focus

Implemented locally on 2026-10-26 against PRD 22.1/28.3. `RouteFocus` follows page
changes into the committed public or workspace main landmark, including across
shell boundaries. Initial mounting does not steal focus. Invitation pages use
the public landmark, and frames without either landmark are ignored safely.

Filtering, paging, private editor tabs, hash navigation and capability scrubbing
retain their own control focus. A changed supported Contact inquiry is a fresh
form context and receives landmark focus. More specific destination focus may
take precedence. Stay returns to the initiating control; an accepted discard
does not restore stale menu focus over the new destination.

Compact-menu ArrowDown now focuses the first item synchronously after the menu
mounts, or immediately when already open. It no longer waits for animation
frames, which can be paused in background tabs. Existing Tab containment,
Escape return and outside/route-close behavior remain.

Nine route-focus DOM cases and one paused-frame menu case were added. All 726
tests/116 files pass; strict types pass; lint is 0 errors/25 warnings. Build,
public byte boundaries and secret scanning pass. Global unit coverage remains
below 70% at 31.73% lines/30.27% branches; all 17 critical branch gates pass.

Real Chrome inspection shows Events navigation focuses the public main and a
subsequent Past filter click keeps focus on that button. Native Chrome at an
explicitly verified 200% zoom opens the top menu via ArrowDown, focuses Home,
navigates by keyboard to Team and continues with Tab to Join the community.
`../ui-review/navigation-keyboard-200-percent.png` records the focused menu item.
Temporary localhost zoom and viewport overrides were restored and the exact
native review tab closed. No user tab was closed.

This is not full screen-reader or supported-browser/device acceptance. Private
shell boundary behavior is exercised in DOM tests, separately from the native
public-page proof. No database migration or external provider action is involved.
