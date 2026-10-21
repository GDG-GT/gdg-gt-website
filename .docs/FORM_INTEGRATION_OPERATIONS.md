# Internal Forms references

Migration 071 implements FORM-028 with a private event/team/campaign reference
table. A reference contains a form ID, `latest_published` version policy and CTA
metadata, never copied questions, answers, an invitation or a verification token.
Up to five labelled references can be managed per resource.

The event editor and team workspace have **Linked forms** dialogs. Save event
changes first. Linking requires current access to edit the source and to view and
manage the published form. The server rechecks account/session, both resource
scopes, active teams, publication, optimistic revision and idempotency under locks.
Source managers can remove a reference after their form access is revoked, but
cannot read its private title/URL or relink it. Removal never deletes a form.

Public event details expose only currently open public/email-verified forms, as
ordinary `/forms/:slug` links. Runtime access/identity verification still applies.
Invite-only, internal and unlisted forms are not exposed through public events.
The source must itself be published. The integration follows republication;
unpublished drafts do not replace its respondent definition. Public API edge
caching remains subject to the existing short cache lifetime.

Campaign consumers can use the same HTTP contract. Until the new campaign
workspace is implemented, campaign references are Admin/Super Admin only and can
be linked/changed only on drafts. No campaign was sent by this implementation.

HTTP contract: `/api/v1/admin/form-integrations/{event|team|campaign}/{id}` GET;
`/candidates?q=...` GET; `/{slot}` PUT with `revision,formId,versionPolicy,label`,
or DELETE with `revision`. Writes require CSRF and Idempotency-Key. Direct table
and RPC access by browser roles is denied.

Evidence: canonical SQL 071 covers foreign source/form permissions, scoped team
management, revoked access/session, publication/access modes, schedules, campaign
immutability and metadata minimization. `npm run test:local-form-integrations`
passes 15 real API/database checks using fictional loopback fixtures. Native
browser review verifies the live dialog and draft Stay/Discard protection;
`ui-review/real-form-integrations-desktop.png` records its appearance. This is not
hosted delivery, full mobile/screen-reader or complete PRD acceptance.
