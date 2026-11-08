# Verified event reminders

Implemented locally on 2026-10-21, forward migrations 090–091. This is not a claim
of actual-device notification delivery or authority to enable external providers.
Local VAPID identity is configured in ignored server settings; **real push sending
is disabled**. No browser notification permission or OS setting was changed.

## Opt-in and ownership

Public event pages offer an optional per-event reminder, separate from registration,
calendar download and installation. An active authenticated officer account uses
its current session/CSRF to subscribe. Other attendees request a private email
verification link for an existing registration. Unknown/known addresses receive
the same generic request result; only an existing current registration can queue
mail. Requests are risk-limited to five/network/15 minutes and three/registration/
hour. Honeypots do not enqueue mail.

The random 256-bit proof is hashed in the database and encrypted only in its mail
job. It appears in the email's URL fragment, not a query parameter. The event page
removes it from the address bar, holds it in memory and requires explicit Verify
and Enable actions. It expires after 24 hours and cannot grant an account session
or access another event. Registration removal/address replacement invalidates it.
Returning to a closed tab requires the original unexpired link or another verified
request; no proof/email/private endpoint enters localStorage, IndexedDB or caches.

Permission is requested only by the explicit Enable button, never page load,
installation, registration or verification. iPhone/iPad non-installed contexts
show Add to Home Screen instructions, not a broken permission button. Unsupported,
denied, development-worker and locally disabled delivery states explain why normal
calendar/registration workflows remain available. Enrollment requires the active
production worker. OS/browser permissions are not bypassed or reset by the site.

## Private storage and device controls

The server accepts exact supported HTTPS Google/Mozilla/Apple/Windows push hosts,
not arbitrary URL fetch targets, ports, credentials, fragments or private IPs.
Actual P-256 points and canonical key lengths are checked. Browser endpoint URLs
and keys are AES-GCM encrypted under the server data key. Database DTOs expose no
raw endpoint or key; public configuration exposes only the VAPID public key.

Each event/device row is bound to a server-derived account or verified registration.
It cannot silently change owners while active. An HMAC of endpoint + the browser's
secret auth material provides device-only status/revocation without exposing its
account/email. Guessing a row ID or endpoint alone cannot revoke it. Turning off
one event erases its stored encryption material but does not unsubscribe the
browser from other followed events. Browser-level notification blocking remains
available in browser settings. Quotas cap active reminders at 50 per owner/device,
including concurrent enrollments and reactivations; idempotent enrollment at the
cap is still allowed. Inactive/locked/deleted accounts and removed/replaced
registrations cannot receive future prepared reminders.

## Scheduling and transport

The separate bearer-authenticated `event-push` occurrence runs every five minutes,
using the distributed job lease/occurrence ledger. It enqueues at the 24-hour
boundary, with a maximum 30-minute catch-up/delivery window. Before that boundary
or after the window, changed start times, revoked owners/devices and non-published
events cannot send. Each event/subscription/start-time occurrence is unique.
Rescheduling can create a new occurrence, but old queued content is skipped.

The dedicated claimer accepts at most ten jobs, fenced by a five-minute lease.
Delivery rechecks current ownership and event occurrence. A maximum of six
attempts uses 30-second exponential backoff capped at five minutes and the same
30-minute absolute deadline. A crash on the final attempt cannot retry forever.
Transport uses pinned `web-push` 3.6.7 to construct standard aes128gcm/VAPID requests,
with a 15-second request timeout, no redirects and a 30-minute provider TTL.
VAPID private key/contact identity stay server-only. No arbitrary provider headers,
HTML or external click URL can be submitted by the browser.

Provider accepted is not proof of device delivery/display. HTTP 404/410 revokes
all stored event rows for that exact invalid endpoint and erases their keys;
429/5xx/network failures retry within bounds. Other permanent provider failures
stop that occurrence. Raw provider response bodies/headers/endpoints never enter
logs. Stable provider topic and notification tag coalesce retries where supported;
an ambiguous network/process failure cannot promise exactly-once device display.

Lock-screen content is generic, without attendee names/emails or private chapter
messages. Clicks open the canonical public event URL; a private/dirty workspace
tab is not navigated away. Expired verification rows are removed after one day,
ended/cancelled/archived/invalid-owner subscriptions are revoked with key erasure,
and terminal delivery logs expire after 90 days. Cleanup is bounded and runs even
while real sending is disabled. Account logout clears tab proof/requests, but
turning off a previously saved device reminder is a separate explicit control.

## Local runtime and verification

```
npm run setup:local-push
npm run jobs:scheduler -- --watch
npm run test:local-push
```

Setup refuses conflicting existing values and never enables `PUSH_SEND_ENABLED`.
Restart the local API after provisioning. The deterministic test suite requires
real sending to be false, refuses unrelated pending push jobs, and uses only an
explicit in-process fake transport for provider results. Its email uses actual
Mailpit SMTP. Pause the identified scheduler during this suite, then restart it.
Optional `-- --hold-for-browser` leaves a fictional event until `done`, then
recoverably archives it, revokes synthetic devices and deactivates its account.
Wait for natural verification/login rate windows; tests never reset them.

- **91 migrations**, full canonical SQL and both 100-client capacity tests pass.
  SQL 090/091 covers verified ownership, no arbitrary recipients, scope, device
  secret/owner binding, scheduling/deduplication, lease/expiry/retry, quotas and
  final-attempt crash fences.
- **341 unit tests** pass, including actual installed-library encryption/VAPID
  construction with stubbed fetch, endpoint/P-256/schema boundaries and actual
  worker push/click handlers without changing any browser/OS permissions.
- **27 actual local integration checks** pass (`../phase0/local-push.json`), using
  real HTTP/PostgreSQL/SMTP with synthetic provider statuses. The suite passes
  again with the dedicated six-attempt claimer. Typecheck, changed-UI lint and
  production build pass. Public worker policy is dependency-free, so schema
  validation is not bundled into the service worker.
- Browser desktop/375px confirms truthful disabled opt-in/development guidance,
  normal scrolling and no horizontal overflow. Proofs:
  `../ui-review/push-guidance-{desktop,mobile}.png`. No Enable button was pressed.
- Production dependency audit remains **31 findings: 16 high, 14 moderate, 1 low,
  zero critical**. This addition did not close or waive them.

Still open: approved real VAPID contact/domain, authorized provider configuration,
actual browser enrollment/permission/unsubscribe and iOS Home Screen delivery,
real supported-device clicks/offline/retry/expiry, hosted scheduler supervision,
alerts/load/privacy/accessibility/performance and visual sign-off. These are
acceptance gates, not fabricated local successes.

References: [Web Push library API](https://github.com/web-push-libs/web-push#api-reference),
[browser subscription guidance](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe),
[notification click handler](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event).
