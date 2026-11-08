# Published form image read recovery — November 6, 2026

The form field/header image picker now has independently cancellable current-page
reads, named loading and retry actions, retained successful same-page snapshots
and timestamps on transient failure. Stale or malformed lists cannot change the
selection. Different pages do not present old rows as current. Existing selected
IDs remain in the control with a generic label when absent from the current page;
a failed lookup never silently removes a selected image. Removing the local draft
selection remains possible during failure without a network mutation.

Form/field/account/role/session keys cancel obsolete reads and clear old child
state. Reconnect requires explicit recheck and does not make a selection or save
anything. Paging includes a first-page recovery action after later-page failure,
and Previous remains available when the inventory shrinks below the current page.
Empty, unavailable and malformed results are distinct. Only verified current-page
approved public photo identities and dimensions may be selected. Publication still
performs its existing current approved-media validation; this is no new grant.

Seventeen new client recovery cases and the three existing image contract/render
cases pass. Tests cover all these transitions, denial, malformed payloads, pending
obsolete results and removal without writes. The first production-browser matrix
passed ten cases and found two mobile hovered-button contrast failures (4.45:1).
The builder's existing mobile tool dialog now uses the same darker coral token as
the admin surface; public styles are unchanged. The initial failed report remains
retained. Current full-tree/browser verification is recorded in the main tracker.
No database migration, worker, provider send or real chapter change is involved.

Captures are unapproved review candidates. Actual public-media/scanner/storage
acceptance remains separate from these local image-picker read checks. Respondent
file/runtime recovery and full manual/device/visual/hosted PRD acceptance stay open.

All 18 final image-picker/builder browser cases pass across six profiles after the
contrast correction. Build/types/lint (zero errors/25 existing warnings), byte
budgets, secrets and traceability pass. All 20 image-specific client/schema/render
cases and the builder read/scope regressions pass. The preceding full-tree
coverage checkpoint remains recorded separately; no new full-suite result is
implied by these focused checks.
