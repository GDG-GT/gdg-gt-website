# Public event inventory and interaction recovery

Implemented locally on 2026-10-26 against PRD 22.3, 22.4 and 28.3. This is
implementation evidence, not complete event lifecycle or launch acceptance.

Migration 106 adds `public_event_inventory`, an explicit published projection
with security-invoker/security-barrier options and SELECT granted only to the
service role. Active internal attendance and nonnegative recorded external
attendance determine capacity; removed attendance is ignored. No participant
identity, private author/team or external counter columns are exposed. The API
sorts open/full/closed/ended priority, start date and stable ID before range
pagination. It replaces the previous per-event count and private-counter reads.
Anonymous and authenticated database roles receive no view grant.

Cards display short descriptions, current server registration state and the
event's own timezone, including year and timezone abbreviation. Independent
status/type controls combine with search, level, sort and pagination in shared
URLs. Old `filter=workshop` and `filter=past` links remain readable; subsequent
control changes canonicalize them without losing their selection. Reset restores
upcoming/soonest defaults. Invalid page/status/sort values recover safely, and
aborted inventory requests cannot replace a newer result.

Registration captures the body before disabling all controls, blocks duplicate
submits and preserves the same idempotency key for unchanged retry bodies.
Server field errors are associated with inputs and focus the first invalid
control. Other failures focus feedback; committed success focuses confirmation.
Last-seat rejection changes the view to full and offers other events. Changing
the slug resets drafts, confirmation, pending reference and errors; old reads
and writes cannot confirm or unfreeze another event. Detail read failures have
a retry action that retains focus on the main landmark. Safe image fallback is
shared with the public inventory.

Verification: 22 DOM cases plus seven public-collection server cases pass;
all 689 tests/113 files pass. Strict types pass; lint is 0 errors/25 warnings.
Global coverage remains below the required 70% at 30.54% lines/29.04% branches;
all 17 critical-file branch gates pass. Ten actual inventory HTTP/database checks
pass, as do the 21 existing event checks, clean and legacy database suites through
106 and both 100-client capacity races. Six isolated backup/restore checks now
fingerprint view definitions, options and grants as well as tables/functions.
See `phase0/local-event-inventory.json`, `phase0/local-events-integration.json`,
`phase0/canonical-tests.json`, `phase0/canonical-tests-legacy-grants.json` and
`phase0/local-backup-restore.json`.

The native Chrome screenshot `ui-review/events-inventory-controls.png` uses
explicitly fictional records and illustrative photography. Browser verification
combined Past + Workshop and showed only the ended fixture. Temporary fixtures
are archived after review; this does not approve official copy, imagery, visual
baselines, screen-reader behavior, hosted cache freshness or supported devices.

Migration 106 has already been applied locally and must remain immutable. A
rollback must first restore an application version that reads the base table;
any later view removal must use a new forward migration. Do not edit applied
SQL or remove unrelated data. Cancellation/rescheduling metadata and complete
public/admin lifecycle acceptance still require the remaining PRD audit.
