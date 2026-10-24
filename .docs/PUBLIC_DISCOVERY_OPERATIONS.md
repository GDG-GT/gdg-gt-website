# Public discovery and metadata — local checkpoint, 2026-10-24

## Resource, people and sponsor lists

Public team/resource/sponsor lists now use real bounded server pagination rather
than a silently truncated first 100 records. Resources combine title search,
type, level, availability and exact-tag filters before pagination/counting.
Filters/page survive refresh in the URL; changing a filter resets the page.
Resource links trigger the existing per-resource shared rate-limited view action
without blocking external navigation or accepting browser-supplied counters.

Request cancellation and path-bound snapshots prevent old queries overwriting
new results. Initial skeleton, safe error/retry, explicit stale timestamp, empty
and out-of-range recovery states are distinct. Pagination gives focus back to the
persistent main landmark while results load. Partner and impact navigation have
different accessible names. Team portraits and sponsor logos have intrinsic
dimensions; sponsor logos preserve their aspect ratio.

Migration 100 applies active tier ordering before sponsor pagination. It returns
only approved public fields, excludes inactive/archived records and gives
unconfigured tiers a deterministic fallback order/label. The function is denied
to browser roles and explicitly granted to the trusted server under both table-
grant defaults. Page-local grouping cannot reorder globally paginated records.
Impact retrieval is independent of the homepage's deliberate four-metric limit.

Ten actual loopback HTTP/PostgreSQL checks cover 101 resources, combined filters,
25 profiles/partners, 13 impact figures, public projections, stable pagination
and view-count throttling. These were controlled read-path fixtures, not evidence
of admin publication. Both invocations' fictional rows were recoverably archived;
unrelated records were untouched. Browser checks cover resource paging/filtering,
375px width without document overflow, sponsor grouping and independent final
partner/impact pages. Screenshots are review evidence, not golden baselines.
Evidence: `phase0/local-public-collections.json`, `ui-review/public-resource-*`
and `ui-review/public-sponsor-pages.png`.

## Sitemap, robots and metadata

The formerly retired sitemap now serves XML through the versioned server and
the root hosting/development aliases. Static enabled public paths and published
event slugs use the configured installation origin, never request Host input.
Event pages are walked in bounded 1,000-record batches; size/entry ceilings fail
closed rather than emitting incomplete output. Private routes, Blog/Projects,
tokens and Forms are not discovered. Forms stay noindex by default.

Robots uses the configured absolute sitemap URL and one common crawler policy.
The static fallback and humans file no longer contain PSU branding/domain/email.
Public pages update a single canonical/description/social set instead of adding
duplicates to generic index metadata. The homepage emits factual Organization
JSON-LD without invented contacts, statistics or social identities. Event JSON-LD
remains tied to approved event data. Error responses reset `Cache-Control` to
`no-store`, even if a public handler selected successful-read cache headers first.

Six focused SEO tests plus eight actual root/proxied HTTP checks pass. Actual
browser navigation confirms one correct canonical and description per Resources/
Sponsors route. Evidence: `phase0/local-seo.json`. Build/byte gates pass locally.

Absolute canonical sitemap URLs follow [Google's sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
Client-side metadata alone is not a crawler/social-preview acceptance result;
[Google documents rendering and canonical limitations](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).
Hosted HTML status/metadata, actual crawl behavior, complete social previews,
domain redirects, CSP and deployment acceptance remain open. RSS remains retired,
not a private-blog feed. No domain purchase, search submission or deploy occurred.
