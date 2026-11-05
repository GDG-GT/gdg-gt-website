# Own-profile mutation and session review recovery — November 5, 2026

Profile account/public-profile saves, password rotation and other-session sign-out
now share a synchronous pending guard and cancellable request scope. Inputs
freeze while a write is pending; duplicate submits cannot start another request.
Account/role/session replacement aborts and fences obsolete work. Offline drafts
stay in the open tab and reconnect never resends them. Success receipts appear
only after the server accepts the operation and focus a semantic status element.

A confirmed save followed by a failed account refresh remains a confirmed save:
the error describes the failed read and the next action retries only reads.
Network/5xx uncertainty pauses writes until explicit current account/session
reconciliation. The recovery read exposes timestamped saved values separately
from retained unsaved fields so the user can compare them before another manual
decision. Failed recovery keeps the pause. Denied operations clear private
fields/inventories and rehydrate only current account values after an explicit
access recheck. Passwords never enter saved-value snapshots or browser storage.

Signing out other sessions requires a review naming the account and consequences.
The current browser remains signed in; other devices must sign in again and can
lose unsaved work. A fresh inventory read blocks confirmation when session IDs
change. Pending review cannot close/escape; an uncertain revocation has its
read-only account/session recovery action inside the dialog. The action covers
all other sessions, including any beyond the displayed bounded inventory.
Cancellation performs no revocation; backend current-session/CSRF checks remain.

An incorrect current password previously returned a missing-session 401, causing
the client to discard a valid sign-in. After validating the actual current
session/CSRF, this one error now returns field validation (400). Anonymous,
expired and revoked sessions retain 401. Current/new/confirmation password errors
are associated with their respective inputs and clear on edits. Password change
still requires the actual current password and atomically rotates session/CSRF,
revokes other sessions and rejects the old cookie. The chapter bootstrap and
other existing accounts are not changed by the verification probes.

Fresh local checks:

- All 46 focused profile-read/mutation/auth route cases pass, including 18 new
  mutation/review cases and structural axe checks (contrast excluded in JSDOM).
- All 15 actual API/DB checks pass for one independent fictional actor: wrong
  current password preserves current/other sessions, own display/public-profile
  saves, unpublished new profile, reviewed other-session revocation, reuse
  rejection, password rotation/new-hash/old-cookie checks and final logout.
  Account disabled, unpublished profile archived and sessions revoked. Evidence:
  `phase0/local-profile-mutations.json`.
- All 18 actual desktop/mobile browser checks pass using an independent fictional actor and
  owned sessions. They verify display-name save, field-associated wrong-password
  feedback without sign-out, consequence review/cancel/confirmation, preservation
  of the current browser and one reviewed revocation. The uncertain-save case
  deliberately drops a response after the owned server save accepts it, then
  reconciles visible saved values without another PATCH. External origins,
  unrelated mutation paths and realtime enrollment are blocked/paused. Evidence:
  `phase0/local-profile-browser.json`; fixture cleanup is recorded there.
- All 1,242 tests/148 files pass in the sequential full run. All 17 critical-file
  90%-branch gates pass. Global coverage still fails 70%: lines 59.68%, branches
  58.60%, statements 58.14%, functions 50.57%. Thresholds remain unchanged.
  Types/lint pass (zero errors/25 inherited warnings).
- All 18 targeted production-build profile/Forms-library/guide browser checks
  pass across the six configured projects after the changes. This filtered run
  is recorded separately in `phase0/profile-workspace-browser.json`; it does not
  replace the earlier full 88-check invocation. Build, public/offline bundle
  budgets, traceability and secret scan pass.

No schema migration is needed; existing 111-migration clean/legacy-grant and
isolated restore evidence is retained. Full browser interruption/role changes,
assistive technology, physical devices/zoom, visual and hosted acceptance remain
open. This checkpoint does not close full PRD acceptance or the global coverage
gate. Traceability catalog: 144 unverified logical cases.
