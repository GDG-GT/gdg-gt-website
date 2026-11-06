# Independent response-workspace reads — November 6, 2026

Responses, summary, saved views and hold status now own independent private
loading, failure, timestamped matching snapshots and focused explicit retries.
An initial failed read no longer looks empty. Temporary saved-view failures keep
both options and a proposed new name; response and summary failures retain their
matching results while relevant actions pause. A failed/loading hold check cannot
justify deletion/redaction from its previous false value. Current form/readiness
also gates archived availability changes, private attachments and export controls.

Response children are not loaded without the current response-review capability.
Saved-definition denial, response-capability revocation or any child read denial
clears the response workspace, proposed preferences,
selected IDs, columns and private URL filters, staying blocked until explicit
access recheck. Clearing filters cannot start an automatic denial retry loop.
Selection resolves from the current matching inventory rather than an old row
object; changed queries/tabs hide selected answers and cancel obsolete reads.
Existing account/role/session/form root remounts remain in force. Reconnection
requires explicit rechecking of the active response view before actions resume.
The response table now has a named keyboard-focusable horizontal scroll region;
per-read feedback uses existing neutral surfaces and secondary-text tokens.

All 99 focused cases across four files pass, including 17 new workspace-read
regressions. Existing date/DST/filter/keyboard regressions still pass; their mock
form now actually grants the response-review capability those tests exercise.
The explicit Open-response accessible name removes JSDOM's concatenation of
visible/visually-hidden text while preserving the browser's intended label.

All 24 actual loopback API/DB/Chromium desktop/mobile cases pass:
`phase0/local-form-response-read-recovery.json`. They verify initial failure,
independent retry, retained inventory/options/proposals/summary, paused actions,
failed-hold destructive safeguards, denial clearing, measured populated axe and
unchanged response/version/view/job counts. Two fresh fictional internal forms
have one intended response/edit and one saved preference each. Browser mutations
and external requests are blocked. Metadata notification jobs are disabled and
secret payloads cleared; forms archived, actors disabled and sessions revoked.
No worker/provider send, existing chapter or production change occurred.

The first live probe accidentally intercepted the page route as well as its API
route and displayed JSON. Its fixtures/jobs were cleaned; restricting fault
injection to API requests corrects the harness. No product timeout or threshold
was relaxed. Captures remain unapproved review candidates.

Response availability/destructive/saved-view mutation atomicity and uncertain-
outcome recovery, complete export recovery and proposal/navigation workflows
remain open. Forms access/settings/deletion/integrations/runtime and full role/
device/manual/visual/storage/hosted acceptance also remain open. This read
checkpoint does not certify complete response workspace, Forms or website PRD
acceptance.

All 72 response-read/history/attachment/shared-workspace production-browser cases
pass across six profiles (`phase0/form-response-read-workspace-browser.json`).
All six final read cases pass again after adding saved-definition denial and
response-capability revocation (`phase0/form-response-read-final-browser.json`).
The populated mobile paused view was inspected. Build/types/lint (zero errors/
25 existing warnings), byte budgets, secret scan and traceability pass. These
captures are not human visual sign-off, real-device or hosted acceptance.

All 1,761 tests/176 files pass. Overall coverage still fails 70%: 66.36% lines,
66.21% branches, 64.59% statements and 57.74% functions. All 17 critical branch
gates pass. No timeout/threshold changed; catalog stays 159 unverified cases.
