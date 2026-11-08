# Remaining table and mobile access review — 2026-11-07

CMS records, newsletter inventories, private form-link delivery, response
inventories, form-library inventories, media inventories, editorial records and
form answer grids now use the existing named keyboard-scrollable table component.
Each retains its original CSS class, native table and nested form controls.
A read-only JSX ancestry scan finds all 36 native tables under this shared wrapper.
This structural check supplements actual browser tests; it is not a manual
accessibility or full UI acceptance claim.

Populated private-link rows exposed an additional layout defect: the Form access
dialog's grid item used the table's minimum content width. The dialog clipped
its fields/actions on mobile, while the table region itself did not overflow.
A scoped minimum width of zero on the dialog's direct tab panel keeps the dialog
inside the viewport and allows the existing table viewport to scroll. The fix
does not hide overflowing controls or change global dialog styles.

The initial WebKit mobile run fails five cases: missing CMS/newsletter regions,
response keyboard scrolling, and the clipped private-link dialog. After the fix,
all 30 cases pass across six profiles, with 32 unapproved captures including the
two mobile lower-control views. Top and lower private-link captures were inspected.
The final four-table inventory check initially fails all four WebKit mobile cases
for missing regions or ineffective keyboard scrolling. After the correction,
all 24 cases pass across the six profiles. Native answer-grid radio Space and
ArrowRight behavior remains intact. The mobile grid and editorial captures were
inspected; their 24 captures remain unapproved. Twelve existing Settings/Logic
composition checks also pass after the scoped dialog correction.

The separate 78-case finance/content review was refreshed with a canonical pending
request submitted by a different fictional officer and matching pending count.
The earlier unsupported status label was a fixture error, not a production finance
state. Both original and corrected captures remain separate. These 78, 30, 24 and
12 case counts are separate invocations and source checkpoints, not one combined
full browser run. No financial decision, publication, invitation, response or
provider send occurs: all application writes are refused by these fixtures.

Local review indexes:

- `artifacts/browser/finance-content-current-review/index.html`
- `artifacts/browser/remaining-table-review/index.html`
- `artifacts/browser/inventory-keyboard-review/index.html`

Earlier primary, 44-state secondary, functional recovery and original finance
indexes remain intact. The current catalog contains 1,680 unique browser cases,
exactly partitioned into three disjoint shards of 560; this is list-only evidence.
The saved complete 1,548-case run remains prior-source evidence.

Latest types, targeted source tests, scoped lint, build and byte limits pass.
The latest rebuilt artifact passes 15 PWA boundaries, nine update checks and
46 configured HTTPS/header checks. Complete final source coverage passes all 2,722 tests in 222 files, with unchanged
global 70% and all 21 individual critical 90%-branch gates. Lines are 78.16%,
statements 76.17%, functions 70.77% and branches 75.63%. No competing browser,
build, type or performance process ran during that full invocation.

The full PRD remains incomplete. Mobile LCP, remaining applicable visual/manual
review, approved chapter content/assets and human fidelity approval, physical
devices/install/push, field/hardware performance, hosted operations/restore/rollback
and institutional sign-off remain open. All first-paint prototypes remain isolated
and unadopted. SSO/Google and Bevy/Engage remain deferred.
