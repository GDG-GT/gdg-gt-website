# Free background processing

The owner approved using Supabase Free's 50 MiB per-file ceiling for videos and
exports. Smaller category limits remain: images 20 MiB, ordinary media documents
and ZIPs 25 MiB, contact/finance attachments 10 MiB. This is an explicit change
from the original 250 MiB media / 64 MiB export targets.

The existing Supabase + Vercel Hobby accounts can host the bounded worker design
without another hosting subscription. Free quotas still apply; this is not a
promise of unlimited traffic, storage, scanning or delivery.

## Isolation and queue ownership

`api/worker.mjs` accepts only a server bearer and one known worker group. Each
invocation claims at most one item through the existing database lease. Upload
bytes stay in private Supabase Storage. The parent sends only the queue id,
lease token and checksum to the isolated authenticated `api/scanner.mjs`.
The scanner rechecks the active lease, allowed purpose, 50 MiB ceiling, object
length and checksum before reading/scanning. It returns a verdict, never a
published object. Existing fenced normalization/promotion rechecks current
access and owns the final state change. Failures remain retryable or rejected.

ClamAV 1.5.4 comes from the checksum-pinned official Cisco Talos release. The
build uses FreshClam to verify fresh publisher-signed definitions, then packages
only the private runtime files. Definitions over 72 hours old fail closed.
An actual isolated 2 GiB Linux x64 test accepted clean content and rejected EICAR;
see `phase0/serverless-scanner-native.json`. Hosted acceptance is recorded
separately in `phase0/production-private-workers.json` when actually completed.

The private FFprobe metadata reader is built from the official signed FFmpeg
9.0.2 source with its verified SHA-256 pinned. The restricted build has no network
protocols, device inputs or external codec libraries. The existing parser also
forces the declared format, file/pipe protocol whitelist and bounded memory,
probe size and runtime. Native tools are private function artifacts, never
static website files. The regular local build does not require Linux tools.

`infra/production/private-workers.sql` contains the hosted-only queue wakeup
and minute recovery dispatcher. It uses the existing encrypted Vault credential,
coalesces rapid requests, and avoids HTTP entirely when no queue work is due.
Its functions/tables are inaccessible to public and ordinary API roles. Install
and enable it only after actual hosted runtime verification. This scheduler is
application infrastructure; it is not an assistant auto-resume timer.

## Build and acceptance

Vercel uses Node 24, Fluid compute, separate 300-second worker/scanner functions
and `npm run build:vercel`. The UI's ordinary build remains unchanged. Keep
`NODEJS_HELPERS=0` so signed webhook bytes remain untouched. Keep public uploads
disabled until the canonical hosted antivirus, media and private storage round
trip checks pass. The authenticated technical checks use generated owned WAV/CSV
objects and remove them; they do not create participant or business records.

References checked November 7, 2026:
- [Vercel function limits](https://vercel.com/docs/functions/limitations)
- [Vercel build image and compiler tools](https://vercel.com/docs/builds/build-image)
- [Official ClamAV releases](https://github.com/Cisco-Talos/clamav/releases)
- [Official FFmpeg download and release verification](https://ffmpeg.org/download.html)

Free alternatives were researched before introducing another account. Supabase
Edge's CPU/memory limits do not fit this antivirus engine; the actual local engine
used about a gigabyte. Smaller free containers do not fit it either. Northflank
was excluded after its November 6 incident update reported an ongoing credential
compromise investigation. No Northflank signup, OAuth grant or secret transmission
was performed. The owned research tabs were closed and the original private
Vivaldi tabs restored.
