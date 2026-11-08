# Private Projects implementation and verification

PRD: PROJ-001–005 and §24.1. Projects remain internal in this release.
`/projects` renders the normal branded 404; no public project API exists.

## Access and mutation policy

`/admin/projects` uses opaque-session server APIs, not browser table reads/writes.
Admin/Super Admin accounts manage chapter scope and active teams. Ordinary Team
Members require current active-team membership, `/admin/projects` page access and
the explicit `projects` CRUD action. Blog Editors have no access. Lists, counts,
statistics, details and participant history all follow current scope. Global
administrators retain read-only history for inactive teams.

Creation fixes ownership scope and derives the creator from the session. Edits
preserve title, long/short plain-text description, image/repository/demo URLs,
technology arrays, tags, category, project status, difficulty, planned team size,
dates, open-source and internal featured flags. Featured never means published.
URLs are public HTTPS without credentials/private token parameters, or an approved
local image asset. Dates must be real calendar dates in chronological order.

Mutations require CSRF and an idempotency key. The aggregate project revision
fences both record and participant changes. Account/team authorization is checked
again inside the transaction; idempotent replays cannot bypass a revoked action.
Archive/restore require the current password and exact title. Projects and their
participant history cannot be hard-deleted through the application. Financial
references, private star records and legacy counters are preserved.

## Participants and stars

An authorized project editor can add/update an existing active community member
by exact normalized email. Only an unambiguous match is accepted: duplicate
community records need review rather than automatic merging. There is no member
directory enumeration through Projects, and participant DTOs omit email, phone and
academic fields. A project role never changes account/team access and does not
send an invitation. Removal deactivates the retained membership; rejoining reuses
the same record. Current participants are capped at 100; history is paginated.

Retained star rows remain private, including voter identifiers. The actual row
count is returned separately as a decimal string; the legacy cached counter is
preserved and labeled separately. This release provides no public voting endpoint
and does not silently reconcile or destroy either source of history.

## Editor and verification

Editors use shared unsaved-work protection. An independent revision change
preserves input but disables stale saving. Private reads and async mutation results
are fenced against a session-clear event; draft bodies/passwords are not stored
in browser storage. Filters and category/status/technology statistics are scoped.

Verification: 56 canonical migrations, the complete SQL suite including both
100-client registration/Forms capacity regressions, 217 unit tests, TypeScript,
`lint:ui`, scoped lint and production build pass. The actual loopback integration
contains 28 checks in `.docs/phase0/local-projects-integration.json`, including an
independent mutation during browser review. `npm run test:local-projects` creates
isolated fictional fixtures. `-- --hold-for-browser` accepts `change` or `done`.
No external links, real invitations or messages are sent. Exact project/team/
account fixtures are recoverably archived and the fictional community participant
is deactivated; private member/star history is retained. No quota/job reset occurs.

Browser checks cover actual edit/save, 375 px editor/document fit (339/375 px),
1440 px desktop, stale input retention and disabled save, discard confirmation,
432 px native wheel scrolling and public branded 404. Evidence is in
`.docs/ui-review/real-projects-*.png`. Temporary viewport overrides were reset.
Comprehensive accessibility, multibrowser/load and hosted acceptance are still
required; this is not complete-PRD certification.
