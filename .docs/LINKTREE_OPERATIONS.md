# Linktree implementation and local verification

PRD: LINK-001–004, §7.11, §22.10 and the private workspace contract.

## Management and publication

`/admin/linktree` manages profiles and ordered links; `/l/:username` is public.
Global administrators manage chapter/team scope. Ordinary accounts require a
current active-team membership, the page grant and explicit Linktree actions.
Publish is separate from CRUD. Blog Editors have no access. Revocation is checked
on each request; the editor polls current capabilities and revisions.

Creating a profile/link never publishes it. Activation is explicit. Live edits,
live reordering and state changes require password/typed confirmation. The parent
revision fences all profile/link mutations. A stale editor preserves input but
cannot save over a newer revision. Transient navigation protection includes these
editors and pending confirmations; passwords are not persisted in browser storage.

Profiles and links are recoverably archived, not permanently deleted. Restoring
either leaves it inactive. Team archival automatically unpublishes profiles and
increments revisions; team restoration does not reactivate them. Former usernames
remain reserved against takeover; there is no automatic old-URL redirect.

## Public data and approved embeds

Public reads require an active, unarchived profile in active scope and serialize
only active, unarchived links in display order. Inactive and unknown URLs share
the branded not-found contract. Public JSON is no-store. Images/backgrounds are
structured validated values, never arbitrary CSS/HTML. Public links require HTTPS
or an approved first-party destination; credentials, private-token parameters,
local network names/addresses and executable schemes are rejected.

Google Forms and YouTube are the only embeds. Full provider URLs are canonicalized
server-side to Google Forms viewform or youtube-nocookie.com. Short Google Forms
links are ordinary external links, not resolved/fetched by the server. No iframe
loads before explicit visitor opt-in. Provider privacy text and a normal link are
available. Google Forms conservatively warns about leaving a loaded cross-origin
form because the application cannot inspect its answer state. External embeds
are not the native chapter Forms implementation.

Hosted CSP permits frames only from docs.google.com and
www.youtube-nocookie.com. Local tests did not load either external service and do
not establish their availability, hosted CSP behavior or full keyboard behavior.

## Analytics and limits

Tracking POST bodies are empty objects; target identity comes from the route.
The active target is rechecked during the atomic increment. Counters cannot be
set by visitors. Risk quotas allow 60 actions per 15 minutes and one action per
target/minute. Only rate-limit windows use day-bound hashed network keys.
Analytics store one aggregate per UTC day/target, with raw visitor metadata
constrained to NULL. Reports cover 7/30/90 days. Counts do not identify unique
people and should not be presented as unique reach. Public click counts are an
explicit per-link preference, disabled by default.

Lists are paginated at 30 records and profiles allow 100 current links. Account,
team and permission checks apply to details, totals, analytics and mutations.
There is no Linktree Realtime table publication or browser database grant.

## Verification

The later read/mutation recovery pass is documented in `LINKTREE_READ_RECOVERY.md`.
Interactive fixtures use an ignored mode-0600 `local-linktree-review.local` ledger,
removed on completion; credentials are never printed by the test script.

`npm test`, `npm run typecheck`, `npm run lint:ui`, `npm run build`, and the full
canonical SQL suite cover validation, authorization, transitions and regressions.
`npm run test:local-linktree` runs actual loopback HTTP checks with fictional
accounts/team/profile/links. `-- --hold-for-browser` pauses before lifecycle
checks for visual review; type `change` for a separate revision update and `done`
to finish. Fixtures are archived, not hard-deleted. Rate limits/jobs are not reset.

Evidence: `.docs/phase0/local-linktree-integration.json` and
`.docs/ui-review/real-linktree-*.png`. Browser review includes 375 px and desktop,
private draft create/save, stale input preservation, pre-consent zero iframes and
inactive branded 404. Complete accessibility, hosted operations, load and actual
approved-provider rendering remain acceptance work.
