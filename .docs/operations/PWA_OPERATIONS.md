# PWA foundation (local; acceptance still open)

The production build uses pinned vite-plugin-pwa 2.0.0 / Workbox 7.4.1 with a
custom injectManifest worker. Development deliberately does not register a worker,
and startup no longer unregisters every service worker or reloads existing tabs.
The manifest uses GT identity, square/maskable/Apple icons derived from the
project’s approved logo, coral theme color and public shortcuts.

Only build-enumerated JavaScript, CSS, fonts, icons, static index/offline HTML and
manifest files enter the public cache. Heavy editor chunks above the cache budget
are explicitly excluded, not silently ignored. There is no runtime data cache.
API responses, admin HTML, all Forms routes (including public forms), private or
signed storage URLs, query-bearing URLs and all writes are not intercepted. Public
navigation fallback is an exact allowlist and yields only the static GT offline
help page on network failure. No stale event data is presented as current.

Precache requests omit credentials and reject redirects. The response plugin
rejects non-200 and observable Set-Cookie responses. Browser header filtering means
hosted static-asset/header testing is still mandatory: production must not attach
sessions or Set-Cookie to cacheable static assets. This local guard is not a waiver
of that hosting contract or a general guarantee about an arbitrary upstream.

Updates wait for explicit approval through the existing unsaved-work guard. Only
the requesting tab reloads; other tabs are not forcibly reloaded. The Workbox
revision manifest removes obsolete cache entries when a build activates. Hosted
rollout must retain old hashed assets long enough for other open tabs to finish.
Public static assets may remain after logout; private state is never cached here.

Footer installation guidance covers Chromium/Android and Safari Add to Home
Screen. Install does not request push permission. Offline readiness reports the
actual ready worker, not an assumed success. `sw.js`/manifest hosting headers and
rewrite exclusions are configured, but no hosted deployment was performed.

Evidence: 6 policy/actual-worker unit tests cover denied routes, filtered build
entries, credential omission, Set-Cookie rejection, public-only fallback and
explicit activation. Production build generates the worker with 197 public asset
entries (~7.1 MiB; 199 after adding the standalone queue); this is not a performance acceptance pass. A separate loopback
preview runs on port 8082 for production-worker testing without controlling the
development origin. Actual browser testing reports the ready worker, activates a
waiting update explicitly, then stops only that preview process: `/events` still
loads the cached standalone fallback and queue UI, while `/admin/members` fails
with connection refused. Preview is restarted after the test. Screenshot:
`../ui-review/real-pwa-network-fallback.png`. Complete cache inspection, upgrades with
multiple dirty tabs, logout/storage-error and supported-device checks remain open.

## Public submission queue

`shared/public-queue.mjs` stores at most 50 minimal event-registration/newsletter
entries in IndexedDB, never localStorage. Forms, authentication, uploads and
caller-supplied identity/capability fields are rejected. Event registration offers
explicit device storage only after a network/5xx failure; ordinary 4xx failures
do not become queued actions. Changing the input invalidates the old unsaved
candidate. `/offline` and the independently built/cached `offline.html` list device
entries even when the public application cannot reach the server. A separate
newsletter form requires explicit device-storage/replay consent; officer access
codes and passwords must never be entered there.

An item is pending, not registered, until the actual server response confirms it.
Newsletter server acceptance still requires email confirmation. The original
client idempotency key is preserved across replay and lost-response retries.
Leases are claimed in an IndexedDB write transaction, fencing concurrent tabs and
workers; the request uses no session credentials and only exact public endpoints.
Network/5xx failures retry with bounded exponential backoff (30 seconds to
30 minutes), at most eight attempts. Every 4xx and unconfirmed success response
becomes a permanent failure with a reason and original-page recovery action.
Pending items have manual retry/discard; accepted entries can be dismissed.

Payloads are erased on acceptance/permanent failure and at 48-hour expiry. Expired
identifier-only entries remain visible until discarded; expired entries are not
replayed. Signing out clears the queue and increments its epoch so a late network
result cannot resurrect an entry. A request already sent cannot be recalled.
Startup, the browser online event, a 30-second open-app timer, manual retry,
worker activation and an explicit worker-ready message attempt bounded replay.
There is no promise of background execution while an iOS app is closed.

Eight engine/boundary unit tests cover minimal fields, allowed outcomes, exact
idempotency/endpoint selection, concurrent replay, expiry, bounded backoff, 4xx
failure, clear-during-flight fencing and payload substitution. Actual browser
testing saves `fictional-browser-queue-20261021@example.test` in real IndexedDB,
observes Pending → server-accepted signup, reloads and sees the persisted result.
The local database has exactly one matching **pending/inactive/unconfirmed**
subscriber, not a fabricated active subscription. Only fictional data was used.
Screenshot: `../ui-review/real-public-queue-accepted.png`. An identifier-only accepted
device record remains for inspection; no operator data or inbox was erased.

Verified event Push is now implemented locally; see `PUSH_OPERATIONS.md` for
ownership, encrypted device data, scheduling, failure cleanup and actual evidence.
No real push provider or browser notification permission was enabled.

Still open: complete real-browser offline event-capacity/lost-response/expiry/
multi-tab/logout/storage-error cases, privacy cache inspection across upgrades,
supported-device installation/push acceptance and hosted operations.

Implementation references: [Vite PWA injectManifest guide](https://vite-pwa-org.netlify.app/guide/inject-manifest)
and [Workbox precaching](https://developer.chrome.com/docs/workbox/modules/workbox-precaching).


## Production browser boundaries — 2026-11-06

All 15 additional checks pass against an isolated loopback production build with
real service worker, CacheStorage and IndexedDB. The cache excludes API/admin/
Forms/private capability requests, public offline navigation loads the standalone
truthful fallback and private routes refuse fallback. Two tabs serialize in-flight
queue claims through real IndexedDB; accepted/409/48-hour-expired records lose their
stored personal payload. Lost acceptance remains pending and explicit retry keeps
the same key. Cross-tab clear increments the epoch so a late reply cannot recreate
personal data. No queue payload enters local/session storage. The static fixture
server stops and its isolated browser context closes at completion. No actual
application mutations or provider sends occur.

The first harness assertion refused every query in internal cache keys; Workbox
uses its own `__WB_REVISION__` query for revisioned assets. The assertion now permits
only that internal key while still rejecting application/private/query routes.
No worker or cache policy was changed. Both attempts are recorded in
`../phase0/production-pwa-initial-cache-assertion.json` and
`../phase0/production-pwa-boundaries.json`. This is local behavior evidence; installed
mobile/device UI, dirty multi-tab version updates, actual push permissions/provider
and hosted cache headers remain separate acceptance.

Nine production two-tab update checks also pass (`../phase0/production-pwa-update.json`).
A waiting worker remains waiting after declining the real unsaved-work dialog;
fields and document survive. Explicit discard/update activates it and reloads
only the requester. A second dirty tab preserves its document and entered fields.
The updated probe varies the offline HTML through an inert version comment and
changes its exact worker precache entry to the matching SHA-256 revision. The
active worker keeps serving revision one while revision two waits. Approval
activates revision two and removes the obsolete offline asset cache entry.
It uses the production registration/update/dirty-navigation UI, then closes its
isolated context/server. The original comment-only worker probe is retained in
Git history. The initial harness tried an input in collapsed details
and was corrected before any update; that evidence remains separately recorded.
Hosted changed-asset rollout/rollback and real installed devices still require
separate acceptance.
