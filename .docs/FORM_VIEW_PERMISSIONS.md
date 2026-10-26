# Forms definition inspection and creation permissions (local)

The definition route now resolves the existing `view` action. Previously the
route guard required `edit`, so a view-only collaborator could discover a form
but could not open its definition workspace. This does not imply that a viewer
could edit persisted content: mutation APIs retain separate server authorization.

The builder disables title, description, section, field, logic and settings
changes for viewers, including drag handlers and programmatically dispatched
change events. Inspection, settings tabs, version history and preview remain
available. Access management remains independently authorized rather than being
disabled merely because draft editing is absent. Mobile copy describes inspection.
Question arrows now reorder within the displayed section even when the backing
array interleaves sections. Dragging between sections clones the moved question
before recording history, so Undo restores its original section.

Forward migration 109 adds creation and destination-specific duplication
capabilities to the existing authorized inventory RPC. Create and templates use
the returned create grant; duplication uses the source form's destination scope,
independently from its edit action. Restricted response counts stay null through
API projection, render without a response link, and do not appear as zero in an
entirely restricted page's response statistic. Response actions retain their own
grant. Library writes freeze synchronously and ignore navigation/refresh/error
callbacks after unmount. An exact database `FORBIDDEN` exception now maps to 403
instead of an apparent temporary outage; unexpected database errors stay generic.

Eleven new DOM interaction cases, two route cases and an extended error-mapping
case cover the changes. All 852 tests/124 files pass. Strict types pass; lint is
0 errors/25 existing warnings. Global coverage remains below 70% at 36.79% lines,
34.79% branches; all 17 individual critical-file branch gates pass. Both fresh
and legacy-default-grant database suites pass through migration 109, including
both 100-client capacity races. Six isolated backup/restore assertions pass.

`node scripts/test-local-form-viewing.mjs` passes eleven actual loopback HTTP/
database checks using two isolated fictional accounts. It verifies definition
and navigation access, restricted counts, denied edits/publish/response reads/
access management/duplication, concealed unknown forms and unchanged revision/
state. Only its own forms are archived and fictional accounts disabled. The
optional interactive `--hold-for-browser` mode keeps credentials in an ignored
mode-0600 ledger, removed on completion. Failed attempts were also cleaned; one
hit a development file-watch restart and another exposed the corrected error
mapping. A test-body validation error was fixed before asserting authorization.

Live Chrome verifies the view-only library and definition workspace, settings
inspection and disabled controls. At 375 px the settings dialog is within the
viewport, scrollable and has disabled inputs; document width remains 375 px.
The captured raster was inconsistent with the viewport, so no screenshot is
accepted as visual proof. The viewport was reset and browser account signed out;
private fixture credentials were cleared. No real recipient/provider send or
deployment. Evidence is `phase0/local-form-viewing.json` and
`phase0/form-viewing-browser-observations.json`.

The acceptance catalog now has 121 unverified logical cases. Full supported-
device, screen-reader, visual, staging and PRD acceptance remain open.
