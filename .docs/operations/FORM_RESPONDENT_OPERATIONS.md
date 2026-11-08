# Identified Forms and respondent-requested copies

Implemented locally 2026-10-21, migration 092. This supersedes anonymous runtime
submissions and automatic respondent receipts, per Tejas's latest decisions.
It does not certify full PRD or hosted/institutional acceptance.

## Identity

Every new response and saved draft requires system-level name and email, even
when the immutable published definition predates this requirement. An arbitrary
name/email question is not a substitute. Public and unlisted details are declared,
not verified. Invitation/verified-email access fixes the email to that capability;
chapter forms use the current account's email. Browser-supplied verification,
ownership and extra identity fields are rejected. Existing historical responses
remain explicitly unknown; no identity is fabricated or backfilled.

Respondent metadata survives private draft resume and is visible/searchable to
authorized response reviewers. CSV, XLSX and JSON exports include name, email and
provenance, with the existing permissions, audit and spreadsheet escaping. Editing
cannot replace an existing respondent's name/email. Redaction, deletion, expiry
and permanent erasure clear the captured identity; queued copies then fail closed.
Old anonymous submission/draft/edit RPCs and their helper variants are not executable
by the API service. Only the new identified server entry points are exposed.

Georgia Tech SSO (preferred) and Google sign-in are future work explicitly deferred
by Tejas. No provider is enabled and entering an email never claims authentication.

## Email me a copy

The final step offers an unchecked **Email me a copy of my completed response**.
If selected, a successful commit atomically queues one private copy to exactly the
respondent's entered email. No extra email confirmation or login is required for
a public form. No chapter CC/BCC, admin review link, edit/resume/upload capability,
private object key or signed file URL is included. Questions and answers include
the respondent's own sensitive answers, as explicitly requested; the checkbox and
privacy notice explain this before submission. Uploaded files are represented
by filenames only, not attached or made public. Hidden branch questions are not
included. Multi-select, grid, multiline and long answer values are not truncated.

The copy is separate from chapter notifications. Chapter mail still requires an
explicit recipient/content review and excludes sensitive answers and files. The
legacy receipt publication setting is preserved only for compatibility; it does
not trigger an unrequested receipt or limit a respondent's requested full copy.
New forms do not present that legacy switch. Previously queued legacy mail still
obeys its original authorization/review checks.

Durable jobs store only a copy-record reference. The leased worker resolves the
exact requested response revision; a later edit cannot silently change an earlier
copy's contents. It skips removed/redacted responses, archived forms, wrong/expired
leases and requests older than 24 hours. Edits may explicitly request a new copy;
retrying an older edit cannot queue a copy of a later revision. Job creation is
idempotent per response/revision. Provider retries reuse the existing stable job
identity; SMTP cannot guarantee exactly-once delivery after a process crash.

Recipient-wide transaction-locked quota: at most three requested copies per hour
across forms/devices, in addition to existing submission network/form rate limits
and honeypot. Reaching that copy quota still saves the response and truthfully
reports that no copy was queued. No available mail transport disables the checkbox
without preventing submission. Queued is not delivered. Entered addresses are not
verified: a typo or malicious address can receive that submitted data. Respondents
must check the address carefully. Delivered copies cannot be recalled.

## Local verification

345 feature-scope unit tests, typecheck, changed-UI lint and the production/PWA
build pass.

- 16 actual HTTP/DB/loopback-SMTP checks in `npm run test:local-form-respondent`:
  mandatory identity, strict provenance, draft resume, unchecked/no-email,
  immediate opt-in, retry deduplication, edit recipient lock, reviewer search,
  JSON metadata export, exact original sensitive-answer revision and sole recipient.
- Canonical SQL and both 100-client capacity tests pass through 092; focused SQL
  covers service/browser denial, mandatory identity, copy quota, worker lease,
  sensitive-answer masking for reviewers and redaction suppression.
- Existing Forms/access/branches/40 upload checks, 19 chapter-mail checks, 15
  history checks, 20 privacy checks, 28 background-export checks and 19 permanent
  deletion checks pass with explicit fictional respondent fixtures.
- Browser desktop/375px verifies required-field focus, unchecked opt-in, keyboard
  Space selection, visible review recipient, successful mobile commit, scrolling
  and no horizontal overflow. Proofs: `../ui-review/form-respondent-copy-*.png`.

Only fictional local data and loopback SMTP were used. Production sender/domain,
mail-provider complaint/delivery behavior and institutional privacy review remain
separate release gates. No real provider send or SSO setup was performed.
