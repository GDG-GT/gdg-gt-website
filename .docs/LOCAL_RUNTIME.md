# Dedicated local runtime

The development website is `http://127.0.0.1:8080`; its same-origin `/api/v1`
requests proxy to the Node API on port 8081. The database and private Storage use
only the isolated `gdg-gt` Colima profile and `gdg-gt-prd-local` Supabase project.
No production configuration is implied by this setup.

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

## Local scheduling and retention

The local runner invokes authenticated HTTP jobs with a separate `CRON_SECRET`,
never a browser session. Times use UTC cadence windows, not browser timezone.

| Work | Cadence | Retry |
| --- | --- | --- |
| Open/close scheduled forms | 5 minutes | 30-second local retry; distributed lease and occurrence deduplication |
| Expired form drafts and abandoned/rejected uploads | Hourly | Failed object deletion remains retryable; active drafts and response files are protected |
| Local transactional delivery | 1 minute | Per-message fenced leases; bounded backoff and eight-attempt dead state |
| Upload scanning | Queue polled every 2 seconds | Fenced leases; transient scanner failure retries; unsafe content is rejected |

Abandoned/rejected uploads wait 24 hours after expiry/rejection. Deleted intent
cleanup also waits beyond the direct-upload capability's lifetime. Completed
response files are not treated as abandoned. This does not yet implement every
PRD retention policy, campaign/task/reminder job, or missed-run alert.

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
