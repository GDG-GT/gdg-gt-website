# Public entry delivery and availability — 2026-11-06

## Route-aware image hints

The global HTML no longer preloads home artwork on other routes. A small classic
asynchronous helper adds the same media-specific, high-priority atmosphere hints
only on `/`, independently of the React graph and stylesheet execution. React
still loads both real pictures if the optional helper fails. The copied helper
has an explicit 1,500-byte raw ceiling and contributes 362 gzip bytes to the
initial JavaScript budget; current total is 114,943 gzip bytes. It is included
in performance build hashes, and its stable URL revalidates rather than receiving
an immutable lifetime. No private routes or capabilities are prefetched.

The complete isolated async-helper run records mobile Home/Events/Contact
performance 95/95/95, accessibility 100, CLS zero and LCP 3,003/3,012/3,007 ms.
Desktop performance is 100 throughout. All three mobile LCP gates remain failing;
no field p75 or causal timing improvement is inferred from these lab runs.
The previous navigation baseline is retained in
`phase0/production-performance-before-route-hints.json`; the intermediate
deferred-helper measurements are in
`phase0/production-performance-deferred-route-hints.json`. Async execution avoids
waiting for stylesheets before starting the optional hint.

Removing the font preload was separately measured and rejected: Home mobile LCP
2,891 ms and CLS 0.031. The original font preload is fully restored; the face and
swap policy are unchanged. Evidence is retained in
`phase0/production-performance-no-font-preload.json`. The initial premature
measurement exited on missing build output before starting Lighthouse; no result
from that ENOENT attempt is used.

Nine standalone helper cases and four traceability cases pass in a focused
invocation. The preceding deferred-helper six-profile public smoke passed 76
cases with eight expected skips. One earlier parallel software-WebGL comparison
sampled before rendering warmed up; its isolated original case passed. The final
test now observes motion before retaining both original consecutive-frame
assertions. The existing test/polling limits and 250-ms frame interval are
unchanged. Software rendering does not certify hardware FPS. The final async
scope passes 76 cases with eight expected skips and no failures/retries, and all
46 current HTTPS/header checks pass. Types/build/byte gates pass; lint remains
zero errors/10 inherited warnings. Evidence is in `phase0/route-hints-browser.json`
and `phase0/route-hints-quality.json`.

## Deferred navigation-review continuation

The guarded navigation registry and router blocker stay synchronous. Only the
Radix review dialog is deferred; an accessible native modal keeps navigation
paused and offers Stay during loading or failure. Cancellation and accepted
destination focus, including delayed and failed chunks, pass the final 162-case
six-profile browser scope. Full coverage passes 2,673 tests/215 files with all
unchanged gates. See `WORKSPACE_NAVIGATION_CHECKS.md`.

Current initial JavaScript is 114,581 gzip bytes versus 126,485 immediately before
this extraction. CSS is 29,899 gzip bytes and the font remains 48,432 bytes. The
build gate requires the new dialog boundary. No dependency was upgraded.

The new isolated six-route measurements match the current build hashes:
Home/Events/Contact mobile scores 96/93/92, accessibility 100, CLS zero and LCP
2,858/3,161/3,305 ms. All mobile LCP gates still fail; all desktop scores are 100.
The earlier report is retained as
`phase0/production-performance-before-navigation-review.json`. Single runs and
timing variation do not justify claiming a causal LCP improvement from the byte
change. No score, threshold, browser flag or network preset was weakened.

The current waterfall identifies another concrete delivery inefficiency: Events
and Contact each request the 37,624-byte mobile home atmosphere despite never
rendering it. The global index preload triggers that request. All three routes
also preload the 48,432-byte font at high priority. Next work should measure
route-appropriate resource hints and font contention before a larger rendering
change. Public/private availability and cache boundaries must remain intact.

## Previous public-entry baseline

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
