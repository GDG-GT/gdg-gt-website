# Private media and gallery — local implementation

The general `media` bucket remains private. `/admin/media` manages permitted
scopes; `/admin/gallery` is an image-only curation surface. Gallery-only grants
allow scoped image read/create/update/delete and explicit publication, not
non-image files or shared-folder mutation. Blog Editor and foreign scope reads
remain denied. General Media CRUD never implies gallery publication.

## File flow and limits

Choose a scope/folder, then upload through a one-object, two-minute signed PUT.
The ten-minute upload intent binds current actor/session, expected bytes, MIME,
extension and SHA-256. Completion checks the actual object before queueing
`media_upload_scan`. The isolated scanner repeats checksum/content validation and
current authorization, scans through ClamAV, strips raster image metadata, checks
archive directories and probes audio/video with bounded native ffprobe. Download
and preview stay unavailable until clean promotion commits under a current lease.
Clean-object reservations prevent orphaned worker output from escaping cleanup.

- Raster: PNG/JPEG/WebP, 20 MiB, single-frame, ≤40 million pixels/16,000 px edge.
- Video: MP4/WebM, 250 MiB; audio: MP3/WAV/OGG, 50 MiB; valid bounded streams,
  dimensions and duration. No network protocols in native probing; seekable
  mode-0600 generated temporary files are removed afterward.
- Documents: PDF/DOCX/TXT/Markdown; ZIP archives, 25 MiB. No SVG/HTML rendering,
  executable ZIP entries, nested ZIPs, encryption, symlinks, unsafe paths, ZIP64,
  overlap or unbounded archive expansion. All non-images download as attachments.
- Local defaults: five active uploads/account, 25 files and 500 MiB/account/day,
  1 GiB/1,000 unpurged files per chapter/team scope. Archived/quarantined bytes
  reserve quota until actual cleanup. These are application defaults, not numeric
  quotas prescribed by the PRD; review capacity before hosted deployment.

Run `npm run jobs:media -- --watch` for isolated local scanning and publication.
Hosted operation needs a supervised, network-restricted worker with ClamAV,
ffprobe and memory/disk sufficient for bounded 250 MiB files, not a Vercel request.
The ordinary upload worker cannot claim the new media job kinds. Storage requests
time out after two minutes; scan/probe/lease limits are bounded separately.

Private URLs last 60 seconds and are kept in UI memory, cleared on expiry/session
change. Previously issued URLs may work until expiry; already downloaded copies
cannot be recalled. Inventory and public DTOs never contain private storage keys.

## Metadata, usage and public approval

Folder collisions, eight-level depth/cycles and revisions are checked. File bulk
actions are atomic for ≤50 selected revisions. Moves recheck source/destination
grants and quotas; publication, usage references and active uploads block unsafe
movement/archive. Tags support add/remove/replace, case-insensitive deduplication;
star state and private search metadata are retained. Usage checks cover explicit
`media_usage`, content/event/profile/sponsor/blog/Linktree and finance references.

Publishing requires a clean raster image, meaningful alt, active team, published
associated event in the same scope, explicit publish authority, current password
and typed confirmation. The queued approval freezes the source revision; promotion
rechecks the current actor/grants/password hash/source. The worker writes three
reserved WebP derivatives (360/960/1920 width targets, without enlargement), each
≤3.5 MiB, into a server-generated public namespace inside the private bucket.
Only the approved derivative is served by `/api/v1/media/public/:id`, with strict
WebP MIME, nosniff, disposition and revalidation. No original file proxy, private
path selector or legacy `is_public` shortcut exists. Explicit public download
permission controls the attachment endpoint. Any visible image can still be
saved by a browser; this option is not DRM.

Revoke immediately denies new asset requests and removes gallery eligibility.
In-flight requests and downloaded/open copies cannot be recalled. Public metadata
may remain in existing page state/cache briefly; asset authorization is checked
again on each network request. Pending approval can also be revoked.

## Retention and cleanup

Archive is recoverable for 30 days while bytes remain. Cleanup then checks usage,
publication and active leases, marks a non-restorable cleanup fence, removes
original/quarantine objects, and atomically acknowledges purged bytes plus filename
erasure/quota release. Retry responses containing erased filenames are removed.
Abandoned/rejected uploads become eligible 24 hours after expiry. Reserved failed
scan output and obsolete/revoked derivatives become eligible after 24 hours and
without an active worker lease. Metadata tombstones and sanitized audit remain.
Cleanup is wired into the existing hourly `form-cleanup` scheduled operation;
hosted scheduler/worker supervision is still a release requirement.

## Evidence and open acceptance

- Canonical SQL through 081, permission/lease/revision/quota/retention tests and
  both 100-client event/Form concurrency tests pass.
- 314 unit tests pass; typecheck, changed-UI lint and production build pass.
- 12 actual media-folder checks and 43 normal media-file checks pass. The optional
  browser harness adds a 44th check and temporarily approves two generated color
  rectangles, then revokes them and archives its exact fixtures.
- Real signed S3 PUT, ClamAV, sharp, ffprobe (MP4/WebM/MP3/WAV/OGG), safe ZIP,
  EICAR rejection, checksum/MIME spoofing, private URLs, public derivatives,
  revocation, current page withdrawal and scoped physical cleanup are exercised.
  Only a generated rejected antivirus fixture is physically removed.
- Existing real Forms private-upload suite passes 40 checks after storage changes.
- Browser checks verify desktop/375 px curation, no page-wide overflow, normal
  scrolling, Stay preserving a draft, reviewed publication copy, private preview,
  responsive approved assets and keyboard lightbox/download gating. Proofs are in
  `.docs/ui-review/real-media-*` and `real-gallery-*`.

Full supported-device, manual screen-reader, hosted storage/CORS/header/scanner
isolation/load/retention and visual approval gates remain. Bundle/dependency
findings are not waived. No real chapter image, external mail or deployment was
used. Newsletter/campaign and other PRD backlog work continues.
