# Private editorial submissions and files

Blog files use the same private object store, real ClamAV scanner and bounded
normalization worker as Forms/Finance. Supported declarations: PDF, non-macro
DOCX, UTF-8 text, PNG, JPEG and WebP, up to 20 MiB each. Each account is limited
to five unexpired pending files, 25 intents and 250 MiB per 24 hours. Upload
metadata cannot choose the owner, submitter identity, object path or publication.
The current session supplies identity; editorial creation permission supplies scope.

An idempotent intent creates a private pending submission and signs a single
random quarantine key for two minutes. Completion is session/owner-bound, checks
the actual object metadata, rechecks current access/revision and queues one scan.
The worker recomputes checksum, scans bytes, validates actual content type and
normalizes images without their private metadata. Its final transaction repeats
account/session/team/creation/read authority, record revision and archive checks
before promoting to an immutable clean destination. Changes during scanning reject
promotion, and a normalized object is discarded when the final lease/access fence
fails. Existing Forms/Finance scan logic remains in the restricted delegated
function; no browser may execute either worker path.

Authorized current readers can request an audited 60-second attachment download.
Private storage paths, signatures and checksums never enter inventory/detail DTOs
or audit metadata; only the ephemeral download response contains a signed URL.
The UI retains it only in memory, clears it on navigation/session clear and hides
it before expiry. An already issued link can remain valid for its bounded lifetime;
revocation blocks issuing another, not bytes already downloaded.

Unverified legacy submission paths remain inaccessible. They must be imported
through scanning before a URL can be issued; merely setting review status to
approved does not certify a file. Archive retains clean evidence, comments and
metadata rather than deleting it. Bounded cleanup selects only expired/rejected/
abandoned non-clean Blog quarantine, skips active leases and never selects clean
retained files. Full storage-inventory reconciliation after worker crashes,
hosted bucket/CORS/scanner verification and broader privacy-retention acceptance
remain operational gates.

Verification: **62 migrations**, complete SQL suite/capacity regressions and
**261 unit tests** pass. **23 actual Blog upload HTTP checks** are recorded in
phase0/local-blog-uploads-integration.json. Synthetic images and the harmless
standard antivirus test string verify real signing, ClamAV, metadata stripping,
checksum/MIME rejection, public-bucket denial, ownership, short-lived download,
idempotency and uploader revocation. SQL additionally fences revoked-session
promotion, cross-session completion, cleanup selection and immutable clean bytes.
Exact fictional submissions/accounts are recoverably archived; clean evidence is
retained. No real person/user file, external provider or mail was used.

Shared-scanner regressions pass **36 Forms** and **22 Finance** actual checks.
A pre-existing Forms test raced the active background worker by asserting only
the foreground batch counter; inspection showed the fixture already clean and
its job completed. It now waits for each exact owned file's terminal outcome.
The live regression also no longer claims/releases unrelated mail jobs merely
to inspect worker isolation; that behavioral isolation is covered by isolated
canonical SQL, while the live check reads its exact scanner-job kind.

Browser proof: ui-review/real-blog-private-download.png shows actual authorization
for a clean synthetic file (signature never printed); leaving the record clears
the link. real-blog-files-mobile.png shows the 375 px document/339 px upload form.
Temporary viewport reset and tab cleanup passed. The native browser file-picker
handoff remains unverified due to the extension's previously reported local-file
permission restriction; actual signed HTTP upload/scan/download is verified.
Do not weaken extension permissions or present this as a complete browser-picker,
multibrowser/a11y/load/hosted or full-PRD acceptance pass.
