# Public entry delivery and availability — 2026-11-06

The initial production JavaScript graph is now approximately 126 kB gzip, CSS
30 kB gzip and the self-hosted font 48 kB. Admin shell, sign-in, other public-page
implementations, 3D objects, Forms builder and responses stay outside the home
static import graph; the build gate checks those boundaries explicitly. A query
provider, two toast renderers and a tooltip provider with no source consumers
were removed from startup. Installed dependencies were not changed. Active
application notifications and inline feedback remain in their own components.
Homepage and event-card helpers were separated without changing their
public re-exports or data contracts.

Public availability validation now uses a small canonical parser shared by the
server and browser. The write/password schema stays outside public startup. The
new tests compare strict fields, normalization, bounds, live/maintenance rules,
control characters and redirect policy with the previous public contract.
The URL predicate and exempt-route policy have a single shared implementation.

The homepage paints its existing public identity while availability is checked.
Native `inert` blocks its controls until the result arrives. Live confirmation
unlocks the same mounted content; maintenance still redirects. Other nonexempt
routes retain initial blocking. Unit and actual browser checks cover retained
DOM, native focus refusal before confirmation and live/maintenance destinations.
Cold route-lazy workspace focus waits for its landmark and cancels if another
focus choice or route takes precedence. Shell load failures use the safe reload
message, without claiming an interrupted save could not have committed.

Narrow phones use crops derived from the existing artwork, with the same CSS
focus points and sufficient crop width to retain the original cover window.
`scripts/prepare-hero-assets.mjs` runs before development and production builds;
outputs are ignored, reproducible WebP files capped at 50 kB each. They total
59,556 bytes versus 202,776 bytes for the original pair. Wider screens retain
the originals. Matching media preload hints and picture sources avoid redundant
transfers. An actual WebKit mobile run exposed premature fallback downloads
during React picture construction; setting the fallback at DOM commit corrected
it. All six browser profiles then requested exactly the selected pair. The
decorative poster has low fetch priority and asynchronous decoding. Narrow
layouts retain their translucent colors while avoiding large backdrop blurs.

`scripts/test-production-performance.mjs` uses pinned Lighthouse 13.6.0 from a
separate temporary installation, a read-only loopback production server and
allowlisted anonymous local API reads. Gzip models an explicit hosting delivery
requirement; it is not deployed evidence. Default Chrome rendering and default
Lighthouse simulated mobile/desktop profiles are retained. The optional
`--home-mobile` argument writes a separately named diagnostic. Final evidence
records build/crop hashes, all scores and failing audits. A missed performance,
accessibility, LCP or CLS threshold produces a nonzero exit status.

Initial diagnostic phases used uncompressed delivery and then a forced
software-rendering flag. Their evidence is preserved separately and must not be
presented as the final default-renderer measurements. The final six-route
candidate scores 94/94/95 mobile and 100 desktop, with accessibility 100 and
CLS zero throughout. Mobile lab LCP is 3,021/3,147/2,899 ms, still above
2.5 seconds. `phase0/production-performance.json` records the exact current
build hashes; its nonzero gate result is retained. Passing Lighthouse scores
do not close that LCP finding.
Single lab runs and TBT do not establish field p75 LCP/INP/CLS. Actual supported
devices, hosted latency/compression, representative 3D hardware and field p75
remain separate acceptance requirements.
