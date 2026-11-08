# Operations, retention and sanitized telemetry

Local implementation for PRD 26.8, 27.3 and 29.1. Hosted acceptance remains open.

## Scheduled retention

Three separate daily UTC jobs use the existing server-only `CRON_SECRET`,
browser-origin/cookie rejection, distributed occurrence locks, bounded leases,
attempt limits and numeric run counters. Query-supplied retention waivers are
rejected. Each database cleanup call is bounded to 1,000 selected rows per class;
each run drains up to twenty batches within a 40-second work budget. Saturated
runs preserve their numeric progress and finish as retryable failures, never as
completed cleanup. The scheduler retries after 30 seconds, subject to the existing
eight-attempt/day bound. Repeated failures raise the operational worker alert.
Larger backlogs require supervised recovery; no request performs unbounded deletes.

- `session-cleanup`: expired/revoked sessions, gate and CSRF records after 30 days;
  expired risk windows and idempotency results; 90-day identifier-free auth
  aggregates; one-year security events; 90-day terminal email detail.
- `notification-cleanup`: local conservative policy is 90 days for read notices,
  180 days for unread notices. User dismissal remains separate.
- `report-cache-cleanup`: expired report caches only.

Authentication cleanup detaches expired session references from retained exports,
media publications and privacy cleanup evidence. It expires abandoned pending
private-upload intents first, but never removes clean finance evidence or actual
file bytes. Existing held-file cleanup workers own physical deletion.
Audit actions are retained indefinitely (at least the PRD's two-year minimum);
automatic audit deletion is not enabled. Financial evidence/deletion restrictions
remain unchanged. These jobs are not a finance/audit erasure workaround.

Raw risk keys are HMACs and stop participating when their rate window expires;
physical expired-row deletion runs daily. Auth counters are aggregated by UTC day
and fixed auth scope at insertion/increment, with no address, risk key or actor.
Historical already-deleted windows cannot be reconstructed. Aggregate retention
is 90 days.

## Telemetry and alerts

API logs explicitly construct timestamp, environment, generated request ID,
source-controlled route template, method, status, latency, authenticated actor ID,
authorization state, allowlisted error code and bounded dependency timing.
AsyncLocalStorage isolates concurrent requests. Database/storage/mail/push/scanner
timings retain counts/durations/failure counts only. Raw URLs, query strings,
slugs, headers, bodies, provider exceptions, file paths, endpoints, answers and
credentials are never serialized. Configuration failures use the same safe
boundary. Actor IDs are not written to aggregate metric buckets.

Minute/category counters expire after 24 hours. `operations-monitor` evaluates
every five minutes under its own authenticated lease. Rolling 15-minute local
thresholds are: auth failures 20; 5xx 5; email rejection 5; registration conflicts
10; database failures 3 or slow-request count 5 (750ms); storage failures 5; Forms
rejections 10 or response-limit conflicts 5; rejected scans 3; export failures 3;
push failures 5; CSP violations 10. Missed jobs are checked after two cadences,
with installation grace. Duplicate completed occurrences are separately flagged.
Thresholds are signals, not incident determinations, and need hosted tuning.

Worker failure transitions record bounded categories transactionally. Privacy
cancellation is not classified as provider rejection. CSP reports support legacy
and Reporting API JSON, a 16KiB/10-item limit and a 10-request/minute hashed-peer
quota. URLs/source samples are discarded; only counts are retained. Production
CSP includes a same-origin report endpoint. A report-only staging rollout still
must be rehearsed before hosted enforcement.

`/admin/operations` and its API are Super Admin-only, including negative page-grant
tests. This read-only page shows freshness, alert windows, latest outcomes and
retention policy, never cleanup buttons or sensitive payloads. Opening it cannot
release a hold, delete data or send mail. Alert windows are grouped by category
and UTC hour; below-threshold evaluations close outstanding conditions.

## Local and hosted operation

`jobs:scheduler -- --watch` supplies precise local cadence; separate upload,
media, newsletter and form-export workers handle durable queues. External email
and push sending remain disabled. `CRON_SECRET` is separate from session/gate
credentials and must not enter browser environment variables.

Database-dependent alerts cannot detect complete loss of their own database or
scheduler. Production still requires an independent uptime/watchdog service,
sanitized log collection, a reviewed on-call destination, delivery tests and
missed-run recovery. No external alert recipient/provider was configured here.
Do not interpret an unevaluated/stale monitor or an empty alert table as healthy.

## Evidence

- Migrations 096–097, all canonical SQL tests and both 100-client concurrency
  races pass under new and legacy Supabase table-grant defaults.
- 362 unit tests pass, including concurrent request isolation, redaction,
  dependency failure timing, metrics quotas, role boundaries and CSP stripping.
- 13 actual retention HTTP checks verify auth, fixed policy and occurrence
  deduplication. Cutoff/finance-evidence preservation assertions run in disposable
  SQL; repeated daily HTTP tests do not claim a new cleanup mutation.
- 13 actual monitoring HTTP/database checks pass, including both CSP formats,
  Super Admin restrictions, current persisted outcomes and no-store responses.
- Desktop/375px browser shows real monitor status with no horizontal page overflow
  and functional scrolling. Screenshots are in `../phase0/screenshots/operations-*`.
- Real ClamAV health/clean/EICAR tests pass after local signature update.

Remaining: hosted scheduler/provider/log/alert configuration, load/failure/recovery
testing, independent watchdog, manual supported-device/screen-reader acceptance,
chapter retention-policy approval and complete PRD launch gates.
