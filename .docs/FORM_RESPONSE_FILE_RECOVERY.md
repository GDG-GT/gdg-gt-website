# Private response attachment authorization — November 6, 2026

Private attachment controls now authorize a short-lived link and wait for the
reviewer's explicit download activation. They no longer open a file as a side
effect of a delayed API response. Account/role/form/response/file-list/permission
changes remount the private scope; sign-in invalidation and offline transitions
cancel requests and clear links. Reconnection never authorizes or downloads by
itself. Synchronous pending guards prevent duplicate or parallel authorization.

The current immutable field's sensitive capability is passed from the response
view, and the existing server independently checks exact form/response/file,
clean scan state, deletion/redaction and current sensitive permission before
signing. No storage/server permission change is made by this UI checkpoint.
Links validate their URL scheme/credentials and server TTL, expire conservatively
from request start (at most 55 seconds), and recheck time/connectivity on click.
Malformed, late or expired authorization cannot produce an active link. A denial
clears any previous link; explicit authorization rechecks current access. A 401
blocks the stale session. New-tab downloads use noopener/noreferrer/no-referrer;
no link enters persistent storage. Already downloaded copies cannot be recalled.

Explicit authorization results/errors receive focus. Background expiry or offline
announcements do not pull keyboard focus away from the current control.

All 95 focused tests across four files pass: 36 new attachment client regressions,
24 history regressions, 22 existing Forms data checks and 13 existing upload route
checks. They cover ready/in-flight scope replacement, session cancellation,
offline/reconnect, denied and transient retries, safe/malformed links, conservative
expiry, delayed activation, client-clock rollback and focus preservation. The
server suite checks exact-version sensitive permissions and private signing/audit.

Production-browser evidence is recorded separately. These UI fixtures do not
certify a new actual storage download, malware scan, real device or hosted CORS
run. No actual file was opened or downloaded by these browser checks, and no
provider send, worker, publication, response or production operation was needed.

Remaining response inventory/summary/views/exports/mutations, Forms access/
settings/deletion/integrations/runtime and complete supported-role/device/manual/
visual/storage/hosted acceptance remain open. This checkpoint does not certify
complete Forms or website PRD acceptance.

All 66 attachment/history/shared-workspace production-browser cases pass across
six profiles (`phase0/form-response-file-workspace-browser.json`). Both expiry/
denial and late-response-after-close are covered in every profile; measured axe
and zero unexpected writes/requests/script errors pass. The mobile authorized
state was inspected. Build/types/lint (zero errors/25 existing warnings), public
byte budgets, secret scan and traceability pass. No golden/device/hosted approval
is implied by the captures.

All 1,744 tests/175 files pass. Overall coverage still fails 70%: 66.19% lines,
65.93% branches, 64.42% statements and 57.42% functions. All 17 critical branch
gates pass. No timeout/threshold changed; catalog stays 159 unverified cases.
