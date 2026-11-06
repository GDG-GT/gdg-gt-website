# Dependency review — 2026-11-06

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
