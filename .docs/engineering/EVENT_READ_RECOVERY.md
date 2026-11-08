# Private Events read recovery — November 5, 2026

The event inventory, selected event and registration inventory now load
independently. Each has a loading state, explicit read-only retry and a timestamp
for retained data after a temporary failure. Failed reads no longer look like an
empty registration list. Denied reads clear all private event/attendee state.
Account, role and session replacement cancel old transport and reset inputs;
changing pages or selected events hides the previous keyed snapshot immediately.

Selected events are read again before editing. A newer saved revision preserves
unsaved fields, blocks writes and offers an explicit review before replacing the
draft with saved values. Offline input remains in the tab; reconnect sends no
write. Failed or pending attendee reads disable editing, export and mail actions.
Authorized tables use named keyboard-scrollable regions. Page-local search has a
truthful label and a reset action for filtered empty results.

Eighteen new DOM cases cover independent failure/retry, timestamps, revision
review, denied reads, context replacement, cancellation, offline behavior and
filtered empty states. All 44 focused Events cases pass. The actual local probe
passes all 19 API/DB and desktop/mobile browser checks, including controlled 503
responses, draft preservation and independent attendee recovery. The private
fixture stayed unpublished with its original title/revision; its event and
registration were archived/soft-deleted, both fictional accounts disabled and
their sessions revoked. No existing chapter record or provider was changed.
Evidence: `../phase0/local-event-read-recovery.json`.

All 1,260 tests/149 files pass. Overall coverage remains below 70%: 60.22%
lines, 59.31% branches, 58.66% statements and 51.28% functions. All 17 configured
critical-file branch gates pass. The catalog contains 145 unverified cases.
Types/lint (zero errors/25 warnings), build, byte budgets and secret scan pass.
All 24 targeted production-build workspace browser checks pass across the six
pinned Chromium/Firefox/WebKit profiles, including the Events empty inventory.
Separate evidence: `../phase0/event-read-workspace-browser.json`. Screenshots remain
unapproved review candidates; the live populated outage probe is Chromium only.

This checkpoint covers reads. Event mutation replay, synchronous write guards,
uncertain-write recovery, permission-aware actions, consequence reviews and
attendee input/navigation handling remain separate implementation work. Broader
populated browser/role/device/manual/visual and hosted acceptance remain open.
