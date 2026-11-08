# Workspace overview, invitations, audit and private composition

Local implementation checkpoint, 2026-10-24. This is not full PRD or launch
acceptance. No deployment, real recipient email, provider push or production data
change was performed.

## Dashboard and editorial work

Migration 101 adds independently loaded, current-session widget projections.
Registration bars show up to eight recent accessible events, with internal
registrations and recorded external attendees distinguished. Deleted attendance,
archived events and inactive teams are excluded. No attendee identity is returned.
Funding bars show accessible incoming records by approval/received state, retaining
exact cents and excluding drafts, rejected/cancelled records and outgoing expenses.
No amounts or growth rates are invented. Empty panels stay empty.

The fourth overview metric is the signed-in account's unread, nonarchived direct
messages. It never counts review-mode access to other people's messages. Assigned
tasks now recheck `can_operate_task` and active membership instead of reading every
row with a matching assignee. Widget failure remains local to that panel.

The personal task/message workspaces are reachable within `/admin?view=tasks` and
`/admin?view=messages`, and inside `/admin/blog-editor?view=...`. Ordinary Team
Members may enter Communications and Finances for their personal records, as
required by the Section 24 matrix; each underlying SQL operation still enforces
record/team/action scope. Route entry confers no approval or management action.

Migration 104 provides the editorial overview: accessible article states, assigned
submission count and six UTC months of actual saved revisions. It excludes
archived/inaccessible articles and exposes no bodies or contact details. Internal
writing has no invented public readership statistics.

## Invitations

Migrations 102–103 add safe inviter display and a terminal `declined` state.
Inspection requires the existing email-bound capability and current inviter
authority. Existing accounts must sign in as the intended recipient and pass CSRF
for decline. New recipients can decline without creating an account. The same
locks and validity checks serialize accept/decline/resend. Declined links cannot
be reused or accepted. A new invitation must be issued to reverse that outcome.

Audit records preserve the true actor: a not-yet-registered recipient has a null
actor, rather than a manufactured account or an action attributed to the inviter.
Normal acceptance, revocation, resend rotation and inviter-revocation checks remain.
The original prepared/applied SQL history is preserved; migration 103 corrects
the unregistered-recipient activity-feed constraint with a forward change.

## Audit review

`GET /api/v1/admin/audit` supports exact action/actor/result/date filters and a
restricted action/target/exact-ID search. Cursor pages use descending timestamp
and UUID plus a fixed snapshot cutoff. Statistics apply the same filters before
pagination. CSV exports retain the complete filtered snapshot rather than only
the current cursor page, capped at 10,000 entries.

`GET /api/v1/admin/audit/:id` is administrator-only and separately audited. Only
explicit numeric counts, UUID identifiers and boolean flags are exposed from
metadata. Arbitrary strings, nested documents, answers, credentials and other
metadata are omitted. There is no update/delete route. Migration 105 supplies
aggregate counts/top actions and the retention inventory: minimum two years,
automatic audit purge disabled. This is policy/inventory, not backup proof.

## Private page composition and publication freshness

From Site content, open the full-page or phone-size saved-draft preview. The
preview uses the actual public page and shell components with a private curated
CMS snapshot, including saved drafts. Public event/resource/team/media inventories
retain their normal public reads. No unsaved editor values are included.

`GET /api/v1/admin/site-content/preview` requires current CMS read access. All
collections have bounded projections, invalid legacy records are counted/omitted,
and no editor identity, arbitrary setting, private record or token is serialized.
Responses are no-store/noindex and inspection is audited. Preview links and
submissions are disabled; page selection and reload remain operable outside the
read-only canvas. The preview never publishes or creates responses.

Mutable public CMS projections now use `max-age=0, s-maxage=0, must-revalidate`.
The API reaches current database state before checking the response ETag. This
eliminates the earlier shared-cache stale-publication window without provider
credentials or a pretend cache-purge success. It trades edge-hit performance for
freshness; hosted latency/cache/header verification remains required. It is not
an implementation of provider-specific edge purge.

## Evidence and limits

- Canonical SQL chain through migration 105 and both independent 100-client
  last-seat/last-response races pass under clean and legacy automatic grants.
- Actual local workspace checks: 15. Team invitation checks include new-recipient
  decline, wrong email, no created identity and unusable declined link.
- Actual local CMS checks: 21, including private preview, permission revocation,
  publication ETag change and mandatory revalidation. Fictional records archived.
- Unit contracts cover chart values/empty states/escaping, actor/session-scoped
  widgets, independent failure, metadata redaction, cursor/filter/export behavior
  and private composition boundaries.
- Browser inspection confirms the actual preview layout and blocked navigation.
  Further supported-device, manual accessibility and visual acceptance are open.

Run `npm test`, `npm run test:db`, `npm run test:db:legacy-grants`,
`npm run test:local-workspace`, `npm run test:local-team-invitations` and
`npm run test:local-site-content`. The full global 70% coverage gate still fails;
the numerical coverage report is not an implementation-completion percentage.
