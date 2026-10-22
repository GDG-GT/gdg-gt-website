# Dedicated local runtime

The development website is `http://127.0.0.1:8080`; its same-origin `/api/v1`
requests proxy to the Node API on port 8081. The database and private Storage use
only the isolated `gdg-gt` Colima profile and `gdg-gt-prd-local` Supabase project.
No production configuration is implied by this setup.

## Communications checks

`npm run test:local-team-chat` checks one-room provisioning, current team-derived
access/moderation, private WebSocket events, protected HTTP catch-up cursors,
Unicode messages, team/room archival and recovery. It uses independent fictional
accounts and recoverably archives the fixture team/chat/accounts. No quota reset,
external delivery or permanent deletion is involved. A metadata-only private
control probe confirms the local database Broadcast worker is ready before the
real message-trigger assertion; SUBSCRIBED alone is insufficient during a local
tenant rebalance. `-- --hold-for-browser` accepts `change` and `done`.

Migration 049 adds per-room change cursors, without a second copy of message
bodies. SQL recovery tests cover a 125-message gap across bounded 100-row pages,
old edits, rollback-safe cursors, removed-body placeholders and authorization.
Application live events remain advisory: authorized HTTP catch-up is the source
of truth. Hosted transport/load acceptance is still pending.

Direct-message integration is available with `npm run test:local-direct-messages`.
It uses independent fictional sessions, private sockets and loopback Mailpit only.
The suite needs two available `messages.review` confirmations in the natural
15-minute window; a read-only preflight stops before fixture creation if needed.
No quota is reset. One review proof is deliberately shortened to four seconds in
the dedicated local database to verify hard socket/API expiry; production policies
and session lifetimes are unchanged. `-- --hold-for-browser` keeps a fictional
own-thread fixture open; enter `change` for a remote follow-up and `done` for
recoverable cleanup. It never prints passwords, session material or email values.

`npm run test:local-announcements` checks protected drafts, preview/confirmation,
current audience scope, private invalidations, durable notices, Mailpit and the
secret-authenticated publication job. It requires an unclaimed natural five-minute
announcement occurrence: pause the identified local polling process, then wait for
the next slot if the read-only preflight stops. Never reset scheduler rows or rate
limits. Test-only accounts have independent confirmation quotas; all fixtures are
recoverably archived. `-- --hold-for-browser` accepts `change` (remote pin) and
`done` (cleanup). The browser-only draft review also remained unpublished.

## Start or resume

Run these in separate terminals as needed. Starting an already-running listener
can fail with an occupied-port error; inspect the existing task process first.

```sh
npm run local:start
npm run dev:api
npm run dev
npm run scanner:local
npm run jobs:uploads -- --watch
npm run jobs:scheduler -- --watch
```

ClamAV was installed from official Homebrew. Its private runtime/config/signature
directory is `~/Library/Caches/gdg-gt-scanner`; clamd accepts local streams only
on `127.0.0.1:13310`. This is not a whole-disk scanner or a system-wide service.
Refresh signatures with `npm run scanner:update`. Scanning fails closed if
signatures are stale or the scanner is unavailable. Production requires a
separately provisioned, isolated worker and ongoing signature updates.

`npm run setup:local-storage` verifies scanner availability and idempotently
creates the required private buckets. Server-only local S3 transport credentials
are in the ignored `.env.server.local`, not in browser configuration. Enabling
uploads is an explicit operator configuration after verification, not a fallback
to public buckets. All five configured buckets are private; only form uploads
are connected end-to-end at this checkpoint.

## Private live updates

`npm run setup:local-realtime` installs the isolated stack's public transport key
and local signing configuration into the ignored, mode-0600 `.env.server.local`.
Restart the API after bootstrap. This script refuses a non-loopback environment
or conflicting existing values. The symmetric local key is accepted only with
the explicit development flag and exact dedicated localhost origins. It is not
a production setup or a reason to export a service-role key to the browser.

Production requires an imported ES256 P-256 key/key ID in the server environment,
matching the backend verification key. Follow the official
[Supabase JWT guidance](https://supabase.com/docs/guides/auth/jwts) and
[private Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).
No hosted key import or deployment has been performed.

The browser calls `/api/v1/auth/realtime-token` with its HttpOnly session and CSRF,
then authenticates a private, single-topic socket. JWTs last at most five minutes,
are held in memory, and are renewed before expiry. The dedicated `gdg_realtime`
database role cannot read application tables or mint grants. Broadcasts contain
only invalidation metadata; content is reread through the protected API. Current
channel, whiteboard and own-notification scopes are implemented. Authorization-change
signals request immediate teardown/reauthorization; cached backend policies mean
expiry remains the hard maximum for a client ignoring that instruction. Logout
and observed session failures disconnect immediately. Offline fallback is API
polling, never a public socket or anonymous database query.

`npm run test:local-realtime` exercises actual local WebSockets, cross-topic and
PostgREST denial, signature/expiry enforcement and body-free broadcasts. The
optional `-- --hold-for-browser` requires an interactive terminal and leaves only
new fictional rooms available for UI inspection until `done` is entered. Cleanup
archives those rooms and marks only the new review notification read.

Whiteboards use a lazy-loaded local editor, with fonts prepared from the installed
package by `scripts/prepare-whiteboard-assets.mjs` before `dev` and `build`. The
generated `public/assets/excalidraw` directory is ignored; do not put user files
there. No editor cloud, external scene upload or remote font host is required.
`npm run test:local-whiteboards` checks independent-session scope, optimistic
version/timestamp conflicts, archive recovery, exports and actual private sockets.
It checks confirmation-quota headroom before creating fixtures. Repeated runs must
wait for existing limits; neither rate windows nor authentication are reset.
The optional interactive hold uses `change` to commit a new fictional version and
`done` to recoverably archive only that suite's records.

Tasks are available in `/admin/communications`. `npm run test:local-tasks`
exercises independent assignee/outsider/editor sessions, comments, private
reassignment, date-only deadlines and the real scheduled/notification pipeline.
Pause the identified local job runner before this deterministic suite, then
restart it afterward. A read-only preflight requires an unused natural
15-minute overdue occurrence and confirmation-quota headroom; do not delete run
rows, reset quotas or weaken checks to rerun it faster. SQL tests do not consume
application login or scheduler windows. The interactive hold can leave only new
fictional tasks available for browser review until `done` is entered.

## Local scheduling and retention

The local runner invokes authenticated HTTP jobs with a separate `CRON_SECRET`,
never a browser session. Times use UTC cadence windows, not browser timezone.

| Work | Cadence | Retry |
| --- | --- | --- |
| Open/close scheduled forms | 5 minutes | 30-second local retry; distributed lease and occurrence deduplication |
| Expired form drafts, abandoned/rejected uploads and contact retention | Hourly | Failed object deletion remains retryable; active drafts, response files and held contacts are protected |
| Local transactional delivery | 1 minute | Per-message fenced leases; bounded backoff and eight-attempt dead state |
| Newsletter schedules, delivery pass and retention | 5 minutes | Frozen audience, current grants, per-recipient leases; bounded retries and deadline |
| Event Push schedules, delivery pass and retention | 5 minutes | Verified owners, unique occurrence, six-attempt fenced retry, 30-minute deadline; actual sending disabled locally |
| Dedicated local newsletter/test delivery | Queue polled every 5 seconds | `npm run jobs:newsletter -- --watch`; local SMTP only |
| Overdue tasks | 15 minutes, UTC date boundaries | Per-occurrence scheduler lease; one generic notice per task/deadline occurrence |
| Upload scanning | Queue polled every 2 seconds | Fenced leases; transient scanner failure retries; unsafe content is rejected |

Abandoned/rejected uploads wait 24 hours after expiry/rejection. Deleted intent
cleanup also waits beyond the direct-upload capability's lifetime. Completed
response files are not treated as abandoned. This does not yet implement every
PRD retention policy, event-reminder job, or missed-run alert. Newsletter campaign
workflows and retention are documented in `NEWSLETTER_OPERATIONS.md`.
Private contact files use the ordinary Forms/contact upload worker and the same
hourly cleanup occurrence. Resolved contacts expire after 180 days unless held;
see `CONTACT_OPERATIONS.md` for capability, quarantine and private inbox controls.

Hosted deployment must choose and configure Supabase Cron or an equivalently
precise paid scheduler. No Vercel Hobby schedule is used. This local process is
not configured as an operating-system login service and stops with its process.
Local email goes only to Mailpit on loopback; external delivery stays disabled.

## Verification

```sh
npm test
npm run typecheck
npm run test:db
npm run test:local-scanner
npm run test:local-forms-suite
npm run test:local-jobs
npm run build
```

The combined Forms suite shares one real authenticated cookie session in process
memory and logs out afterward. It does not reset or bypass the five-login quota.
Pause the local scan/delivery polling processes when running that deterministic
suite, since it deliberately exercises pending states before claiming jobs.
Standalone suites can hit the normal login quota; wait for its existing windows
to expire. Never weaken application limits to make repeated test logins pass.

For browser upload automation, the ChatGPT browser extension requires its file-URL
permission. That permission was not enabled by the agent. Other UI checks and
signed-upload integration do not depend on broadening extension access.

Private development credentials are in `.docs/local-auth.local` (ignored, mode
0600). Bootstrap verifies existing credentials and never silently resets them.
Do not copy those values, S3 secrets, or the cron secret into logs, Git, or VITE_*.

Enter the gate code in the footer newsletter field and press **Enter** or click
**Subscribe**. The server recognizes an email-shaped gate code and issues only
the existing private gate cookie, never a subscriber row or mail job. Ordinary
addresses still use newsletter double opt-in. Shift+Enter remains an optional
direct-gate shortcut, not a requirement. No gate value or hash is embedded in
frontend code. This shared email-entry endpoint is limited to five requests per
risk key per 15-minute window; a successful match also checks the existing gate
failure lockout and gate request budget. The dedicated gate endpoint retains its
separate successful-open and five-failure limits.

The login and restricted public Forms screens display **Georgia Tech SSO · Coming
soon** as a disabled, non-submitting option. The Forms builder shows a disabled
future access mode. No provider is configured, no provider redirects happen, and
no SSO session or verification proof can be created. See `GEORGIA_TECH_SSO_PLAN.md`.
