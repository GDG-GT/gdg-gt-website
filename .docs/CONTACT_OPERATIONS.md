# Contact inbox and private attachments

Implemented locally on 2026-10-21, forward migration 088. This is implementation
and local test evidence, not hosted acceptance or permission to contact real people.

## Public workflow

`/contact` accepts the validated name, email, inquiry type, message, optional
interests and one optional PDF, PNG, JPEG or WebP file up to 10 MiB. Files go
directly to a private quarantine bucket through a two-minute one-object signed
PUT. A random 256-bit capability, kept only in page memory, authorizes upload
status/completion/removal; it is never a URL parameter or a private account login.
Upload intents expire after ten minutes. Creation is limited to three active
intents and ten per network/day, with additional HTTP risk limits.

The worker checks actual size, checksum, sniffed type and ClamAV result. Images
are decoded/re-encoded to strip metadata. A clean immutable destination is
durably reserved before writing. Pending/rejected/expired files cannot be sent.
Final acceptance atomically binds exactly one clean owned upload to one inquiry,
then queues acknowledgment and chapter notification. Retries reuse the original
request identity, including after an ambiguous successful submission. Removing
an unsubmitted file abandons it; anonymous removal cannot erase a submitted file.

No contact message, file, upload capability or private inbox enters the offline
submission queue. Leaving a nonempty form uses the shared Stay/Discard safeguard.
Closing the page loses the in-memory capability; expiry/cleanup handles abandoned
objects. Provider failure does not roll back the saved inquiry.

## Chapter workflow

Open `/admin/communications?tab=contact`. Only current active Admin/Super Admin
accounts can list/read inquiries, change New/In progress/Resolved status or mint
an audited 60-second attachment-only private download. Team members cannot read
the inbox or files. DTOs omit bucket paths, object keys and capability hashes.
Chapter notices link to this protected inbox, never directly to storage.

Status writes check the current revision. Reopening clears the resolution clock.
Resolved inquiries are redacted 180 days after resolution, unless held. Retention
holds/releases require the current password, meaningful reason, current revision
and `HOLD CONTACT` / `RELEASE HOLD` confirmation. Release warns that overdue
cleanup may run immediately. Redacted records cannot be restored by adding a hold.

Cleanup first tombstones/redacts identity, message and interests, denying new
downloads, then physically deletes tracked quarantine/clean/reserved objects.
Only successful deletion acknowledges purge and erases the original filename and
network risk hash. Failures remain retryable. Already issued download capabilities
may remain usable for their short lifetime; delivered/exported copies cannot be
recalled. Unbound expired/rejected intents wait 24 hours, explicitly removed
intents at least three minutes, and active scan leases are excluded.

## Local runtime and evidence

```
npm run jobs:uploads -- --watch
npm run jobs:scheduler -- --watch
npm run test:local-contact-files
```

The ordinary upload worker handles Forms and contact scanning; the separate media
worker does not claim contact jobs. Hourly upload cleanup also handles contact
retention. SMTP is loopback Mailpit only; live provider sending remains disabled.
Pause the identified ordinary upload worker for deterministic scan tests, then
restart it. Tests do not reset quotas; wait for natural rate windows before reruns.

- **88 migrations**, full canonical SQL and both 100-client capacity tests pass.
  SQL 088 covers capability/lease/scope/binding/retry/hold/redaction boundaries.
- **330 unit tests**, typecheck, changed-UI lint and production build pass.
- **30 actual contact checks** pass (`phase0/local-contact-files.json`): private
  direct S3 upload/download, real ClamAV including harmless EICAR, forged type and
  hash rejection, actual SMTP, role denial, optimistic status and retention holds.
  Only captured fictional fixtures were physically purged; a separate storage
  HEAD confirmed the promoted object was gone. No real contact was erased.
- **40 existing Forms-upload regression checks** pass after the shared worker
  change, including real scanner/normalization and physical cleanup.
- Browser desktop/375px checks cover private inbox/download preparation,
  status/hold warnings, Stay/Discard, public form draft preservation and normal
  scrolling without horizontal overflow. Proofs: `ui-review/contact-{inbox-desktop,
  inbox-mobile,form-mobile}.png`. Only fictional records appear.

Still open: browser file-chooser automation (extension file access was not enabled),
full screen-reader/device/accessibility review, hosted storage CORS/scanner
isolation/worker supervision/retention/load/security headers and approved live
sender/chapter address/privacy policy. Other PRD backlog items remain open.
