# Site availability and maintenance

PRD: STATUS-001–003, §22.13, §23 and §24.1.

## Operator controls

`/admin/site-status` reads protected configuration and applies PATCH changes.
Admin/Super Admin accounts can operate it. An ordinary Team Member needs current
active-team membership, `/admin/site-status` page access and the explicit
`site_status` CRUD read/update grant. A read grant alone does not allow updates.
This is a site-wide setting even when granted through a team; the editor says so.
Blog Editors have no access. Membership/action revocation is rechecked server-side.

Changes require an opaque session, CSRF, current password, exact `LIVE` or
`MAINTENANCE` text matching the selected mode, a revision and an idempotency key.
The transaction rechecks the password hash, live session and current action grant.
Audit metadata contains state/revision flags, not credentials or message contents.
Concurrent/stale changes cannot silently overwrite one another. The editor keeps
unsaved input when the revision changes and disables stale saving. Its draft and
password are not stored in browser storage; session clearing fences async results.

The canonical migration seeds no operational record. An unconfigured installation
has a virtual live default; its first authenticated change atomically creates the
single configuration row. Prepared copies of the unapplied migration were kept as
recoverable review backups after SQL validation; applied migrations were not edited.

## Destinations and routing

An optional destination is either `/l/:username` or HTTPS at exactly `gatech.edu`,
`www.gatech.edu` or `gdg.community.dev`, without credentials, ports, queries or
fragments. Other hosts, internal route loops and protocol-relative URLs are
rejected. Local destinations must resolve to an active published Linktree.
Automatic routing is limited to a local Linktree; off-site destinations are
explicit visitor-selected links, never automatic external redirects. If a local
destination becomes inactive, public reads suppress it and fall back to maintenance.

Public routing polls the safe status every 30 seconds and on focus/reconnection.
Ordinary public routes move to `/maintenance` or the configured active local
Linktree. The existing unsaved-work router guard can block a transition so the
application does not silently discard entered answers. The maintenance route does
not redirect itself. Admin paths, Linktree, offline/privacy/accessibility,
newsletter token actions, account setup and invitation routes remain reachable.
The normal footer gate and login flow also remain available.

Maintenance is a visitor-routing/availability feature, not an authorization
boundary or a blanket API shutdown. Existing public APIs retain their normal
validation, rate limits and access rules; an already-started safe workflow is not
made private by maintenance. Protected routes always require their normal access.
`GET /api/v1/health` is credential-free **liveness only**, not a database readiness
certification. `GET /api/v1/site-status` returns only revalidated safe public fields
with no-store headers; it never returns operator identity or private permissions.

## Offline and preview behavior

The provider optionally retains only the validated **public** status snapshot and
timestamp in `gdg:public-availability:v1`, for at most 30 days. No account, token,
password, form answer or private configuration metadata enters it. Storage errors
are harmless. A five-second status timeout avoids an endless initial loader.
Failed refreshes keep the last available public snapshot and show an offline
notice. If none exists, public rendering falls back without bypassing any protected
authorization. A fresh offline installation still needs the separate PWA shell/
asset implementation; full offline/reload support is not claimed here.

The admin preview does not save changes or open the destination. Obsolete legacy
status manager and PSU testing/global-window utility were removed; they remain
recoverable in Git history. Public development privacy copy now accurately states
that submissions may persist in this installation's database/private file storage.
A production privacy notice/institutional approval remains a launch requirement.

## Verification

57 canonical migrations and all SQL/100-client capacity regressions pass. Unit
suite: 227 tests. TypeScript, UI/scoped lint and production build pass; existing
bundle/Browserslist warnings remain. `npm run test:local-site-status` records 21
actual local HTTP checks in `../phase0/local-site-status-integration.json`. Its
`-- --hold-for-browser` mode accepts `auto`, `hide` and `done`. The original
availability is restored with revision fencing; an unrelated concurrent change
causes a refusal to overwrite it. Fictional operator accounts/team/Linktree are
recoverably archived. No quota or scheduled-job history is reset.

Browser review verifies maintenance routing, active local automatic routing,
deactivated-destination fallback, privacy access, preserved stale editor input,
disabled stale saving and discard confirmation. At 375 px, both the document and
339 px editor fit. After restoring the exact original live configuration, an
actual password/typed-confirmed UI save retained those unchanged live values.
Proofs: `../ui-review/real-maintenance-*.png`. Temporary viewports were reset and only
the clean local workspace was left open. No external destination/provider was
loaded and no real email was sent. Full multibrowser, accessibility, hosted and
offline/PWA acceptance remain open; this is not complete-PRD certification.
