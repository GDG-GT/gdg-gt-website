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
entries (~7.1 MiB); this is not a performance acceptance pass. A separate loopback
preview runs on port 8082 for production-worker testing without controlling the
development origin. Real offline/cache/upgrade/device checks remain in progress.

Not complete yet: IndexedDB submission queue and review UI, background/manual
replay/48-hour expiry/logout tests, Push ownership/reminders and supported-device
installation/push acceptance. No claim of a confirmed offline registration is made.

Implementation references: [Vite PWA injectManifest guide](https://vite-pwa-org.netlify.app/guide/inject-manifest)
and [Workbox precaching](https://developer.chrome.com/docs/workbox/modules/workbox-precaching).
