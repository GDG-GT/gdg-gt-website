# Events writes and reviewed recovery — November 5, 2026

Forward migration 112 adds atomic actor-bound retry receipts for event create,
update, duplicate, publication/lifecycle and attendee update/removal. Every
attempt, including a replay, rechecks the current account/session and current
resource/action grants. Destination team moves also require current read/create
access. Moved duplicate results are concealed after lost access. The wrapper and
capability projection explicitly revoke browser execution and grant only the
service role; no automatic Supabase grants are assumed.

The private API projects current create destinations and per-event action,
export and email permissions. Create defaults to an eligible team when chapter
creation is unavailable. Archived teams remain inspectable by administrators,
while their writes and member access close. These UI affordances do not replace
server authorization. Attendee writes now require the exact `updatedAt` value
from their saved read; stale updates/removal conflict rather than overwrite newer
data. Both the active client and local Events regression caller use this contract.

The editor uses scoped cancellable mutations and a synchronous pending latch.
Inputs freeze while a write is pending; stale/unmounted/account/session receipts
cannot update a replacement view. Denial clears private drafts, inventories,
review intent and validation. Temporary/ambiguous writes preserve their exact
original request and retry identity. Explicit read-only recovery precedes an
explicit identical replay; reconnect never resubmits a write. A 47-hour client
cutoff prevents replay after the server's 48-hour receipt retention window.
Leaving unconfirmed recovery requires reviewing that the original operation may
already have completed before discarding its input/key and inspecting saved data.

Publication, unpublication, duplication, cancellation, archive and registration
removal have named consequence reviews. Cancellation/archive require the event
slug. Current revision/access changes invalidate a review. Saving an already
published event explicitly reviews its immediate public consequence. Pending
reviews resist Escape/outside closing. Field errors are associated with the
event or exact edited registration.

Attendee notes no longer write on blur. Controlled edits participate in the
navigation guard and survive transient reads. Check-in/removal cannot silently
discard edits. Newer registration timestamps retain the old input and require
explicit discard before using fresh values. An open event-mail draft remains
mounted but paused during parent read/offline recovery; the actual mail form
refuses a disabled/offline submit instead of losing its message.

Local evidence includes 59 focused DOM/route cases (41 new cases), all 112
migrations and complete SQL suites under both grant configurations (199/200
checks), both 100-client registration/Form races, six isolated backup/restore
checks and 39 actual loopback API/DB/browser checks. The latter include ten
simultaneous identical creates and ten duplicates, plus accepted-but-dropped
event/attendee saves at desktop/mobile with identical replay and exactly one
revision/audit. Measured axe checks pass on populated editor/review/attendee
states. All fixtures were private, archived/soft-deleted and their fictional
accounts disabled/sessions revoked. No real provider send or existing record
change occurred. Evidence: `phase0/local-event-mutation-recovery.json`.

All 1,301 tests/152 files pass on the final instrumented rerun. The first full
run exposed a denial-recheck cleanup race; it was fixed without relaxing a test
timeout or coverage threshold. Overall coverage remains below 70%: 61.03% lines,
60.24% branches, 59.40% statements and 51.98% functions. All 17 individual critical
branch gates pass. The catalog contains 146 unverified logical cases.
Types/lint (zero errors/25 warnings), build/budgets/secrets pass. The complete
production-build browser matrix passes 94 applicable checks with eight expected
profile skips (`phase0/browser-smoke.json`). This is separate from the populated
Chromium loopback probe and does not approve initial visual baselines.

This does not close the full Events PRD. Complete event-mail denial/uncertain
review recovery, broader supported-browser/role/lifecycle/negative states,
manual assistive-technology/zoom/device review, approved visual baselines,
performance and hosted delivery/operation acceptance remain open. Screenshots
are review candidates, not approved baselines.
