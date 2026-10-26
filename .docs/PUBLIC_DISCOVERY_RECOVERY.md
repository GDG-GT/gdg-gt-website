# Resource and sponsor recovery (local checkpoint)

Resource URLs now map supported type, level and availability casing onto the
actual controls/API values. Unknown options fall back to the neutral filter,
search/tag values are bounded to the API's 100-character limit, and the search
input enforces that limit. Changing one filter preserves the others and resets
pagination. Reset stays available for populated and failed reads and returns
focus to the persistent content landmark. An empty out-of-range page no longer
claims that the entire matching library is empty; its first-page recovery stays.

Filters align by their controls on desktop and stack on small screens. A real
375 px check initially found overlapping level/availability controls, despite
the absence of horizontal overflow. The corrected layout has separate full-width
rows, 44 px or taller inputs/selects/buttons, and no overlapping rectangles.

The public sponsor packages omit tiers with no amount or nonblank benefits.
Named sponsor groups remain visible when they have actual partners. Both older
`/sponsors/tiers` and `/sponsors/impact-stats` API aliases now exclude soft-deleted
records even when `is_active` remains true, and use deterministic ID tie-breaking.
The explicit public projection and mandatory revalidation remain unchanged.

Eleven DOM cases exercise shared filters, bounds, reset/error/focus, out-of-range
pages, unresolved view tracking, pending-filter isolation, meaningful packages,
tier grouping/logo/links and grouped profile initials without private emails.
Two server cases cover the legacy aliases. All 785 tests/120 files pass. Strict
types pass; lint remains 0 errors/25 warnings. Global coverage is 33.52% lines/
32.04% branches, below 70%; all 17 individual critical branch gates pass.

The expanded real HTTP/PostgreSQL read-path suite passes 17 checks, including
archive concealment in both canonical and legacy sponsor endpoints. Browser
testing applies all resource filters (17 matching fictional records), reaches
page two with filters intact, resets with main-content focus and confirms an
empty fictional package is absent from Sponsors. The viewport override was reset.
Invocation-owned fixtures with prefix `Fictional public 44020541` were recoverably
archived afterward; unrelated records were not changed. Fixture sponsor imagery
is test-only and does not approve institutional logo/photography content.

Evidence: `phase0/local-public-collections.json`,
`phase0/public-discovery-browser-observations.json` and
`ui-review/resource-filter-recovery.png`. Complete screen-reader, supported-device,
official-content, visual-baseline and hosted cache/security acceptance remain
open. This checkpoint does not close the complete PRD.
