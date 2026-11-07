# Dependency review — 2026-11-06

## Current v7 migration verification

The installed application now uses react-router-dom/react-router **7.18.5**.
The old @remix-run/router package is removed; cookie 1.1.1 and set-cookie-parser
2.7.3 are the reviewed new transitive entries. No unrelated resolved lock entry
changed. The original cache and optional media fallback packages were preserved.
Rollback snapshot: `/Users/tejas/.cache/gdg-router-v7-y8igwbal`.

The fresh production audit reports **zero moderate/high/critical** and four low
package entries, all through the existing KaTeX chain. Raw audit exits 1 for those
low findings; this is not a clean audit. `phase0/router-v7-audit.json` records the
exact counts and advisory chain. This migration removes the two v6 router audit
entries described in the historical review below; no suppression was added.

The [official versioned migration guide](https://raw.githubusercontent.com/remix-run/react-router/react-router@7.18.5/docs/upgrading/v6.md)
was followed for React/Node compatibility and old future flags. Only obsolete
opt-in props were removed from App and test wrappers; all assertions, timeouts,
retries and coverage rules remain intact. Strict types/build/byte gates pass.
Final full coverage passes 2,684 tests/216 files, all global and 21 critical gates;
`phase0/router-v7-quality.json` binds the new build. Initial JavaScript increases
from 114,943 to 124,571 gzip bytes with the newer router, still inside the PRD
budget. The complete browser invocation passed 1,311 cases/eight expected skips
and exposed one Chromium-mobile drawer Escape failure. The corrected rebuilt
artifact then passes all 108 navigation/lazy-shell/workspace cases across six
profiles. These are separate invocations; no entirely passing full 1,320-case run
is claimed. Eleven focus unit cases include two new regressions. All original
assertion contracts remain preserved; final counts and build digests are recorded
in `phase0/router-v7-final-navigation.json` and `router-v7-test-contracts.json`.
All 15 real PWA boundary checks, nine two-tab updates and 46 HTTPS/header checks
also pass on the final build. Manual/device/hosted acceptance remains open.

The README now describes Georgia Tech and the actual local runtime instead of
the previous Penn State template. It removes old entrance-code instructions,
unsupported reset/deployment guidance and unverified compliance/performance
claims. The declared Node engine matches Vite's ^20.19.0 || >=22.12.0 requirement;
CI uses Node 24. Cache metadata is aligned without any extra dependency install.

## Isolated KaTeX review, no dependency override yet

The upstream [KaTeX advisory](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-238p-pmpm-9mq7)
requires existing prototype pollution or attacker influence over the renderer
options prototype, attacker-controlled expressions and unsanitized output.
Installed Mermaid 11.17.2 expects KaTeX ^0.16.47. The patch is 0.18.2, outside
that declared range, so compatibility cannot be inferred from audit output.

An integrity-verified 0.18.2 archive was extracted only in an owned scratch
directory. Eighteen isolated render checks pass: eight expressions in both output
modes, inherited trust refusal and explicit trust:false. Eight of sixteen normal
outputs are byte-identical. No production code or installed dependency changed.
Actual Mermaid/Excalidraw browser rendering and export compatibility remain to be
verified before a controlled transitive patch. The existing board disallows
external embeds, image tools and arbitrary scene import, but this does not remove
an upstream package finding or substitute for the remaining review.

## Earlier v6 declaration review

The router declaration is pinned to 6.30.6 to match the existing lockfile and
installed tree. This is a manifest correction, not a runtime upgrade or a fix for
the outstanding advisories. Backup comparison confirms identical package bytes
for react-router-dom 6.30.6, react-router 6.30.6 and @remix-run/router 1.23.4.
The production rebuild has exactly the previous entry, manifest, crop and preload
helper digests. Existing browser/performance evidence therefore still describes
the actual emitted application; no duplicate full test invocation is claimed.

The production audit reports zero critical/high, two moderate and four low
package findings. The raw audit exits 1 because findings remain. These are six
affected package entries, not six distinct vulnerabilities: dependency chains
repeat the underlying findings. Nothing was suppressed or declared fixed.
Structured evidence is `phase0/router-v6-declaration-review.json`.

The remaining router redirect bypass affects v6 and is patched in 7.18.0+,
according to the [upstream advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6).
The earlier 6.30.6 fix covers a different redirect advisory; it does not close
this later bypass. Existing application URL validation remains important, but
does not turn an upstream vulnerable version into a patched one.

The [SSR constructor advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg)
also requires 7.18.0+ for its package fix. The current app uses createRoot and
does not serialize router hydration errors into HTML. That specific SSR branch
is not used by the current render path; adding manual SSR would require renewed
assessment. The package finding is retained regardless of present reachability.

The four low package findings trace through Excalidraw → mermaid-to-excalidraw →
Mermaid → KaTeX, to [KaTeX's prototype-pollution trust bypass](https://github.com/advisories/GHSA-238p-pmpm-9mq7).
Its application prerequisites and a compatible patched transitive version still
need review. The audit's suggested Excalidraw downgrade is not applied blindly.

A controlled 7.18.5 router migration is the next local security action, with
Node/React compatibility, strict types, routing/guard behavior and broad regression
verification. This has not been installed yet. No major or force upgrade was
performed by the declaration review.

The existing owned dependency cache was preserved rather than duplicated.
Its old metadata lacked the already-installed Playwright test entry; aligning
the metadata normalized those packages at the same 1.64.1 version. npm pruned
two optional media fallback packages; both were restored from public package
archives after checking their SHA-512 against the original lockfile. Native media
asset generation and the exact rebuilt artifact check pass. The owned rollback
snapshot remains `/Users/tejas/.cache/gdg-router-v6-pdgsv9_o`.
