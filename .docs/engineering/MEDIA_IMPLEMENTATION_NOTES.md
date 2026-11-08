# Media migration work in progress

Update: the local media/gallery implementation now includes migrations 074–081,
private direct uploads, metadata/SEO, tags/star/bulk movement/archive/restore,
private previews/downloads, responsive explicit WebP publication/revocation,
30-day trash retention and retryable object cleanup. Both legacy routes are
replaced by `src/ui/media/MediaWorkspace.tsx`; public gallery uses approved
derivatives, event filters, real dimensions, pagination and keyboard lightbox.
Gallery-only grants allow images, never private documents/audio/video. Folder
mutation still requires general Media permission because folders are shared.
See `../operations/MEDIA_OPERATIONS.md` for the current contract and evidence. Historical
implementation sequence below is retained as chronology, not a pending list.

2026-10-21: migration 073 is applied locally and must not be rewritten. It adds
team/revision/deletion/scan metadata, scoped safe inventory DTOs, current-session
folder CRUD, name collision checks, cycle/depth protection and conservative usage
checks. HTTP `/api/v1/admin/media` GET and `/folders` POST/PATCH/DELETE are wired.
Canonical SQL/concurrency, 308 unit tests and 12 real HTTP/database folder checks
pass. The old media/gallery screens are intentionally not replaced yet: private
uploads, metadata/bulk operations, public publication and their replacement UI
are still being implemented, not finished.

Next implementation sequence:

1. Private file metadata/star/tags/move/archive/restore/bulk mutations, current
   source/destination grants, revisions, retained usage references and audit.
2. One-object direct media upload intents in the existing private `media` bucket;
   use PRD limits (images20MiB, video250MiB, audio50MiB, docs/archives25MiB), bounded
   daily/reserved-byte quotas and a separate `media_upload_scan` job kind so an old
   Forms worker cannot claim these records during a rollout.
3. Media-specific MIME/signature/container validation and native ffprobe for
   audio/video; reuse safe image/document normalization where applicable. Local
   ffprobe is installed. The existing native ClamAV configuration already supports
   250MiB streams/files, 512MiB scan expansion, 10 archive levels and 1,000 files.
   No SVG/HTML. Keep all objects quarantined until a fenced clean commit.
4. Only after current media+explicit gallery-publish authorization, create bounded
   image derivatives in a server-generated public namespace inside the private
   bucket. Serve published images through the public media endpoint with strict
   MIME/nosniff, responsive widths and safe optional downloads. Private keys never
   appear in public DTOs; large private downloads use short-lived signed URLs.
5. Gallery event association/alt/caption/order/publication controls, revoke and
   retryable cleanup, private media replacement UI and public gallery lightbox.
6. Real signed PUT/ClamAV/scope/publication/download/revoke/usage/quota tests and
   browser/keyboard/mobile verification before declaring the module implemented.

The old public gallery metadata currently points to `/api/v1/media/public/:id`,
which has no completed secure asset handler yet. Do not route it directly to an
arbitrary stored file path. Private finance/blog/form attachments keep their own
buckets and authorization; general media must not become a bypass.

Existing file cleanup and upload workers use `upload_scan` by default and validate
only Forms/blog/finance content. Add a dedicated media scanner/worker contract,
restart only verified project workers after code changes, and test before running
any cleanup. No real image is published or real file removed during development.
