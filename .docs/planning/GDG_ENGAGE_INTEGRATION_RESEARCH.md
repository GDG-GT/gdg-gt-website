# GDG community and Georgia Tech Engage integration research

Checked 2026-11-08 against live public endpoints, the actual Engage interface,
current application source and official vendor documentation. This is a research
and implementation proposal. No external event, roster, registration, website
content, integration credential or provider setting was changed.

## Owner decisions

Google sign-in is not planned. Georgia Tech SSO is a separate pending request
which the owner submitted. The Google GDG chapter site at gdg.community.dev is
the community integration target. It is powered by Bevy; the provider name does
not mean a separate community account or a new Bevy subscription is needed.

## Actual public checks

Google chapter:
https://gdg.community.dev/gdg-on-campus-georgia-institute-of-technology-atlanta-united-states/

- Public chapter ID is 2402.
- The chapter_slim response returned HTTP 200 without credentials and a public
  membership count of 723 at this check. Counts are snapshots, not identities.
- The event_slim for_chapter response returned HTTP 200 and eight public events
  whose dates are in the past. It includes cohosted events. Georgia 311 Challenge
  2026 is hosted by chapter 3446 and carries a chapter-specific cohost RSVP URL.
  Preserve that URL rather than replacing it with the host's generic event URL.
- The ordinary /api/chapter/2402/ endpoint returned 403 without credentials.
  Public frontend data availability does not imply access to every API endpoint.
- The slim endpoint responded with the same eight records when a Published
  status query was supplied. Do not assume this query filters status correctly.
  Use validated dates and supported explicit status fields when available.
- The full chapter HTML returns X-Frame-Options SAMEORIGIN, so embedding it in
  gdggt.dev is blocked. Current application CSP also excludes these frame hosts.
- /rss/ works but is site-wide and bounded to 20 public items. It is unsuitable
  as a complete per-chapter event history. Do not assume a chapter feed exists.

Observed public data URLs, discovered in the chapter page's own data:

- https://gdg.community.dev/api/chapter_slim/gdg-on-campus-georgia-institute-of-technology-atlanta-united-states/
- https://gdg.community.dev/api/event_slim/for_chapter/2402/

The slim endpoints power the public frontend. Their anonymous availability was
verified, but their stability/third-party support contract has not been confirmed
by Google. Use an isolated adapter, caching, monitoring and a manual fallback.

Georgia Tech Engage:
https://gatech.campuslabs.com/engage/organization/gdg

- Found through the actual Organizations directory search, not a guessed slug.
- Its public website field already points to gdggt.dev.
- Its events screen lists no upcoming public events.
- Its actual RSS and calendar links both returned HTTP 200 and valid documents
  without credentials. Each contains zero event entries at this check.
- Officer details require sign-in. No private roster or personal-data request
  was made during research.

Verified organization-specific feeds:

- https://gatech.campuslabs.com/engage/organization/gdg/events.rss
- https://gatech.campuslabs.com/engage/organization/gdg/events.ics

## What the current application already supports

- Event records, detail pages, filters, native calendar downloads and official
  external registration links, with internal/external/both registration modes.
- Community member CSV import/export with review, validation and deduplication.
  It expects the chapter's schema and at most 200 rows per batch. A provider CSV
  needs column conversion; it is not automatically compatible.
- Server-side Supabase database/storage, scheduled jobs, audit trails and durable
  worker patterns, plus editable Linktree links.
- It does not contain a provider event importer, provider-ID mapping table,
  reconciliation process, provider webhooks or cross-provider publishing.
- Events export attendees; the code does not currently provide an attendee CSV
  importer. Do not describe that workflow as already implemented.

## Recommended first release

1. Add clear links to the official GDG community and Engage organization in the
   chapter link profile and relevant membership/event views.
2. Implement a server-side Google GDG public-event adapter and Engage RSS/iCal
   adapter, initially read-only. Keep our native visual design.
3. Poll on a modest schedule, for example every 15 minutes, using the existing
   Supabase scheduling infrastructure and an authenticated bounded server job.
   Do not add Zapier, a paid service or an additional account.
4. Store source, provider record ID, source URL, canonical event association,
   last successful sync and imported snapshot. Deduplicate by source ID/ICS UID,
   and let an officer link the same event across providers. Titles alone are not
   identity keys.
5. Preview imports for officer review before first publication. Keep field
   ownership explicit so a later sync does not overwrite local chapter copy.
   Initially prefer provider -> website, not two-way editing.
6. Use the provider's official registration URL. For a GDG-hosted registration,
   do not also collect a second local RSVP or pretend a link click is a completed
   registration. External login remains controlled by the external website.
7. Preserve the last verified data during outages, show sync status and allow a
   manual retry. Pagination, timezone/DST, cohosts, cancellation and duplicate
   handling need explicit tests. Do not cancel/delete an event solely because it
   disappears from a bounded feed.
8. Sanitize descriptions, allowlist source hosts and redirects, bound response
   sizes and request time, and do not fetch arbitrary administrator-entered URLs.
9. Keep imported public member counts distinct from the website's directory and
   subscription counts. A public total is not a transferable roster.

## Deeper integration and its prerequisites

Google GDG / Bevy authenticated API and webhooks:

- Official docs say authenticated API keys are provisioned for HQ administrators.
  Chapter organizer access does not establish authority to obtain Google's
  community-wide credentials. Ask the Google program contact whether a supported
  chapter-scoped integration or filtered webhook is available.
- Webhooks can include event, attendee, user and chapter-member changes. Setup
  is in the community Admin Dashboard. An approved chapter-filtered subscription
  could feed a queued, secret-verified, idempotent receiver on our backend.
- Event creation, two-way event edits, attendee/check-in sync and membership sync
  are conditional on the exact granted endpoints and permissions. They were not
  validated against this Google tenant with authentication.
- Organizer CSV export is an interim option where permissions allow it. Import
  must preserve provenance and review possible matches. Importing a person does
  not create consent for newsletter sends or verify an existing website account.
- Provider member creation may trigger onboarding email. No membership writes,
  automatic mail triggers or real registrations are part of this research.

Engage authenticated API:

- Version 3 supports organizations, events, RSVP/attendance, roster and other
  institutional data. Keys are managed by the campus's All Access administrators
  and can be restricted by endpoints, methods and IP address.
- Obtain GT's approval, contract entitlement and a minimum-scope key through the
  campus Engage administrators. The public feed does not grant roster/API access.
- Ask whether GT permits our Vercel/Supabase integration under its license and
  whether IP restrictions require an alternative approved connectivity method.
  Do not turn off restrictions or assume the free host has a fixed outbound IP.
- Event publishing must preserve GT's approval workflow. Our website cannot turn
  a local form submission into an official approved Engage event or institutional
  attendance record without supported permission and a verified write contract.

## Questions for provider contacts

Google program contact: Can our chapter use the public event endpoints for its
website, and is a chapter-scoped API key or webhook available for events,
members and attendance. Confirm cohost and cancellation behavior.

GT Engage administrator: Can our organization use the public event feeds and,
if needed later, an approved restricted API integration for GDG records. Confirm
license, fields, event approval and hosting/IP requirements.

## Primary sources

- https://help.bevy.com/hc/en-us/articles/20800961964695-Using-Public-Bevy-APIs
- https://help.bevy.com/hc/en-us/articles/1500001777062-Configure-webhooks
- https://help.bevy.com/hc/en-us/articles/17208549529751-Webhook-best-practices
- https://help.bevy.com/hc/en-us/articles/43820390780439-Subscribe-to-Bevy-content-with-RSS
- https://help.bevy.com/hc/en-us/articles/24847608089495-Chapter-Members
- https://help.bevy.com/hc/en-us/articles/1500001761601-Manage-event-registrations
- https://help.anthology.com/engage/en/options-for-sharing-engage-events-to-an-external-calendar.html
- https://help.anthology.com/engage/en/using-the-engage-api.html
- https://engage-api.campuslabs.com/
- https://engage-api.campuslabs.com/swagger/index.html
