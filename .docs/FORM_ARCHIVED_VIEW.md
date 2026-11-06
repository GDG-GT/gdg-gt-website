# Archived Forms inspection — November 6, 2026

The saved form's archived status now independently disables draft editing,
autosave and publication even when the user's raw grants still include edit and
publish. Controls explain how to restore a private draft from the Forms library.
Fields/settings, immutable published history and unchanged saved preview remain
available to authorized readers. Preview cannot submit responses.

An archive discovered while a local proposal is retained pauses that proposal
without discarding it. Loading the saved archived draft requires explicit review;
resuming autosave is unavailable. Preview cannot implicitly save an unwritable
proposal. Action-time checks also protect synthetic activation and a publication
already waiting on a save. Independent access/privacy operations retain their
separate capabilities; this correction only gates draft/publication actions.

All 54 focused cases in the editor-permission, builder-read-scope and form-data
suites pass, including three new archived-state regressions. All 16 actual
loopback API/DB/Chromium desktop/mobile checks pass:
`phase0/local-form-archived-view-recovery.json`. Raw grants remain present;
measured populated axe passes, history is readable and real saved preview can
advance through required fictional answers to a disabled final submit control.
Source/draft/version/availability remain unchanged and no response is created.
Desktop/mobile captures were inspected and remain unapproved review candidates.

The live probe initially used an overly exact wrapped-select accessible label,
then incorrectly expected the final submit before the configured review step.
Both failed probes cleaned up their fixtures. The corrected probe follows the
actual required-question/review flow; no product timeout or threshold was relaxed.
Two fresh fictional internal forms were published once and archived before the
successful run. Browser mutations and external requests were blocked; actors were
disabled and sessions revoked. No worker/provider send, existing chapter or
production change occurred.

Remaining Forms child/access/settings/deletion, response/integration/runtime
recovery and complete role/device/manual/visual/hosted acceptance remain open.
No full Forms or website PRD acceptance is claimed.

Production build, strict types, lint (zero errors/25 existing warnings), byte
budgets, secret scan and traceability pass. All 54 archived/shared-workspace
production-browser cases pass across six profiles:
`phase0/form-archived-workspace-browser.json`. The first browser probe matched
both the mobile dialog and hidden desktop inspector; scoping to the visible
dialog corrected the selector, without changing product behavior or timeouts.

All 1,684 tests/173 files pass. Global coverage still fails 70%: 65.79% lines,
65.52% branches, 63.94% statements and 56.85% functions. All 17 critical branch
gates pass; no timeout or threshold changed. Catalog remains 159 unverified cases.
