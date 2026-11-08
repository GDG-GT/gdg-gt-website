# Finance implementation and local verification

PRD scope: FIN-001–005, §24.4, §25 idempotency, §26 private storage/retention,
Prompt 16. The application records decisions; it never connects to a bank,
executes a payment or authorizes personal spending.

## Entry points

`/admin/finances`: Requests, Budgets and Reports. Chapter administrators manage
allocations. Ordinary members can create their own private requests and read
current, explicitly granted team scope. Another lead cannot read a private draft.
Team approval requires current lead/co-lead membership and the explicit finance
page/action grant. Global administrators cannot approve their own submissions.
Blog Editors have no finance access. Membership removal revokes team history.

Amounts are positive USD decimal strings, up to `9999999999.99` per record.
Draft payloads are editable by their creator; scope/approval requirements are
fixed on creation. Submission makes the financial payload immutable. Decisions
require a revision, password and exact `FIN-…` reference. A rejected request needs
a reason. New requests are separate records, never rewrites of final decisions.

Budgets must be activated before reference. Approval reserves expense and
reimbursement amounts within the linked scope/date range and available total.
Completion counts the amount as spent. Income and transfers do not silently
increase or move an allocation. Closing a budget with pending/committed requests
is denied. Reports count completed activity, not requested funding. PRD funding
cards are explicitly marked non-ledger planning references.

## Receipt policy

PDF/PNG/JPEG/WebP, maximum 10 MB per file, ten active files per request. The
server signs a 120-second upload into private quarantine; the object must match
declared size, MIME and SHA-256. The worker verifies bytes, scans with ClamAV and
normalizes images before promotion. Current uploader session, parent revision
and finance upload authority are checked again before making a file clean.

Adding receipts is currently allowed on authorized draft/pending records only.
Final requests allow append-only notes, not new attachments. Clean receipts are
immutable and retained. Downloads require current parent read authorization,
are audited without filenames/URLs and are signed for 60 seconds with attachment
disposition and octet-stream content type. Signed links are bearer access during
that short lifetime; do not paste them into notes, mail or external services.

Financial retention has not been approved by chapter leadership: record and
receipt deletion is disabled. The cleanup worker may purge only unpromoted,
abandoned/rejected quarantine bytes after 24 hours; receipt metadata remains.
Clean receipt objects never enter orphan cleanup. Configure the private bucket,
server-only S3 credentials, current scanner signatures and fenced job workers
before enabling uploads. Never mark the finance bucket public or cache these APIs
in a service worker.

## Tests

`npm test`, `npm run typecheck`, `npm run test:db`, scoped ESLint and
`npm run build` cover validation, money precision, authorization/transition SQL,
idempotency, scope revocation, upload promotion fencing and retained cleanup.

`npm run test:local-finances` exercises real loopback accounts, approvals,
concurrent budget reservations, reports, notes and audited exports.
`npm run test:local-finance-uploads` exercises signed object upload, the real
scanner, metadata stripping, private download and the harmless EICAR test string.
These retain explicitly fictional financial records while archiving exact
fixture accounts/teams. No test resets rate-limit counters or job history.

Browser review screenshots are in `.docs/ui-review/real-finance-*`. Browser
file-picker automation needs the user-controlled Chrome extension file-URL
permission; it has not been enabled by the agent. Actual HTTP storage/scan checks
pass, but a full browser file-picker/send acceptance check remains open.
