# Production runtime and first-owner setup

The owner chooses the host and domain. No Georgia Tech hosting account is needed.
The user authorized GDG-GT GitHub push and production deployment on 2026-11-07.
Hosted setup is now in progress; local checks do not certify a deployed environment.
See CURRENT_CHECKPOINT.md and ../verification/LOCAL_FUNCTIONAL_VERIFICATION.md for current evidence.

Use Node 24 LTS for API and worker processes (server modules import TypeScript
directly). Build with `npm ci` and `npm run build` in CI. The build produces static browser
assets in `dist` and a server-only renderer in `.build/ssr`. Package both with
`api/site.mjs`; never copy `.build/ssr` into public static storage. Home, Events
and Contact render their current public content before hydration, with fresh
availability checks and no-store HTML. Query-bearing/private/Forms routes keep
their ordinary client boundary. Run `npm run test:public-ssr` after building to
verify the compiled renderer without network access. Deploy the
versioned API and public-document handler, not a static-only SPA rewrite; retain
the routing, CSP, no-store private responses, immutable hashed assets, gzip/Brotli,
HTTPS and service-worker headers defined in `vercel.json` on any chosen host.
The Vercel adapter packages shared TypeScript imports explicitly. Set
`NODEJS_HELPERS=0` in the Vercel Production project environment before building:
standalone Node function helpers otherwise supply parsed JSON bodies, even when
Next-style `api.bodyParser=false` is exported. Provider signatures require the
original bytes. Ordinary JSON routes already implement bounded stream parsing. A single
`api/v1.mjs` function handles nested API routes through the reviewed versioned
rewrite; the root homepage also has an explicit SSR rewrite so the static index
cannot take precedence. Its adapter retains the original webhook byte stream.
The current free deployment uses separate authenticated 300-second Vercel worker
and native-scanner functions. See FREE_BACKGROUND_RUNTIME.md for exact build,
private artifacts, leased-object transport, free file caps and hosted evidence.
A persistent supervised runtime remains an alternative. Keep the scanner private;
do not run scans/exports in a 30-second browser request.

## Review before keys are available

`node scripts/runtime-workers.mjs --plan` lists all eleven authenticated scheduled
jobs and their cadence. `node scripts/bootstrap-owner.mjs --plan` describes the
first-owner setup. Both plans work without credentials and make no network calls.
The existing local runners remain restricted to loopback.

## At launch, after migrations and private configuration

Apply the canonical forward migrations in order. Configure `.env.example` names
in trusted server/worker secrets. Never put server credentials in `VITE_*`, command
arguments, chat, the browser bundle or Git. Do not copy the local auth database or
its passwords. Generate independent production risk/encryption/cron secrets,
Storage credentials, Realtime signing identity, gate hash and VAPID keys.

To create the first owner, temporarily provide `INITIAL_OWNER_EMAIL`,
`INITIAL_OWNER_NAME`, `INITIAL_OWNER_PASSWORD` (14–128 characters) and the
server-generated `ADMIN_GATE_SECRET_HASH` to a trusted one-off process. Run:

```sh
node scripts/bootstrap-owner.mjs --apply --confirm-origin=https://YOUR_DOMAIN
```

The confirmed origin must exactly match production `APP_ORIGIN`. The atomic
database operation refuses to proceed if **any** account exists; it never resets
an existing owner. On interrupted output, inspect accounts read-only before
retrying. Remove the temporary owner password afterward. Create subsequent users
through the account workspace. Gate rotation lives under **People & account
access → Account security** and requires current password/typed confirmation.

## Supervised processes

Start one instance of each group under the host's process supervisor, with
automatic restart, bounded logs and a graceful shutdown allowance for current
work. Pass the exact real origin in place of `YOUR_DOMAIN`:

```sh
node scripts/runtime-workers.mjs --run --group=scheduler --watch --confirm-origin=https://YOUR_DOMAIN
node scripts/runtime-workers.mjs --run --group=uploads --watch --confirm-origin=https://YOUR_DOMAIN
node scripts/runtime-workers.mjs --run --group=media --watch --confirm-origin=https://YOUR_DOMAIN
node scripts/runtime-workers.mjs --run --group=exports --watch --confirm-origin=https://YOUR_DOMAIN
node scripts/runtime-workers.mjs --run --group=newsletter --watch --confirm-origin=https://YOUR_DOMAIN
```

Without `--watch`, each command runs one bounded pass, suitable for a host
scheduler. The scheduler POSTs with `CRON_SECRET`, refuses redirects and never
forwards a browser session. Database cadence/leases deduplicate restarts and
concurrent invocations. Workers reuse existing database claim/lease/retry logic.
Uploads and media need private S3 + clamd connectivity; exports need private S3.
The delivery scheduled job handles transactional mail; the newsletter group
handles approved campaigns. The event-push scheduled job runs its push worker.

Resend is integrated and the live verified sender/reply-to/signature configuration
has passed real delivery and signed webhook checks. Transactional/campaign
schedules are active after the owner confirmed the chapter inbox. In a new
unverified environment, keep `EMAIL_SEND_ENABLED=false` until its own acceptance. Browser
push uses VAPID separately and requires an actual-device smoke test. Configure
an independent uptime/watchdog service: an unavailable API cannot alert through
its own database monitor.

## Release evidence still obtained on the chosen host

Verify exact artifact promotion, real routing/cookies/CSP/cache, owner sign-in,
one approved Resend send + signed webhook, private storage/scanner/worker jobs,
physical-device install/update/push, backups/PITR/object restore and rollback.
Keep rollback available and observe job outcomes, authentication, error rates and
delivery for 48 hours **after** deployment. Live keys are planned launch inputs;
they do not block completion of local features. SSO/Google and Bevy/Engage remain
explicitly deferred.

## Current hosted scheduler

The canonical Supabase project has eleven named `gdg-gt-*` Cron jobs using pg_net
to POST to the existing authenticated HTTPS endpoints. The nine maintenance jobs
are active. Delivery and newsletter jobs are inactive until email launch checks
finish. Their commands read the shared cron bearer from encrypted Vault
`gdg_gt_cron_secret`; commands contain no plaintext bearer. Cron-secret rotation
must update both Vercel `CRON_SECRET` and that Vault entry. Do not recreate these
jobs or run a second scheduler against them. This replaces the separate scheduler
process only; private scanner/upload/media/export workers still need their host.
