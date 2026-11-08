# Event rescheduling and registration routes

Implemented locally on 2026-10-26. Migration 107 adds a server-derived
`previous_start_at` to events and the existing service-only published inventory.
A trigger records the prior start when a currently or previously published event
changes date. Initial draft edits are not reschedules; unrelated edits cannot
erase history; duplicated records start without copied history. Mutations now
return the committed row after triggers run. Clients cannot submit this column.
Past changes made before this migration are not fabricated or backfilled.

The detail page shows the stored previous date in the configured current event
timezone and an explicit end date/time. Raw HTML and client JSON-LD use
`EventRescheduled` plus `previousStartDate` when history exists. Calendar downloads
retain the stable UID, new UTC dates and current revision sequence, with explicit
CONFIRMED/CANCELLED status. Cancelled, archived and draft records remain private
under PRD 22.3/26.2's published-only rule. Their public API/raw HTML returns 404;
cancelled raw documents do not contain misleading EventScheduled metadata.
No public cancellation notice or cancellation-mail automation is invented here.

Both-mode events offer the configured external organizer route and the internal
form. External-only events without a safe destination remain closed. Event
website actions signal a new tab and use isolated safe links. Share copies the
canonical event slug without visitor query parameters or fragments.

Verification: 695 tests/113 files pass, including six additional DOM/server cases.
Strict types pass; lint is 0 errors/25 warnings. Global unit coverage remains below
70%, at 30.56% lines/29.20% branches; all 17 critical branch gates pass. Clean and
legacy-grant database suites pass through migration 107, as do both 100-client
capacity races and six isolated backup/restore checks. The actual event suite now
passes 30 HTTP/database/document checks with exact fictional fixtures archived
afterward. Local mail capture only; no provider delivery enabled.

Native Chrome evidence is `../ui-review/event-reschedule-details.png`, using a
fictional record and illustrative fallback photograph. Browser inspection also
confirmed both registration routes and a scrollable 375px layout without
horizontal overflow. This is not approved imagery, visual baseline acceptance,
screen-reader testing, calendar-client compatibility or hosted crawler approval.

Migration 107 is applied locally and immutable. Older application code may ignore
the additive column while retaining the trigger/history. Any schema/function
rollback must use a separately reviewed forward migration and preserve recorded
history; never edit applied SQL or destroy unrelated records.
