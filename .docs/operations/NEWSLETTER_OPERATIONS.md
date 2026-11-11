# Newsletter workspace and delivery

Implemented locally on 2026-10-21, migrations 082–087. The real
`/admin/newsletter` route now uses same-origin protected APIs rather than the
legacy browser Supabase service or browser scheduling timer. Historical source
files remain unrouted. This is local implementation evidence, not hosted release
certification or permission to email real recipients.

## Operator workflow

Choose Chapter or an active team scope. Subscribers, templates and campaigns
have separate searchable, paginated current/archive views. Admin/Super Admin can
operate chapter and team records. Team members need current membership, explicit
newsletter page access and the corresponding CRUD action; sending also requires
the separate `send_email` grant. A grant never crosses team boundaries. Archived
team data may remain readable to chapter administrators but is not mutable.

- Add a subscriber request only with the person's request/consent. New addresses
  receive expiring double opt-in, never immediate campaign membership. Existing
  addresses return a generic result without changing their state or scope.
- Edit subscriber names, deactivate, archive and restore. Email/scope identity is
  retained. Restore remains unsubscribed. Suppression cannot be cleared by these
  controls or a public re-signup. Select up to 50 visible subscribers for an
  atomic, revision-checked, current-password/typed-confirmed bulk operation.
  Use Pending status to review and recoverably archive unconfirmed records.
- Export up to 1,000 matching subscribers across pages after reviewing the
  filters. CSV is quoted and spreadsheet-formula neutralized. Exports are audited
  and contain private email/consent status; store them securely.
- Save reusable plain-text templates and copy their messages into private campaign
  drafts. Saving a template/draft does not send mail. Saved email previews escape
  raw HTML, preserve line breaks and link safe HTTP(S) URLs (HTTP only loopback).
  Browser preview is sandboxed. Arbitrary operator HTML is not executed.
- Campaign audiences are all confirmed active unsuppressed subscribers in scope,
  or selected existing confirmed subscriber IDs, max 1,000. New arbitrary email
  addresses cannot bypass confirmation through a custom audience.
- Save before previewing/sending. Generate a five-minute session-bound audience
  review, inspect addresses/content/count, then enter the current password and
  `SEND N`. Audience/revision changes invalidate review. Approval freezes exact
  addresses and immutable subject/content. A new retry key cannot send it twice.
- Optional scheduling uses the browser's explicitly displayed local timezone and
  stores UTC; select one minute to 90 days ahead. The server checks every five
  minutes. Closing the page does not stop scheduling. The approver's current
  account, password generation, scope and send grant are rechecked at dispatch.
- Self-only tests require current password and `SEND TEST`; the server chooses
  only the requesting chapter account's current email. No campaign audience is
  contacted, and testing does not approve the campaign.
- Scheduled/sending campaigns can be cancelled with password and `CANCEL SEND`.
  Queued jobs are fenced and skipped. A request already handed to the provider
  cannot be recalled. Finished/approved campaigns cannot be rewritten: duplicate
  one into a new private draft instead. Draft campaign editors expose Linked forms;
  approved campaign references are immutable and follow scoped access checks.

## Delivery and callbacks

`server/lib/mail-transport.mjs` owns provider credentials, sender/reply identity,
20-second Resend request timeout, local SMTP timeouts and stable retry identities
for both transactional and newsletter mail. Credentials never reach client code.
Campaign/test workers claim only dedicated job kinds. Each message prepares under
its current lease and rechecks account authorization, deadline and subscriber
consent/suppression before sending. Stable per-recipient unsubscribe capability is
hashed plus encrypted at rest; retries reuse the same content/link. Each campaign
includes text/HTML unsubscribe links. SMTP cannot promise exactly-once delivery
after an ambiguous network/process failure; hosted provider idempotency and
failure recovery still need staging verification. Retry is bounded to eight
attempts with existing backoff and a 20-hour campaign processing deadline.

Delivery results distinguish queued, skipped, failed and provider accepted;
“Processing complete” is not a claim of inbox delivery. Verified Resend/Svix
callbacks update minimal metadata and unique open/click counts. Opens/clicks are
not reliable attendance or human-read evidence (clients may block/prefetch).

`POST /api/v1/webhooks/resend` requires a configured server-only
`RESEND_WEBHOOK_SECRET`. Verification uses the exact bounded raw bytes, signed ID,
timestamp (five-minute tolerance), HMAC and constant-time comparison before JSON
is accepted. Browser Origin/Cookie requests are denied. Duplicate IDs require the
same payload hash. Raw payload/email/IP is not retained; unmatched provider IDs
wait up to 24 hours. Out-of-order delivery never clears bounce/complaint state;
hard bounce/complaint/suppression stops future marketing mail and revokes tokens.
Local configuration intentionally has no real webhook secret or live Resend send.

## Local runtime

UI: `http://127.0.0.1:8080/admin/newsletter`. API: loopback 8081.
Mailpit: `http://127.0.0.1:54364`; SMTP: 54365. No external email is sent.

```
npm run jobs:scheduler -- --watch
npm run jobs:newsletter -- --watch
npm run test:local-newsletter
```

The scheduler's `newsletter-campaigns` occurrence runs every 300 seconds with a
separate server bearer secret, distributed run lease and deduplication. It advances
up to 20 due campaigns, processes a bounded delivery pass, reconciles callbacks and
cleans retention. The dedicated local worker polls every five seconds for prompt
test/campaign delivery. Both processes can safely coexist via leases. Pause the
identified newsletter worker before deterministic SMTP tests so it does not race
their explicit claim, then restart it. The processes are running now, not installed
as OS services. Hosted workers/scheduling must be supervised separately.

Cleanup is bounded to 1,000 records/type/pass: reviews 24 hours after expiry,
test identities/content 24 hours after expiry, applied/ignored provider events and
terminal recipient identities after 30 days, subscription attempts after 30 days,
tokens 24 hours after expiry or 30 days after consumption. Audit/send state remains.
No blanket irreversible “delete every subscriber” control is provided.

Other limits: 10 approvals/account/day, 30 reviews/account/hour, 10 self-tests/day
(plus hourly request limit), 10 export/bulk operations per 15 minutes. Final writes
require CSRF, current-session reauthorization, bounded input, idempotency and audit.
Send/review capabilities/passwords live in component memory and clear on logout;
no private newsletter data enters offline caches or the public submission queue.

## Evidence and open acceptance

- **87 migrations**, canonical SQL and both 100-client capacity tests pass.
  SQL 082/083/084/085/087 covers scope/session/grants, immutable approval/audience,
  lease/retry stability, suppression, callbacks, atomic bulk and token retention.
- **324 unit tests** pass, including strict template XSS/link handling, CSV,
  raw callback signatures and actual installed SDK retry/sender/signal behavior
  with a stubbed fetch (no live provider call).
- **31 actual local newsletter checks** pass (`../phase0/local-newsletter.json`).
  Real SMTP confirmation, self-test and campaign delivery; signed ephemeral HTTP
  callbacks; consent changes, cancellation, retry keys, protected export and bulk
  cleanup. One recipient follows actual email confirmation; another is explicitly
  synthetic preconfirmed test data. All suite-owned fixtures are recoverably
  archived; Mailpit evidence is retained. No operator subscriber was erased.
- Existing public signup/contact suite and **20 reviewed Forms-delivery checks**
  also pass through the shared transport. Typecheck, changed-UI lint and build
  pass. Browser desktop/375px checks cover template preview, confirmed-recipient
  selection, Stay/Discard preservation, keyboard review, disabled approval,
  cleanup review/filter lock and normal scrolling/no page overflow.
- Screenshots: `../ui-review/newsletter-{templates-desktop,send-review-desktop,
  send-review-mobile,cleanup-mobile}.png`. Only fictional fixtures appear.

Still required: verified GT sender/domain/reply identity, explicit live-send
approval, real provider callback secret/raw-body hosting behavior, hosted provider
idempotency/retry/failure/load tests, supervised worker/scheduler and alerts,
retention/privacy policy approval, supported-device/screen-reader/accessibility,
performance and visual sign-off. Other PRD backlog items remain open.

## November 10 delivery and member import update

Chapter Super Admins can open Subscribers → Add community members to select
active directory members with previously collected newsletter consent. Record
where consent was collected and acknowledge it before importing. The server
rechecks membership and role, matches normalized email, records consent evidence
in the audit trail, and preserves unsubscribed, suppressed, archived and other
team subscriptions. Existing active addresses are reused. The import sends no
email and has a stable retry receipt; use Retry import after an interrupted
response. Public signup and ordinary Add subscriber still use email confirmation.

Self-only tests retain the requested message across campaign approval metadata
changes. A changed subject/body, expired request, revoked session, changed
password or lost send permission still prevents dispatch. Campaign and test
email are processed on the five-minute newsletter worker cycle. The UI states
this delay and delivery results distinguish queued, accepted and delivered.

All outgoing application mail uses the verified sender domain with server-owned
purpose addresses: forms@, newsletter@, contact@, id@, accounts@, events@ and
workspace@gdggt.dev. Unknown/general mail uses hello@gdggt.dev. Replies go to
`gdg@gatech.edu`. These are sending identities; replies are routed through the
Reply-To header, not new mailboxes. Supabase Auth SMTP is configured with
accounts@gdggt.dev and matching account templates. No new provider, mailbox,
subscription, key or charge is required.

The shared HTML shell uses the actual four-color chapter mark, table layout,
readable text and button actions. Subscription confirmations put their private
URL only behind the button in HTML; the text-only alternative retains the URL.
Campaign HTML contains one small unsubscribe link in the footer. The plain-text
alternative retains its unsubscribe URL for clients that do not render HTML.

## Reinviting an existing address

Subscriber details show **Resend invitation** for pending and unsubscribed records. An unsubscribed recipient returns to Pending and must accept the new invitation before receiving campaigns. Add subscriber uses the same invitation flow for an existing address rather than reporting a send without queuing mail. Already active addresses are reported as already subscribed; use their separate welcome-email resend action when wanted. Archived records must be restored first, and provider-suppressed recipients remain blocked.

Migration157 adds a service-only invitation transaction with current-session and newsletter permissions, per-address locking, durable retry receipts and the existing one-minute resend cooldown. It keeps the subscriber ID and historical opt-out data. The editor also ignores an older cached revision when a freshly opened record is newer, while continuing to protect unsaved input if a genuinely newer revision arrives during editing.
