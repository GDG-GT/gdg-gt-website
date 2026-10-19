# Product Requirements Document v1.5
## Google Developer Group on Campus at Georgia Institute of Technology Website

**Version:** 1.5  
**Date:** October 17, 2026  
**Status:** Direct implementation specification with locked visual contract  
**Launch status:** Blocked until all launch gates pass  
**Source system:** GDG Penn State website  
**Technical baseline:** `.docs/PSU_REPOSITORY_AUDIT_v4.md`, revision 4.1  
**Target deployment:** New Georgia Tech chapter deployment with a separate Supabase project and Vercel project
**Current revision:** Native Forms platform added with production feasibility constraints verified against current official platform documentation

## Implementation agent directive

Build the product specified in this PRD and the three approved visual documents named in Section 10. Do not redesign it, simplify its visual identity, generate alternatives, substitute a generic template, or treat the supplied compositions as loose inspiration.

Missing content or assets do not authorize a different design. Preserve the required composition with clearly labeled development placeholders until approved content or assets are supplied. Any visual departure requires Tejas's explicit approval and a PRD revision before implementation. The product is not complete until the visual fidelity tests and sign-off in Sections 10.10, 16.5, and 31 pass.

## 1. Document purpose

This PRD defines the complete migration, security hardening, rebrand, redesign, and enhancement of the GDG Penn State website for Google Developer Group on Campus at Georgia Institute of Technology.

It replaces PRD versions 1.1 through 1.4 as the implementation specification. Earlier PRDs remain historical inputs. When they conflict with this document or the revision 4.1 audit, this document and the audit win.

The visual contract in Section 10 and the implementation contracts in Sections 21 through 32 are normative. A developer may change internal file organization, but may not change public behavior, security boundaries, data ownership, permissions, visual direction, page composition, or acceptance criteria without explicit product approval and a corresponding PRD revision.

This document is written for direct execution by a human developer or coding agent. “Inspired by,” “similar to,” and alternate visual concepts are not acceptable interpretations of the approved design. The implementation must reproduce the specified visual system and page composition while satisfying the functional, security, accessibility, and responsive requirements in this PRD.

The source application is not a clean template. It contains useful product functionality alongside critical security defects, non-linear database history, PSU-specific content, and partially implemented PWA behavior. The target is therefore a controlled migration, not a direct deployment and not a from-scratch rewrite.

## 2. Executive summary

The target product is a public chapter website plus a secure internal operating system for the chapter.

The public website must communicate the Georgia Tech chapter identity, promote events, show the team, publish resources and sponsors, support contact and newsletter workflows, and provide individual event pages with registration.

The internal application must preserve the source system's complete admin and collaboration scope, including events, people, teams, permissions, invitations, communications, tasks, channels, whiteboards, finances, media, newsletters, Linktree, site status, audit history, blog operations, and project operations. It must also add a complete first-party Forms platform for building, publishing, completing, analyzing, and exporting forms without relying on Google Forms or Microsoft Forms.

The migration must not carry any PSU production data. Only verified schema and behavior may be reused. Every protected operation must move behind trusted server authorization before launch.

### 2.1 Product outcomes

1. A distinctive Georgia Tech chapter website that does not look like a generic AI-generated landing page.
2. Secure hidden-entry admin access using the existing footer interaction, with server-side gate validation.
3. A valid custom session architecture using opaque HttpOnly cookies and server-side session validation.
4. Complete preservation of the 26 protected admin page workflows.
5. Secure public event registration with atomic capacity enforcement and individual event pages.
6. A reliable PWA with safe public caching, explicit offline states, and an IndexedDB submission queue.
7. Opt-in push notifications for event reminders.
8. Automated security, functional, accessibility, and browser testing.
9. A reproducible GT database with no PSU production data.
10. A native Forms platform with a visual builder, conditional logic, secure response collection, file uploads, response analytics, and exports.

### 2.2 Success definition

The product is successful when the chapter can publish and operate the site without direct database work, public users can complete all intended public workflows, every protected action is authorized on the server, and all security, functional, accessibility, data, and deployment launch gates pass.

## 3. Scope

### 3.1 In scope

- Migrate the verified source functionality.
- Preserve all 26 protected admin page workflows.
- Preserve the public invite acceptance route.
- Preserve team hierarchy, roles, permissions, page access, transfers, activity, statistics, and invitations.
- Preserve channels, messages, notifications, internal communications, task management, and whiteboards.
- Preserve finance requests, budgets, attachments, approval steps, and reporting.
- Preserve event creation, editing, attendance, email, and reporting.
- Add `/events/:slug` pages.
- Add secure event registration with capacity and duplicate protection.
- Preserve newsletter confirmation, unsubscribe, campaign, template, and subscriber management.
- Preserve public team, resources, sponsors, gallery, contact, Linktree, maintenance, and site status behavior.
- Add a first-party Forms platform comparable to the chapter's required Google Forms and Microsoft Forms workflows: visual form building, question and section management, validation, branching, publishing, response collection, response review, charts, exports, permissions, and audit history.
- Add public form routes that run entirely inside the website and do not require an external form provider.
- Preserve blog and project admin systems while removing their public routes.
- Rebrand all PSU content and configuration to Georgia Tech.
- Implement the approved Georgia Tech plus coral visual direction.
- Implement PWA installation, offline behavior, and push notifications.
- Add complete test and CI foundations.
- Deploy to new GT-owned infrastructure.

### 3.2 Explicit non-goals

- No PSU users, events, members, posts, submissions, messages, financial data, media, or other production records will migrate.
- No replacement of the custom session model with Supabase Auth in this release.
- No localStorage authentication tokens.
- No reduction of the admin page set or team permission granularity.
- No removal of blog or project administration.
- No public Blog or Projects experience in this release.
- No secret-code analytics, QR code, automatic rotation, or simultaneous multiple gate codes.
- No general product analytics, ad tracking, session replay, or heatmaps.
- No arbitrary JavaScript, arbitrary HTML, payment collection, electronic signatures, quiz grading, or external form-provider synchronization in the first Forms release.
- No claim of complete feature-for-feature parity with every Google Forms or Microsoft Forms enterprise integration. The normative Forms scope is exactly Section 7.12 and its linked implementation contracts.
- No service worker caching of private admin, finance, message, audit, authentication, or authorization data.
- No claim that offline event registration is confirmed before the server accepts it.
- No migration of unsafe historical RLS policies.

## 4. Verified source baseline

The complete technical evidence is in `.docs/PSU_REPOSITORY_AUDIT_v4.md`.

| Item | Verified baseline |
|---|---:|
| Route registrations | 44 |
| Protected admin routes | 26 |
| Public invite routes | 1 |
| Admin redirect aliases | 1 |
| Services | 44 |
| Vercel API files | 7 |
| Deployable Edge Functions | 9 |
| Migration files | 82 |
| Tables created by migrations | 58 |
| Tables created anywhere in repository SQL | 62 |
| Storage buckets defined | 2 |
| Unique SQL functions in migrations | 44 |
| Components | 97 |
| Automated test files | 0 |

### 4.1 Source blockers that shape this PRD

- The footer downloads `admin_secret_code` and compares it in the browser.
- The session API trusts unsigned admin JSON stored in a cookie.
- The random session token is not stored or validated.
- The latest broad RLS migration drops policies and recreates unconditional access.
- Protected services call Supabase directly from the browser.
- CSRF tokens are not bound to sessions or validated end to end.
- Email endpoints and several Edge Functions lack application-level authorization.
- Stored event and blog content can reach HTML-capable render paths without a complete sanitizer.
- External embeds and links do not have a complete server-side allowlist.
- Authentication and email handlers log personal and operational data.
- `event_attendance` and three used RPCs are missing from repository SQL.
- The PWA is explicitly disabled.
- There is no test or CI foundation.
- The disposable-copy lint run reports 10 errors and 340 warnings.
- The lockfile reports 42 known dependency vulnerabilities, including 25 high-severity findings.
- The production build succeeds but emits multiple oversized chunks, including two chunks above 1.8 MB minified.

These are implementation requirements, not optional cleanup.

## 5. Users and roles

### 5.1 Anonymous public user

Can view approved public content, register for events, subscribe to the newsletter, submit the contact form, complete published public forms, view public Linktree profiles, install the PWA, and opt in to attendee event reminders after registration verification.

Cannot call protected CRUD endpoints, view private records, send arbitrary email, enumerate admin accounts, or read any gate or session secret.

### 5.2 Super Admin

Has full access to the internal application, including admin user management, role assignment, site settings, team structures, security events, audit history, and gate secret rotation.

### 5.3 Admin

Has broad operational access but cannot create, modify, deactivate, or delete Super Admin accounts and cannot rotate the gate secret unless explicitly granted by the final authorization matrix.

### 5.4 Team Member

Is an `admin_users` account with role `team_member` and one or more records in `team_memberships`. Access depends on team role, `team_permissions`, and `team_page_access`.

Base access:

- Dashboard
- Own profile
- Guide
- Assigned team dashboards
- Organization channels
- Whiteboard access granted to the user's scope

Additional routes and actions require explicit grants. The server must enforce the same decision as the interface.

### 5.5 Blog Editor

Can use `/admin/blog-editor`, `/admin/blog-media`, and own profile. Can create and edit authorized blog content. Publishing, moderation, and access to unrelated admin systems require Admin or Super Admin authorization.

### 5.6 Authorization precedence

1. Disabled or missing account denies access.
2. Valid server session is required.
3. Super Admin rules apply.
4. Admin rules apply.
5. Blog Editor scope applies.
6. Team Member route and action grants apply.
7. Resource ownership and team scope apply.
8. Any ambiguity denies access.

## 6. Information architecture

### 6.1 Public navigation

Primary navigation:

- Home
- Events
- Team
- Resources
- Sponsors
- Gallery
- Contact

Blog and Projects must not appear in public navigation, footer links, sitemap, RSS, structured data, or search surfaces.

### 6.2 Target public routes

| Path | Requirement |
|---|---|
| `/` | Public homepage |
| `/events` | Searchable and sortable event listing |
| `/events/:slug` | Individual event detail and registration |
| `/team` | Public team profiles grouped by chapter section |
| `/resources` | Active learning and community resources |
| `/sponsors` | Active sponsor tiers and impact content |
| `/gallery` | Approved public media gallery |
| `/contact` | Validated contact submission |
| `/l/:username` | Active public Linktree profile |
| `/forms/:slug` | Published native form and response workflow |
| `/newsletter/confirm` | Confirmation-token workflow |
| `/newsletter/unsubscribe` | Unsubscribe-token workflow |
| `/offline` | PWA offline fallback |
| `/maintenance` | Site maintenance state |
| `*` | Branded 404 |

The following paths must resolve through the normal 404 experience:

- `/blog`
- `/blog/:slug`
- `/projects`

### 6.3 Admin routes

All protected routes must preserve their source workflow:

| Route | Primary purpose |
|---|---|
| `/admin` | Dashboard and personal operational overview |
| `/admin/content` | Site content, navigation, social, and footer management |
| `/admin/events` | Events, registrations, attendance, and event communication |
| `/admin/team` | Public team profile management |
| `/admin/projects` | Private project administration |
| `/admin/members` | Community member management |
| `/admin/resources` | Resource management |
| `/admin/newsletter` | Subscribers, templates, campaigns, and scheduling |
| `/admin/blog` | Blog administration and moderation |
| `/admin/users` | Admin account and role management |
| `/admin/profile` | Current user's profile |
| `/admin/sponsors` | Sponsors, tiers, and impact statistics |
| `/admin/communications` | Announcements, tasks, direct messages, and email |
| `/admin/channels` | Organization channels and messages |
| `/admin/whiteboard` | Collaborative whiteboards |
| `/admin/gallery` | Public gallery management |
| `/admin/media` | Media folders, files, tags, and usage |
| `/admin/guide` | Internal operating documentation |
| `/admin/linktree` | Linktree profiles, links, embeds, and analytics |
| `/admin/forms` | Native form library, templates, ownership, and publication state |
| `/admin/forms/:formId/edit` | Visual form builder, logic, settings, preview, and publishing |
| `/admin/forms/:formId/responses` | Response table, individual responses, summaries, charts, and exports |
| `/admin/site-status` | Maintenance and site status control |
| `/admin/teams` | Team hierarchy, memberships, permissions, and invitations |
| `/admin/finances` | Requests, approvals, budgets, attachments, and reporting |
| `/admin/audit-log` | Audit event review and export |
| `/admin/team/:teamId` | Team-specific dashboard |
| `/admin/blog-editor` | Blog Editor workspace |
| `/admin/blog-media` | Blog Editor media workflow |

Special routes:

- `/admin/invite/:token` remains public but token-protected.
- `/admin/blog-comments` remains a redirect to `/admin/blog?tab=comments`.
- Direct access to any protected route without a valid session returns to the public site without exposing a login screen.

## 7. Functional requirements

### 7.1 Admin gate and login

**AUTH-001:** The existing newsletter field remains the hidden entry point.

**AUTH-002:** A normal email address follows the newsletter subscription flow.

**AUTH-003:** A non-email gate entry is submitted to the server-side gate endpoint. The stored secret or hash never reaches the browser.

**AUTH-004:** The gate secret is stored only as a strong password hash in server-only configuration or a protected secret store.

**AUTH-005:** Secret comparison uses a constant-time password verification library appropriate for the runtime.

**AUTH-006:** Five failed attempts from an IP or risk key within 15 minutes trigger a 429 response. Production rate limiting must use shared persistent storage, not process memory.

**AUTH-007:** Failure responses are generic and never reveal whether the gate secret, email, or admin account exists.

**AUTH-008:** Success sets a 15-minute HttpOnly, Secure, SameSite=Strict gate cookie.

**AUTH-009:** The gate cookie reveals the email/password login UI but grants no application or database access.

**AUTH-010:** `/api/auth/gate-status` returns only `{ gateValid: boolean }` and never returns token contents.

**AUTH-011:** The login endpoint requires a valid gate cookie.

**AUTH-012:** Successful login creates an opaque session token. Only a hash of the token is stored server-side.

**AUTH-013:** Session validation checks token hash, expiry, revocation, account status, and current role on every protected request.

**AUTH-014:** No unsigned admin identity or role is trusted from a browser cookie.

**AUTH-015:** Logout revokes the server session and clears gate, session, and CSRF cookies.

**AUTH-016:** Gate rotation is manual and Super Admin only. Rotation invalidates the prior gate immediately.

**Acceptance criteria**

- Browser source, storage, network responses, and public Supabase queries contain no gate secret or hash.
- A forged role cookie does not create a valid session.
- Disabling a user invalidates protected access no later than the next request.
- Login is not rendered from a direct `/admin` request without a valid gate.
- Rate limits behave consistently across server instances.

### 7.2 Server authorization

**SEC-001:** All application data reads and writes use same-origin server APIs. The browser does not query application tables directly with a Supabase publishable or legacy anon key.

**SEC-002:** Public writes use dedicated server endpoints. Those endpoints may call narrowly scoped atomic RPCs from the trusted server, but the browser receives no direct RPC execution grant. No public table receives a general anonymous write policy.

**SEC-003:** Protected reads and writes use a trusted server layer.

**SEC-004:** Every protected endpoint performs, in order:

1. Origin and method validation.
2. Session validation.
3. CSRF validation for state changes.
4. Input schema validation.
5. Role, action, team, and resource authorization.
6. Database operation using the server-only Supabase secret key or legacy service-role credential only after authorization.
7. Audit logging for security-sensitive actions.
8. Minimal response serialization.

**SEC-005:** The Supabase secret key or legacy service-role credential appears only in server, worker, and tightly controlled Edge Function environments. The server client is dedicated and cannot inherit or replace its authorization header with a user token.

**SEC-006:** Client route guards remain for UX but are never treated as authorization.

**SEC-007:** Custom sessions do not use Supabase's `authenticated` role as proof of identity.

**SEC-008:** Authorization must not depend on connection-local `current_setting` state across pooled requests.

**SEC-009:** The final RLS and grant model denies direct browser access to application tables and RPCs. Public content and public mutations are exposed only through documented same-origin server endpoints.

**SEC-010:** Email-sending functions validate the caller and intended email action. Public confirmation emails can be triggered only by a successful, rate-limited workflow.

**SEC-011:** The browser may connect directly to Supabase only for Realtime after receiving a short-lived, server-issued Realtime token scoped to the authenticated user.

**SEC-012:** Stored Markdown, HTML-capable content, event descriptions, email previews, and embeds use centralized input validation and output sanitization.

**SEC-013:** External links and iframe embeds pass a server-side URL allowlist. Private IP ranges, credentials in URLs, non-HTTPS production URLs, `javascript:`, `data:`, and unapproved iframe hosts are rejected.

**SEC-014:** Production logs use structured redaction and never record raw credentials, tokens, message bodies, gate attempts, complete authentication responses, or unmasked recipient lists.

### 7.3 CSRF

**CSRF-001:** The server issues a cryptographically random token bound to the current server session.

**CSRF-002:** State-changing protected requests require the token in a custom header and validate it against the session.

**CSRF-003:** Tokens expire, rotate on login, and are invalidated on logout.

**CSRF-004:** SameSite cookies and origin checks are defense in depth, not replacements for token validation.

**CSRF-005:** Public endpoints use origin checks, idempotency, bot controls, and rate limits appropriate to their threat model.

### 7.4 Events

**EVT-001:** Admins with event permission can create, edit, publish, unpublish, feature, cancel, duplicate, and delete events.

**EVT-002:** Event fields include title, unique slug, summary, description, start and end time, timezone, location, room, type, level, image, registration mode, capacity, prerequisites, learning outcomes, what to bring, schedule, additional information, contact information, external links, publication state, and featured state.

**EVT-003:** `/events` supports upcoming-first default ordering plus date, newest, title, type, and level filters where data exists.

**EVT-004:** `/events/:slug` contains event metadata, accessible schedule content, capacity state, registration action, calendar action, and share metadata.

**EVT-005:** Registration is processed atomically. Capacity check, duplicate check, row insert, and count update occur in one transaction or RPC.

**EVT-006:** A unique constraint prevents duplicate registration for the same normalized email and event.

**EVT-007:** Each registration submission carries an idempotency key.

**EVT-008:** Capacity is never enforced only in JavaScript.

**EVT-009:** Admin attendance tools support listing, check-in, notes, correction, removal, and summary statistics.

**EVT-010:** Registration confirmation email is generated only after the registration transaction succeeds.

**EVT-011:** Event pages include canonical metadata, Open Graph data, and Event structured data based on approved public fields.

**EVT-012:** The missing `event_attendance` schema and attendee count behavior are reconstructed and tested before event work exits its phase.

### 7.5 Teams, people, and permissions

**TEAM-001:** Preserve public team profiles separately from internal admin accounts and memberships.

**TEAM-002:** Preserve chapter teams, leads, co-leads, members, active state, membership history, transfers, invitations, page grants, action grants, announcements, statistics, and activity logs.

**TEAM-003:** Invitations use single-use, high-entropy, expiring tokens stored as hashes.

**TEAM-004:** Accepting an invitation validates email or intended account binding, expiry, revocation, and prior use.

**TEAM-005:** Team leads can manage only teams and members within their authorized scope.

**TEAM-006:** The server enforces both route permission and action permission.

**TEAM-007:** Public team data exposes only approved profile fields.

### 7.6 Communications and collaboration

**COMM-001:** Preserve announcements, audience targeting, scheduling, read tracking, internal messages, tasks, task comments, due dates, overdue automation, channels, channel messages, pins, notifications, and whiteboards.

**COMM-002:** Preserve existing realtime behavior for channels, notifications, content refresh, team chat, and whiteboard state where it is currently used.

**COMM-003:** Realtime subscriptions must receive only records the current session is authorized to view.

**COMM-004:** Message and whiteboard mutations require server authorization or a secure token exchange that maps the custom session to a scoped backend action.

**COMM-005:** Email fan-out requires explicit permission, recipient limits, rate limits, and audit logs.

**COMM-006:** Scheduled jobs use dedicated secrets and cannot be triggered anonymously.

### 7.7 Finances

**FIN-001:** Preserve finance request creation, draft and submitted states, team lead approval, administrator approval, rejection, completion, notes, attachments, budget allocation, utilization, reporting, and export.

**FIN-002:** Finance records and attachments are private and never available through anonymous Supabase reads or public storage URLs.

**FIN-003:** Approval transitions are validated on the server against current state and caller authority.

**FIN-004:** Every approval, rejection, edit, deletion, and export is audited.

**FIN-005:** Attachment downloads use short-lived signed URLs issued after authorization.

### 7.8 Newsletter

**NEWS-001:** Public signup validates normalized email, applies rate limits and bot controls, and starts double opt-in.

**NEWS-002:** Confirmation and unsubscribe use random, expiring or revocable tokens stored safely.

**NEWS-003:** Public users cannot list subscribers or infer subscription state from distinct error responses.

**NEWS-004:** Admin tools preserve subscriber management, templates, campaigns, custom recipients, scheduling, test sends, delivery state, and cleanup workflows.

**NEWS-005:** Campaign send operations require server authorization, CSRF, recipient caps, idempotency, and audit logging.

**NEWS-006:** Resend credentials are server-only.

### 7.9 Contact

**CONTACT-001:** Contact submissions validate required fields, email format, length, allowed content, honeypot, rate limit, and origin.

**CONTACT-002:** The endpoint sends only to configured chapter recipients and does not accept arbitrary destination addresses from the browser.

**CONTACT-003:** User-supplied content is escaped in HTML email templates.

### 7.10 Content, resources, sponsors, gallery, and media

**CONTENT-001:** Preserve editable site settings, page content, navigation, social links, footer content, resources, sponsors, sponsor tiers, impact statistics, team profiles, gallery, media folders, media files, tags, star state, and usage references.

**CONTENT-002:** Public queries expose only active or published records and only required columns.

**CONTENT-003:** Protected media is private. Public media is explicitly published into a public bucket or public namespace.

**CONTENT-004:** The target must separate public assets from private uploads. The existing public `media` behavior cannot be reused for finance, blog submission, or internal attachments.

**CONTENT-005:** File uploads validate MIME type, file signature, size, extension, ownership, and destination.

**CONTENT-006:** SVG uploads are prohibited or sanitized with a documented policy.

**CONTENT-007:** Images use responsive sizes, width and height attributes, modern formats, lazy loading below the fold, and meaningful alt text.

### 7.11 Linktree

**LINK-001:** Preserve profiles, links, ordering, active state, embed types, public usernames, click counting, and admin analytics.

**LINK-002:** Public profiles expose only active profiles and active links.

**LINK-003:** Click tracking is rate-limited and does not accept arbitrary counter mutation.

**LINK-004:** External URLs are validated against allowed protocols.

### 7.12 Native Forms

**FORM-001:** The product provides a first-party Forms subsystem. Public respondents and administrators remain on the chapter website. An external Google Forms or Microsoft Forms embed is not the implementation.

**FORM-002:** Authorized users can create a blank form, create from an approved template, duplicate, rename, move, archive, restore, and permanently delete a form subject to retention and recent-password controls.

**FORM-003:** The builder supports sections and these field types: short text, long text, email, phone, number, URL, single choice, multiple choice, dropdown, date, time, date and time, linear scale, rating, Likert grid, checkbox grid, ranking, file upload, consent or acknowledgment, and non-answer title, description, image, and divider blocks.

**FORM-004:** Every answer field supports a stable internal field ID, label, optional description, required state, accessible help text, and type-appropriate validation. Validation includes length, numeric range, choice limits, date range, allowed domain, safe regular expression, and file count, type, and size.

**FORM-005:** The builder supports drag-and-drop ordering, keyboard reordering, section duplication, field duplication, undo and redo for the current editing session, autosave status, desktop preview, mobile preview, and a public preview that cannot submit production responses.

**FORM-006:** Conditional behavior supports showing or hiding fields, branching to a section, and ending the form based on prior single-choice, multiple-choice, dropdown, checkbox, rating, or scale answers. The builder rejects cycles, unreachable required fields, invalid targets, and contradictory rules before publication.

**FORM-007:** Form settings support description, header media, theme within the approved design system, confirmation message, progress indicator, question or option shuffling where semantically safe, response receipts, response editing, response limits, open and close schedule, and closed-form message. Receipts default to confirmation metadata without answer values; including answers requires an explicit per-form privacy review and excludes file contents and sensitive fields.

**FORM-008:** Access modes are public anonymous, public with verified email, unlisted token, invited-token only, and authenticated admin or team member. One-response enforcement is available only when the chosen access mode supplies a verifiable identity or unique invite token.

**FORM-009:** Public forms use a unique slug. Unlisted and invited forms use high-entropy access tokens stored only as hashes. Search engines must not index unlisted, invited, internal, draft, closed, or archived forms.

**FORM-010:** Draft form definitions are mutable. Every publication creates an immutable `form_version` with a schema hash. A response always references the exact published version it answered. Editing a published form creates a new draft and never changes historical responses or labels.

**FORM-011:** Public rendering includes form title, description, section progress, visible field labels, required indicators, inline validation, save-and-resume state when enabled, back and next controls, final review when enabled, privacy text, and a submit action. Conditional rules are evaluated consistently in browser and server code from the same versioned schema.

**FORM-012:** The server validates the submitted response against the referenced immutable version. It rejects unknown fields, stale or unpublished versions, answers to hidden fields unless explicitly retained by policy, missing required visible fields, invalid branches, unsafe content, invalid files, and response-limit conflicts.

**FORM-013:** Response submission is idempotent and atomic. Response-limit enforcement, one-response enforcement, invite-token consumption, answer persistence, file association, and final status update succeed or fail as one transaction. A respondent never sees `Submitted` until the transaction commits.

**FORM-014:** Optional save and resume uses a high-entropy token stored as a hash. Anonymous draft tokens expire after a configurable period no longer than 30 days. The raw token appears only in the respondent's resume link URL fragment, is exchanged through an authorization header or request body, and is never sent as a query string or logged path. Administrators cannot retrieve it.

**FORM-015:** Optional response editing uses a separate high-entropy edit token stored as a hash. The link uses the same URL-fragment exchange pattern as resume tokens. Editing is available only while the form owner permits it and the form is not locked. Every edit retains an auditable revision history without exposing prior answers publicly.

**FORM-016:** File uploads use a private `form-uploads` bucket and the signed direct-upload workflow in Section 26.7. Files remain quarantined and unavailable to form owners until server validation and malware scanning pass. A rejected or abandoned upload is deleted by scheduled cleanup.

**FORM-017:** Public form endpoints apply origin checks, form-specific and global rate limits, honeypot or challenge controls based on risk, idempotency, payload limits, token validation, and abuse monitoring. Public response APIs never expose response counts, answer data, respondent identity, access rules, or unpublished schema.

**FORM-018:** The form library shows owner, team, state, response count, open or closed state, last edited time, published version, and permitted actions. It supports search, owner, team, status, date, and template filters without exposing inaccessible forms.

**FORM-019:** The response workspace provides Summary, Responses, and Individual views. Summary uses type-appropriate charts and counts. Responses provides a paginated table with search, filters, date range, completion status, selected columns, and saved views. Individual view shows one response with version-aware labels and permitted files.

**FORM-020:** Authorized users can export selected or filtered responses as CSV, XLSX, or JSON. Exports include form ID, form version, response ID, submission time, completion state, and stable field IDs plus the labels from that version. CSV and XLSX generation prevents spreadsheet-formula injection from values beginning with `=`, `+`, `-`, `@`, tab, or carriage return. Large exports run as background jobs and use short-lived authenticated downloads.

**FORM-021:** Form owners can configure notification recipients from authorized chapter users or approved chapter addresses. Notifications include safe metadata and a protected response link, not sensitive answer content, unless an Admin explicitly enables a reviewed template for that form.

**FORM-022:** Permissions are action-based: `forms.view`, `forms.create`, `forms.edit`, `forms.publish`, `forms.manage_access`, `forms.view_responses`, `forms.view_sensitive_responses`, `forms.export_responses`, and `forms.delete`. Team-scoped forms require both the action grant and membership in the owning team. Form collaborators receive only explicitly granted actions.

**FORM-023:** Super Admin and Admin can manage all forms subject to privacy and audit rules. Team Members can manage only owned, collaborating, or team-scoped forms allowed by their grants. Blog Editors receive no Forms access in v1.5.

**FORM-024:** Response view, export, file download, deletion, redaction, collaborator changes, publication, closure, and destructive form actions are audited. Audit metadata contains form, version, response, filter, and result identifiers, never raw answer values or file contents.

**FORM-025:** Form response deletion supports delete, redact identity, or retain under an operational hold. Deleting a field from a later version never deletes historical answers. Deleting a form with responses defaults to archive; permanent deletion requires Super Admin, recent password confirmation, a retention check, and an export warning.

**FORM-026:** Forms meet WCAG 2.1 AA. All builder operations have keyboard equivalents, public errors are announced and associated with fields, grids have accessible row and column labels, progress does not rely on color, and focus moves to the first invalid field or new section heading.

**FORM-027:** The first Forms release includes reusable templates for event interest, event feedback, volunteer signup, team application, and general survey. Templates contain structure only and no real response data.

**FORM-028:** The Forms subsystem exposes an internal integration contract so an event, team, or campaign can reference a published form. Integrations store only the form ID and version policy. They do not duplicate form definitions or bypass form access rules.

**FORM-029:** A field can be marked sensitive. Sensitive answers are masked by default, excluded from activity feeds and notification bodies, omitted from default exports, and visible only with `forms.view_sensitive_responses`. Revealing or exporting them is audited.

**FORM-030:** For invited-token forms, authorized owners can upload or enter an approved recipient list, generate one single-use token per invitation, send a chapter-branded invitation, inspect delivery and response state without seeing raw tokens, resend safely, and revoke unused invitations. Email normalization and uniqueness prevent duplicate invitations.

**Acceptance criteria**

- A permitted Team Member can build, preview, publish, share, close, reopen, and analyze a team form without database access.
- An anonymous respondent can complete a public form, upload an allowed file when enabled, resume when enabled, and receive confirmation only after commit.
- Conditional logic produces the same visible and required fields in the browser and on the server.
- Publishing a changed draft creates a new immutable version while old responses remain readable with their original labels.
- Unauthorized users cannot discover forms, response counts, responses, exports, files, collaborators, or tokens through route substitution or API calls.
- CSV, XLSX, and JSON exports preserve stable field identity and version-aware labels.
- Form submissions at the configured limit are concurrency-safe and never exceed the limit.

### 7.13 Blog

**BLOG-001:** Preserve posts, categories, submissions, submission comments, public-comment data, likes, editorial assignments, approval, publishing state, media workflow, moderation, and analytics needed by admin tools.

**BLOG-002:** `/blog` and `/blog/:slug` return the normal 404 experience.

**BLOG-003:** Blog content is removed from navigation, footer, sitemap, RSS, public search, and homepage modules.

**BLOG-004:** Blog tables have no anonymous read or write access in this release.

**BLOG-005:** `blog-submissions` becomes private. Authorized users receive short-lived signed URLs.

**BLOG-006:** Blog Editor scope is enforced by the server, including ownership rules and publishing restrictions.

### 7.14 Projects

**PROJ-001:** Preserve project CRUD, members, categories or status fields present in the final schema, featured state, links, technology fields, and star data for future use.

**PROJ-002:** `/projects` returns the normal 404 experience.

**PROJ-003:** Projects are removed from public navigation, footer, sitemap, homepage, and search surfaces.

**PROJ-004:** Project tables have no anonymous access in this release.

**PROJ-005:** `/admin/projects` remains fully functional for authorized admins.

### 7.15 Site status and maintenance

**STATUS-001:** Authorized admins can enable and configure maintenance state.

**STATUS-002:** Admin routes and health endpoints remain available to authorized operators during maintenance.

**STATUS-003:** Public maintenance behavior does not create redirect loops and remains available offline where possible.

### 7.16 Audit and security operations

**AUDIT-001:** Record login success and failure, logout, gate lockout, account changes, permission changes, finance decisions, campaign sends, exports, destructive actions, and security configuration changes.

**AUDIT-002:** Audit events contain actor ID, action, target type, target ID, result, timestamp, request correlation ID, and safe metadata.

**AUDIT-003:** Never log passwords, gate entries, session tokens, CSRF tokens, service keys, full invitation tokens, or full reset tokens.

**AUDIT-004:** Audit rows are append-only to normal application roles.

## 8. Target technical architecture

### 8.1 Browser layer

- React 18, TypeScript, Vite, React Router, TanStack Query, Tailwind, Radix UI, and existing compatible libraries remain.
- Public and protected UI call versioned, same-origin server APIs.
- Protected mutations include cookies, CSRF headers, and idempotency keys where required.
- The browser Supabase client is limited to Realtime connections using short-lived server-issued tokens and direct uploads using a single-object, short-lived signed upload URL issued by the server.
- No feature service performs direct browser table mutation.

### 8.2 Server layer

Same-origin Vercel routes or an equivalent trusted server layer provide:

- Admin gate and gate status
- Login, session validation, logout, and CSRF
- Protected resource APIs
- Event registration
- Newsletter subscription and token workflows
- Contact submission
- Public form definition, draft, submission, edit, and upload-intent workflows
- Protected form builder, publishing, response, analytics, collaboration, and export workflows
- Push subscription and unsubscribe
- Scheduled job authentication
- Signed media URL issuance
- Short-lived Realtime token issuance

Shared middleware must centralize cookie parsing, session validation, CSRF, Zod validation, authorization, rate limiting, safe errors, and audit context.

### 8.3 Database layer

- New Supabase project dedicated to GT.
- Canonical, reproducible schema migration.
- No PSU production rows.
- No anonymous application-table access.
- Public content is serialized by server endpoints and may be edge-cached only when explicitly marked public.
- Realtime policies accept only server-issued short-lived identity claims and re-check resource membership.
- Private Realtime Broadcast and Presence channels use authorization against `realtime.messages`; application tables are not made browser-readable merely to power Realtime.
- Supabase secret or legacy service-role credentials exist only in trusted server or tightly controlled scheduled functions.
- Atomic RPCs for concurrency-sensitive public operations.

### 8.4 Custom session design

The existing custom-session product decision is preserved, but its implementation is replaced.

Recommended session record fields:

- `id`
- `admin_id`
- `token_hash`
- `created_at`
- `last_seen_at`
- `expires_at`
- `revoked_at`
- `ip_hash` or risk metadata if approved
- `user_agent_hash` if approved

The raw token exists only in an HttpOnly cookie. Role and identity are loaded server-side for each request or from a short server cache with explicit invalidation.

## 9. Database migration requirements

### 9.1 Canonical baseline

The GT project must not blindly execute the source's 82 migrations in production.

Required process:

1. Reconstruct the PSU schema in a disposable database using the documented baseline and migration order.
2. Record every migration failure, duplicate object, missing dependency, and final object definition.
3. Reconstruct `event_attendance` from application expectations and, if available, a schema-only export from the source database.
4. Resolve the three missing RPC calls.
5. Replace historical RLS and grants with the target matrix.
6. Generate a reviewed canonical GT baseline migration.
7. Add separate forward migrations for gate support, session repair, event slugs, native Forms, push subscriptions, and any target-only objects.
8. Apply the canonical migration to an empty staging project.
9. Prove that only approved GT seed data exists.

### 9.2 Data rules

Allowed seed data:

- GT site title and subtitle
- Public navigation structure
- GT footer and contact placeholders approved by chapter leadership
- Empty page sections where content is pending
- Required role and permission definitions
- Initial Super Admin created through a secure one-time process

Forbidden data:

- PSU accounts or password hashes
- PSU sessions, CSRF tokens, security events, or audit rows
- PSU event registrations
- PSU newsletter subscribers
- PSU posts, comments, likes, or submissions
- PSU project records or stars
- PSU members, teams, messages, finances, or media
- Sample credentials and default passwords from repository documentation

### 9.3 New or repaired objects

At minimum:

- Repaired `admin_sessions`
- Repaired CSRF storage or equivalent signed double-submit architecture
- `event_attendance`
- Atomic event registration function or transaction endpoint
- `forms`
- `form_versions`
- `form_collaborators`
- `form_access_tokens`
- `form_response_drafts`
- `form_responses`
- `form_response_revisions`
- `form_answers`
- `form_uploads`
- `form_export_jobs`
- `push_subscriptions`
- `push_delivery_log` or equivalent deduplication record
- Event slug uniqueness
- Idempotency storage for registration and queued writes, either in target tables or a dedicated table

## 10. Design system and experience direction

The approved visual system is a fixed implementation contract. These sources have distinct responsibilities:

1. `.docs/FINAL_DESIGN_PROMPTS.md` defines the master public aesthetic and approved homepage composition.
2. `.docs/DESIGN_SYSTEM.md` defines colors, typography, spacing, effects, components, responsive behavior, and reusable tokens.
3. `.docs/GDG_GT_UI_IMAGE_PROMPTS.md` defines the required desktop composition for each public page, homepage section, and primary admin surface.
4. This PRD defines product behavior, content rules, accessibility, security, data, route requirements, and acceptance gates.

If the visual sources appear to conflict, preserve the peach and coral aesthetic, glossy 3D hero language, frosted navigation, Tech Tower imagery, rounded white content surfaces, dark branded footer, and charcoal/coral admin shell described in Sections 10.1 through 10.9. Functional, security, accessibility, and verified-data requirements in this PRD always remain mandatory. No agent may use general Georgia Tech branding, the PSU source styling, a generic dashboard template, or personal taste to replace the approved direction.

### 10.1 Design character

The approved public direction is playful, warm, glossy, energetic, and unmistakably tied to both Google Developer Groups and Georgia Tech. The reference composition uses a peach and coral atmospheric hero, approved Georgia Tech campus architecture, floating glossy 3D objects, Google-color confetti, a translucent navigation bar, and soft curved transitions into white content sections.

The public site is intentionally expressive. Glossy coral forms, a floating frosted navigation surface, warm coral-to-orange gradients, rounded event cards, and selective 3D animation are part of the approved identity. They are not optional substitutions for a navy editorial or photography-first design.

The admin application uses the same visual family in a calmer, denser form. It has a charcoal sidebar with warm coral ambient light and a Georgia Tech architectural silhouette, a bright white workspace, coral active states, rounded white panels, charts, operational lists, and a right activity rail.

The public and admin surfaces share typography, tokens, accessibility rules, and component behavior, but not the same visual intensity.

### 10.2 Brand palette

Primary experience palette, copied from the approved design system:

| Token | Value | Use |
|---|---|---|
| Peach 50 | `#FFF8F0` | Lightest background |
| Peach 100 | `#FFE5B3` | Hero gradient start |
| Peach 200 | `#FFD699` | Light warm transition |
| Peach 300 | `#FFC093` | Soft peach field |
| Peach 400 | `#FFAA7A` | Warm highlight |
| Peach 500 | `#FF9A76` | Primary brand color |
| Peach 600 | `#FF8366` | Coral gradient stop and active state |
| Peach 700 | `#F88377` | Coral pink and primary gradient stop |
| Peach 800 | `#E6705F` | Darker interactive state |
| Peach 900 | `#CC5244` | Accessible dark coral |
| Text Dark | `#2D2D2D` | Primary text and dark surfaces |
| Text Gray | `#666666` | Secondary text on white |
| White | `#FFFFFF` | Cards, content canvas, inverse text |

Supporting identity colors:

- Google blue `#4285F4`, red `#DB4437`, yellow `#F4B400`, and green `#0F9D58` appear in the supplied GDG mark, Google word treatment, small confetti details, and limited icons.
- Georgia Tech gold and navy may appear in approved photography, campus imagery, and official assets, but they do not replace coral and peach as the dominant experience palette.
- Hero gradients run from `#FFE5B3` through `#FFC093` to `#FF8366`. Primary button gradients run from `#FF9A76` to `#F88377`. Body text remains solid.

Every actual pairing must be measured. White button text requires a dark enough gradient stop or shadowed surface to meet contrast. Normal text requires 4.5:1, large text 3:1, and non-text controls 3:1.

### 10.3 Typography

- Inter for display headings, body copy, controls, tables, and admin UI.
- Google Sans may be used when an approved licensed asset is supplied; SF Pro Display styling is an acceptable visual reference, not a distributable font dependency.
- Monospace only for code and technical identifiers.
- The supplied Google and chapter marks remain image assets and are never recreated with text fonts.

### 10.4 Approved signature elements

- Floating frosted-glass navigation with white translucency, subtle blur, thin white edge, and soft warm shadow.
- Hero background with peach clouds or atmospheric waves, approved Tech Tower or campus architecture on the right, and glossy floating 3D objects such as a coral torus, rounded abstract blob, faceted gem, beads, and Google-color confetti.
- A translucent hero copy panel on desktop with large sans-serif display type and two coral actions.
- Curved white section transitions that visually flow out of the hero.
- White event cards with image-first composition, coral date badges, coral-to-orange actions, soft warm shadows, and 14 to 18 pixel corner radii.
- Dark charcoal footer and admin sidebar with warm coral ambient glow and restrained Tech Tower line art or silhouette.
- Coral data visualization with green reserved for positive operational status.

### 10.5 Guardrails

- Do not replace the approved peach and coral direction with navy-and-gold editorial styling.
- Do not replace the 3D hero with a generic student stock photo.
- Do not invent or redraw Google, GDG, or Georgia Tech marks. Use supplied approved assets.
- Frosted glass belongs primarily to navigation and hero framing, not every card.
- 3D elements must frame the message and cannot obscure navigation, copy, or actions.
- Cards may repeat in the events grid because each represents a comparable event record, but spacing and image crops must remain deliberate.
- Avoid neon cyberpunk colors, blue-purple AI gradients, beige paper styling, and unrelated SaaS dashboard motifs.
- No motion that ignores reduced-motion preferences.
- No public-page visual treatment copied wholesale into admin tables and forms.

### 10.6 Layout and responsive behavior

- Mobile-first layouts from 320 CSS pixels.
- Content width and spacing tokens shared across pages.
- Desktop public navigation floats inside the hero with a maximum width near 1240 pixels.
- Mobile public navigation becomes a compact frosted bar with logo and menu button.
- Desktop event grids use three columns at large widths, two at tablet widths, and one on mobile.
- The mobile events page preserves the peach atmospheric header, coral display title, filter chips, image-first cards, and full-width registration actions.
- Admin navigation collapses without hiding current context.
- The desktop admin dashboard uses a persistent left sidebar, central analytics and operations canvas, and right recent-activity rail. The mobile dashboard converts charts and lists into a single-column sequence with a drawer navigation.
- Tables provide responsive columns, horizontal overflow where necessary, and a usable mobile alternative for critical actions.
- Tap targets are at least 44 by 44 CSS pixels where practical.

### 10.7 States and copy

Every data surface needs loading, empty, partial, success, error, permission-denied, offline, and stale states.

Errors must state what happened and the next valid action without exposing internal implementation or security detail.

### 10.8 Mandatory visual lock

The following requirements are non-negotiable:

- Public pages use the approved warm peach and coral world. They do not use navy and gold as the dominant interface palette.
- The homepage hero uses approved Georgia Tech architecture, peach atmosphere, glossy dimensional objects, a frosted navigation surface, and the specified hero copy panel. It is not replaced by a generic student photograph, abstract code illustration, flat geometric background, or standard split-layout landing page.
- The signature 3D language includes a pink-frosted donut with multicolor sprinkles, glossy pink star or faceted form, translucent coral or pink blob, peach crystal, small spheres or capsules, and restrained Google-color confetti. Equivalent assets may vary in exact pose, but not in identity, material, or visual role.
- Public content below the hero uses clean white or warm-white sections, coral actions, image-first event cards, soft warm depth, and deliberate curved transitions. It does not become an editorial newspaper layout, dark public site, beige paper theme, blue-purple AI gradient, or generic SaaS card wall.
- The footer remains dark charcoal with white text, coral action accents, and restrained Georgia Tech architectural line art or silhouette.
- Admin pages use the fixed charcoal architectural sidebar, white top bar, pale workspace, white operational panels, coral active states and charts, semantic status colors, and dense readable information hierarchy. Public 3D decorations do not appear inside admin work areas.
- Inter is the required distributable interface font. Approved licensed Google Sans may replace it. Serif display fonts, decorative scripts, and monospace branding are prohibited.
- Official marks are supplied assets. Agents must not redraw, approximate, typeset, recolor, or invent the GDG, Google, or Georgia Tech marks.
- Verified dates, times, venues, funding amounts, roles, registration counts, and organization figures may not be altered to make a mockup look fuller. Unknown data is omitted or labeled as pending.
- Accessibility changes may adjust contrast, focus treatment, type size, spacing, motion, or control structure. They may not replace the approved visual concept. When a visual reference conflicts with WCAG 2.1 AA, preserve the composition and repair the inaccessible token or interaction.
- Responsive implementation adapts the same design. It must not introduce a separate mobile art direction. Desktop prompts do not waive the mobile requirements in this PRD.
- An implementation agent must not generate or present competing design directions unless Tejas explicitly requests a redesign after this PRD version.

### 10.9 Desktop page and section contract

Each numbered prompt in `.docs/GDG_GT_UI_IMAGE_PROMPTS.md` is a standalone visual specification. The implementation mapping is mandatory:

| Prompt | Required implementation surface |
|---:|---|
| 1. Complete Homepage | Overall `/` composition and visual balance |
| 2. Navigation and Hero Section | Shared public navigation and homepage hero |
| 3. Homepage Statistics Section | Homepage metric transition and verified-stat treatment |
| 4. Homepage Upcoming Events Section | Homepage event preview section |
| 5. Desktop Footer | Shared public footer |
| 6. Events Listing Page | `/events` |
| 7. Individual Event Detail Page | `/events/:slug` |
| 8. Team Page | `/team` |
| 9. Resources Page | `/resources` |
| 10. Sponsors Page | `/sponsors` |
| 11. Gallery Page | `/gallery` |
| 12. Contact Page | `/contact` |
| 13. Admin Dashboard | `/admin` and the base admin shell |
| 14. Admin Events Management | `/admin/events` |
| 15. Admin Teams and Collaboration | `/admin/teams`, `/admin/team/:teamId`, `/admin/channels`, and `/admin/whiteboard` |
| 16. Admin Finances | `/admin/finances` |
| 17. Admin Communications and Newsletter | `/admin/communications` and `/admin/newsletter` |
| 18. Admin Content and Media | `/admin/content`, `/admin/media`, and `/admin/gallery` |
| 19. Admin Forms Library | `/admin/forms` |
| 20. Admin Visual Form Builder | `/admin/forms/:formId/edit` |
| 21. Public Form Experience | `/forms/:slug` |
| 22. Admin Form Responses and Analytics | `/admin/forms/:formId/responses` |

Admin routes without a dedicated numbered prompt inherit Prompt 13's shell, density, spacing, palette, sidebar, top bar, panels, states, and interaction treatment. Their route-specific workflows remain defined in Section 23.

The prompt images are visual targets, not sources of factual data. When prompt copy conflicts with verified CMS data or this PRD, preserve the prompt's layout and styling while rendering verified data. Do not invent records to fill the composition.

### 10.10 Visual acceptance requirements

- The first golden baseline is created only after side-by-side human review against the mapped standalone prompt, the master design prompt, and the design system. An implementation agent cannot approve its own initial baseline.
- Capture deterministic Playwright screenshots for every surface in Section 10.9 at 1920 by 1080 and 1440 by 900. Pages taller than the viewport also require a full-page capture.
- Use stable fixtures, fixed clocks, deterministic animation state, local approved assets, and masked volatile identifiers so screenshot comparison is meaningful.
- The implementation must preserve the mapped prompt's section order, dominant color balance, navigation form, hero composition, card hierarchy, footer treatment, admin shell, and primary action placement.
- Automated visual comparison must stay within a 1 percent changed-pixel threshold after approved masks in a pinned Playwright Chromium version running in the pinned CI container. Safari, Firefox, mobile browsers, operating systems, and GPU configurations remain required for functional and manual visual review but do not share this cross-engine pixel threshold. Any intentional difference requires a reviewed baseline update with a written reason.
- Manual review must confirm that no prohibited substitution from Sections 10.5 or 10.8 appears, typography and spacing are consistent, imagery is approved, content is not clipped, and all interactive elements remain legible.
- Tejas must approve the staging visual review before Phase 6 exits and before production launch. Passing functional tests alone does not satisfy the design contract.

## 11. PWA, offline, and push

### 11.1 Installation

**PWA-001:** Use `vite-plugin-pwa` or an equivalent maintained Workbox integration.

**PWA-002:** Replace the PSU manifest with GT name, short name, description, icons, colors, display behavior, scope, and shortcuts.

**PWA-003:** Remove service worker unregistration and register the production worker deliberately.

**PWA-004:** Installation must work on supported Chromium browsers, Android, and iOS Safari's supported Add to Home Screen flow.

### 11.2 Cache policy

May cache:

- Versioned JavaScript and CSS
- Fonts and icons
- Approved public images
- Public shell and offline fallback
- Explicit public event responses only after a security review

Must not cache:

- Any `/api/*` response by default
- Gate, gate-status, session, CSRF, or authorization responses
- Admin HTML or data
- Finance, internal messages, channels, private whiteboards, audit logs, subscriber lists, or security data
- Signed private storage URLs
- Form definitions behind unlisted, invite, verified-email, or internal access; form drafts, responses, uploads, analytics, exports, and any URL containing a form access, resume, or edit token
- Responses carrying `Set-Cookie`

The worker must respect logout and version upgrades. Cache keys include application version where appropriate.

### 11.3 Offline queue

Supported queued actions:

- Event registration
- Newsletter signup

Native Forms submissions are not queued for background submission in v1.5. A form may save a local or server resume draft when the form owner enables that feature, but the final response requires an online server commit.

Requirements:

- IndexedDB, not localStorage.
- Minimum necessary payload.
- Client-generated idempotency key.
- Visible `Pending submission` state.
- Never show `Registered` until the server accepts the registration.
- Retry network failures and 5xx responses only.
- Do not retry validation, conflict, capacity, authorization, or other 4xx responses automatically.
- Bounded exponential backoff.
- Expire entries after 48 hours.
- Permanent failure state with reason and recovery action.
- Manual retry and discard.
- Clear user-scoped entries on logout.
- Attempt replay on application startup, service-worker startup, the browser `online` event, and explicit manual retry. Background Sync may be used where supported, but the product must not promise replay while an iOS app is closed.

### 11.4 Push notifications

**PUSH-001:** Permission is requested only after an explicit user action.

**PUSH-002:** Subscriptions belong to either a valid admin session or a verified event registration token.

**PUSH-003:** `/api/push/subscribe` derives identity and scope on the server. It does not trust a submitted user ID or email without verification.

**PUSH-004:** Store endpoint and encryption keys securely with created, updated, revoked, and failure timestamps.

**PUSH-005:** VAPID public key may be exposed. VAPID private key is server-only.

**PUSH-006:** Event reminders are sent 24 hours before the event using an idempotent scheduled job.

**PUSH-007:** Expired or invalid subscriptions are disabled after provider failure.

**PUSH-008:** Notification clicks open the canonical event page.

**PUSH-009:** On iOS and iPadOS, the UI explains that Web Push requires the site to be added to the Home Screen. The permission prompt is triggered only by a direct user interaction from the installed web app. Unsupported contexts show instructions, not a broken permission action.

## 12. Accessibility, performance, SEO, and compatibility

### 12.1 Accessibility

- WCAG 2.1 AA is required.
- Lighthouse accessibility target is 100 on defined representative pages.
- No critical or serious axe violations.
- Complete keyboard access and visible focus.
- Semantic landmarks and headings.
- Accessible names for icon-only controls.
- Dialog focus trap, return focus, escape behavior, and scroll control.
- Status messages announced through appropriate live regions.
- Form errors associated with fields.
- Reduced-motion support.
- Manual screen-reader testing for public registration, public Forms completion, the Forms builder, response review, and core admin workflows.

### 12.2 Performance

Measured at the 75th percentile on the agreed mobile profile:

- LCP at or below 2.5 seconds.
- INP at or below 200 milliseconds.
- CLS at or below 0.1.
- Public Lighthouse performance at or above 90 on representative pages.
- Route-level code splitting for admin, 3D, charts, and whiteboard code.
- 3D effects disabled or simplified on reduced-motion, data-saver, low-memory, or low-capability contexts.
- Images sized and compressed before upload or through a controlled transformation pipeline.

### 12.3 SEO

- Unique title and description for every public route.
- Canonical URL per page.
- Organization and Event structured data where valid.
- Open Graph and social image metadata.
- Sitemap includes only enabled public routes.
- RSS is removed or limited to an intentionally supported public content type. It must not expose private blog content.
- Disabled Blog and Projects routes are excluded from indexing and return 404, not a soft 200.
- Public Forms are excluded from the sitemap by default. A form may be indexed only when its access mode is public, its owner explicitly enables indexing, it has a stable public description, and it contains no sensitive or short-lived purpose. Unlisted, token, verified-email, invited, internal, draft, closed, and archived forms always send `noindex` and remain absent from the sitemap.

### 12.4 Browser support

Current stable and previous major versions of:

- Chrome
- Edge
- Firefox
- Safari
- iOS Safari
- Android Chrome

PWA behavior may vary by platform, but core web workflows must remain functional without installation or push permission.

## 13. Testing strategy

### 13.1 Tooling

- Vitest
- React Testing Library
- Playwright
- `@axe-core/playwright`
- SQL or pgTAP-style database security tests
- Controlled test Supabase project or local disposable database

### 13.2 Required suites

**Security**

- Gate secret non-disclosure
- Gate rate limiting
- Gate cookie flags and expiry
- Login blocked without gate
- Session token hashing and revocation
- Forged cookie rejection
- Disabled-account rejection
- CSRF success and failure
- Every role and permission boundary
- Team and resource scope boundaries
- RLS anonymous read matrix
- Anonymous write denial
- Service-role non-exposure
- Email endpoint authorization
- Storage access matrix
- Form discovery, collaborator, response, export, upload, resume-token, and edit-token authorization boundaries
- PWA cache exclusion

**Functional**

- Every public route
- All 26 preserved protected admin routes plus the three new Forms admin routes
- Public invite flow
- Event CRUD, detail, registration, capacity, duplicate, attendance, and email
- Team, permission, transfer, and invitation workflows
- Finance state machine and attachments
- Newsletter subscribe, confirm, unsubscribe, campaign, and scheduling
- Communications, tasks, channels, notifications, and whiteboards
- Media and content workflows
- Blog and Projects admin workflows
- Blog and Projects public 404 behavior
- Maintenance and site status
- Linktree profiles and click tracking
- Forms library, builder, validation, branching, versioning, access modes, publication, response submission, uploads, response views, charts, exports, collaborators, and retention

**PWA**

- Manifest validity
- Service worker lifecycle and upgrades
- Offline fallback
- Safe cache inventory
- Offline queue success, conflict, expiry, retry, and discard
- Push subscribe, unsubscribe, delivery, click, and failure cleanup

**Accessibility**

- Automated axe on representative routes
- Keyboard-only critical paths
- Focus management
- Forms and validation
- Color contrast
- Manual screen-reader runs

**Visual contract**

- Screenshot coverage for every mapped surface in Section 10.9
- Desktop viewport coverage at 1920 by 1080 and 1440 by 900
- Full-page captures for scrolling public pages
- Approved visual-baseline comparison with deterministic fixtures
- Manual review against the design lock in Sections 10.5 and 10.8
- Regression checks for navigation, hero, event cards, footer, admin shell, charts, drawers, forms, tables, empty states, and permission states

### 13.3 Coverage and CI gates

- Security-critical server modules: at least 90 percent branch coverage.
- Overall unit and integration coverage: at least 70 percent, without excluding core logic to inflate results.
- All security, database policy, and critical-path E2E tests are blocking.
- CI runs lint, TypeScript, unit, integration, database security, production build, and Playwright smoke tests on every pull request.
- Full browser and accessibility suites run before staging promotion and launch.

## 14. Infrastructure and environments

### 14.1 Environments

- Local development
- Isolated test
- Staging
- Production

Each environment has separate Supabase configuration, secrets, rate-limit namespaces, storage, and email safety controls.

### 14.2 Environment variables

Browser-safe:

- `VITE_SUPABASE_URL` only if the Realtime client requires it
- `VITE_SUPABASE_PUBLISHABLE_KEY` only as the transport key for scoped Realtime authentication and signed-upload transport, never as application authorization. A legacy `VITE_SUPABASE_ANON_KEY` may be used only during migration and must have the same limited role.
- `VITE_VAPID_PUBLIC_KEY`
- Public canonical origin if needed

Server-only:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`, preferred for new projects. A legacy `SUPABASE_SERVICE_ROLE_KEY` may be used temporarily with identical server-only handling.
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `FROM_NAME`
- `ADMIN_GATE_SECRET_HASH`
- Session hashing or signing secret if required by implementation
- `VAPID_PRIVATE_KEY`
- `CRON_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- Supabase JWT signing material required only for short-lived Realtime tokens

No secret uses a `VITE_` prefix.

### 14.3 Domains

Planning target:

- Canonical domain: `gdggt.dev`
- Redirect domain: `gdgatgt.dev`

Domain ownership is not assumed by this PRD. Purchase or control, DNS, HTTPS, email DNS, redirect behavior, and canonical metadata are launch prerequisites.

### 14.4 Required platform choices

| Concern | Required implementation |
|---|---|
| Application hosting | Vercel or equivalent for the React application and lightweight same-origin APIs |
| Database, private storage, Realtime | Separate GT Supabase projects per approved environment |
| Large uploads | Direct signed upload to private Supabase Storage; never proxy files above 4.5 MB through a Vercel Function |
| Frequent schedules | Supabase Cron with `pg_cron` and `pg_net`, or an equivalently precise paid scheduler; Vercel Hobby cron is insufficient for 5- and 15-minute jobs |
| Durable background work | Supabase Queues or equivalent durable queue for malware scan, large export, and retried delivery jobs |
| Malware scanning | Isolated external scanner or worker consuming the durable queue; do not run a heavyweight antivirus engine inside a Supabase Edge Function |
| Realtime identity | Five-minute server-issued custom JWT, preferably signed with imported asymmetric signing material, applied with the Realtime client's token API |
| Browser API key | Supabase publishable key; legacy anon key only during controlled migration |
| Server API key | Supabase secret key in a dedicated server client; legacy service-role key only during controlled migration |

Provider substitutions are allowed only when they preserve the same security properties, timing guarantees, regional requirements, operational visibility, and documented failure behavior.

## 15. Implementation plan

### Phase 0. Reproducible source baseline

**Deliverables**

- Disposable database reconstruction
- Final source schema catalog
- Missing `event_attendance` and RPC reconstruction
- Effective grants and policy report
- Canonical GT baseline migration plan
- Confirmed source build after dependency installation in a controlled environment
- Baseline lint report reduced to zero errors
- Production dependency vulnerability remediation plan with owners and accepted exceptions
- Bundle composition report with route-level splitting plan

**Exit gate:** An empty database can be created deterministically, TypeScript and the production build pass, ESLint has zero errors, and every high or critical production dependency finding has a documented upgrade, replacement, mitigation, or time-bounded acceptance owner.

### Phase 1. GT infrastructure

**Deliverables**

- Separate GT repository state
- New Supabase projects for test, staging, and production as approved
- New Vercel projects or environments
- Server-only secret configuration
- Canonical and redirect domain plan
- CI skeleton

**Exit gate:** Staging deploys a minimal app without PSU production data or exposed secrets.

### Phase 2. Database and storage foundation

**Deliverables**

- Canonical GT baseline migration
- Repaired event attendance schema
- Repaired function inventory
- Public and private storage separation
- Server-only application-table grants and deny-by-default browser access
- Deny-by-default protected data policies
- GT-only seed data

**Exit gate:** Database security tests pass and all expected row counts are zero except approved seeds.

### Phase 3. Gate, session, CSRF, and authorization

**Deliverables**

- Server-side footer gate
- Shared rate limiting
- Opaque database-backed sessions
- Session-bound CSRF
- Authorization middleware
- Audit context
- Protected API pattern

**Exit gate:** Critical authentication, session, CSRF, and authorization tests pass.

### Phase 4. Protected service migration

**Deliverables**

- Replace protected direct browser mutations and private reads with server APIs
- Apply action and resource permission checks
- Secure Edge Functions and email operations
- Preserve realtime behavior through an authorized design

**Exit gate:** No protected workflow depends on permissive anon table access.

### Phase 5. Core feature parity

**Deliverables**

- All 26 preserved protected routes functional
- Teams and permissions
- Communications and collaboration
- Finances
- Newsletter administration
- Media and content
- Linktree
- Site status
- Audit and security views

**Exit gate:** Role-based E2E suite passes for every admin route and critical workflow.

### Phase 6. GT rebrand and public redesign

**Deliverables**

- Approved peach, coral, orange, charcoal, and Google-color token system
- Inter, with approved Google Sans where available
- Responsive public templates
- Approved branded admin shell with charcoal architectural sidebar, coral analytics, and responsive mobile layout
- Exact implementation of the page and section mapping in Section 10.9
- Deterministic desktop visual-regression baselines at 1920 by 1080 and 1440 by 900
- All PSU text, domains, recipients, logos, metadata, defaults, and examples removed
- Approved logo and brand usage

**Exit gate:** Content scan finds no unapproved PSU reference, accessibility design checks pass, all Section 10.10 visual checks pass, and Tejas approves the staging visual review.

### Phase 7. Event enhancement

**Deliverables**

- Event slugs
- `/events/:slug`
- Sorting and filters
- Atomic registration
- Capacity and duplicate protection
- Attendance workflow
- Metadata and calendar actions

**Exit gate:** Concurrency, capacity, duplicate, offline, and accessibility tests pass.

### Phase 8. Native Forms platform

**Deliverables**

- Forms database schema, immutable version model, retention rules, and private upload bucket
- Forms permission actions, ownership, team scope, collaborators, and audit coverage
- Form library and approved templates
- Accessible visual builder with sections, supported field types, validation, branching, autosave, preview, settings, and publishing
- Public form runtime with access modes, save and resume, response editing, atomic submission, limits, and confirmation
- Signed direct file uploads, quarantine, asynchronous malware scanning, and cleanup
- Summary, table, and individual response views
- CSV, XLSX, and JSON exports with background jobs for large datasets
- Notifications and internal event, team, and campaign form references
- Exact implementation of Prompts 19 through 22

**Exit gate:** All `FORM-TEST` cases pass, visual baselines 19 through 22 are approved, concurrency tests prove response limits, and no public or cross-team response disclosure is possible.

### Phase 9. Blog and Projects private configuration

**Deliverables**

- Remove public routes and links
- Remove sitemap and RSS exposure
- Remove homepage exposure
- Private storage and table policies
- Preserve all authorized admin workflows

**Exit gate:** Public 404 and admin functional tests pass.

### Phase 10. PWA and offline

**Deliverables**

- Valid manifest and icons
- Service worker lifecycle
- Public cache policy
- Offline fallback
- IndexedDB queue
- Queue status and recovery UI

**Exit gate:** Installability, offline, queue, upgrade, logout, and cache-security tests pass.

### Phase 11. Push notifications

**Deliverables**

- VAPID configuration
- Subscription and unsubscribe APIs
- Verified attendee binding
- Reminder scheduler
- Delivery logging and cleanup

**Exit gate:** Supported-device delivery and failure tests pass.

### Phase 12. Quality hardening

**Deliverables**

- Performance optimization
- Accessibility remediation
- Browser and real-device testing
- Load and concurrency tests
- Security review
- Operational documentation

**Exit gate:** All quality targets and blocking tests pass on staging.

### Phase 13. Launch

**Deliverables**

- Production secrets and DNS
- Monitoring and alerts
- Database backup and restore proof
- Deployment and rollback runbooks
- Production smoke tests
- 24 to 48 hour monitored release

**Exit gate:** All launch gates below are signed off.

## 16. Launch gates

### 16.1 Security gates

- Gate secret never reaches the browser.
- Gate rate limiting works across instances.
- Session cookie is opaque, HttpOnly, Secure, and server-validated.
- Unsigned identity cookies are absent.
- CSRF works on every protected mutation.
- All protected actions enforce server permissions.
- No protected service relies on anonymous direct table access.
- RLS and grants pass the complete anonymous-access matrix.
- Service-role and provider secrets are absent from client bundles.
- Email and scheduled functions require correct authorization.
- Private storage is inaccessible without short-lived authorization.
- PWA cache contains no protected data.
- All critical and high security findings are closed.

### 16.2 Functional gates

- All 26 preserved protected admin route workflows and all three new Forms admin routes pass.
- Public invite flow passes.
- Event publishing, detail, registration, capacity, attendance, and email pass.
- Newsletter subscribe, confirm, unsubscribe, campaign, and scheduling pass.
- Team, permission, communication, channel, whiteboard, and finance workflows pass.
- Content, sponsors, resources, gallery, media, Linktree, site status, and audit workflows pass.
- Forms building, branching, publishing, access control, submissions, file uploads, response analysis, exports, and retention workflows pass.
- Blog and Projects admin workflows pass.
- Public Blog and Projects routes return 404.
- PWA installation, offline queue, and push reminders pass on supported platforms.

### 16.3 Data gates

- Canonical migration applies to an empty database.
- No PSU production data exists in any GT environment.
- No sample default credentials remain.
- GT seed data is approved.
- Initial Super Admin is created securely.
- Backup and restore are tested.

### 16.4 Quality gates

- WCAG 2.1 AA manual review passes.
- Lighthouse accessibility is 100 on representative routes.
- No critical or serious axe issues remain.
- Core Web Vitals meet targets.
- Supported browser matrix passes.
- Production build, lint, TypeScript, tests, and CI pass.
- Monitoring, alerting, and rollback are active.
- Georgia Tech and Google brand usage is approved for launch.

### 16.5 Design fidelity gates

- Every surface in Section 10.9 has an approved deterministic screenshot baseline, including the Forms library, builder, public respondent experience, and response workspace.
- Public pages preserve the approved peach and coral visual world, glossy 3D hero language, frosted navigation, white content sections, rounded event cards, and dark architectural footer.
- Admin pages preserve the charcoal architectural sidebar, white header, pale workspace, coral active states and charts, white operational panels, and route-appropriate information density.
- No navy editorial redesign, generic SaaS template, dark public theme, blue-purple AI gradient, photography-first replacement hero, or invented brand mark appears anywhere.
- Desktop screenshots at 1920 by 1080 and 1440 by 900 pass the approved visual threshold.
- Responsive layouts preserve the same design identity without clipped text, hidden controls, overlapping content, or desktop-only interaction assumptions.
- Tejas has approved the final staging visuals. This approval is blocking and cannot be inferred from functional acceptance.

## 17. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Historical migrations do not reproduce live schema | Missing or broken functionality | Canonical reconstruction in disposable database before GT infrastructure |
| Direct Supabase access is deeply distributed | Authorization bypass | Shared protected API layer and service migration by subsystem |
| Custom sessions are currently forgeable | Account takeover | Opaque token, hashed server record, per-request validation, revocation tests |
| Realtime features assume permissive RLS | Private data exposure or feature regression | Authorized Realtime design and scoped integration tests |
| Email functions can be abused | Cost and reputation damage | Server permission checks, workflow binding, rate limits, recipient constraints |
| Offline queue creates duplicate actions | Duplicate registrations or signups | Idempotency keys, unique constraints, server conflict handling |
| PWA caches sensitive data | Persistent privacy breach | Deny-by-default runtime cache policy and automated cache inspection |
| Complex form logic diverges between builder, browser, and server | Invalid or missing response data | One versioned schema and one shared logic evaluator with server revalidation and parity tests |
| Form uploads introduce malware or unauthorized file disclosure | Device compromise or privacy breach | Signed single-object upload, quarantine bucket, asynchronous scanning, protected download, and orphan cleanup |
| High-volume forms exceed server request or export limits | Failed submissions or unavailable data | Direct signed uploads, atomic response transactions, pagination, queue-backed exports, and load tests |
| 3D and animation hurt mobile performance | Poor UX and Core Web Vitals | Capability detection, lazy loading, reduced-motion and low-power fallbacks |
| Blog and Projects remain accidentally discoverable | Scope violation | Router, sitemap, RSS, nav, homepage, RLS, and E2E checks |
| An implementation agent reinterprets the approved design | Brand and product mismatch | Mandatory source precedence, route-to-prompt mapping, visual regression, prohibited substitutions, and explicit Tejas sign-off |
| Scope breadth threatens schedule | Incomplete or unsafe launch | Dependency-based phases and blocking exit gates, not silent scope reduction |

## 18. Decision register

| Decision | Status |
|---|---|
| Migration, not from-scratch rewrite | Final |
| Preserve full admin scope | Final |
| Keep custom sessions | Final |
| Preserve footer secret-code interaction | Final |
| Validate gate only on server | Final |
| Manual single-code rotation | Final |
| Blog and Projects private, admin retained | Final |
| Zero PSU production data | Final |
| Public design glossy and expressive, admin operational and coral-accented | Final |
| Inter, with approved Google Sans where available | Final |
| Peach, coral, orange, charcoal, and supplied Google/GT brand assets | Final |
| `.docs/FINAL_DESIGN_PROMPTS.md` defines the master public aesthetic | Final |
| `.docs/DESIGN_SYSTEM.md` defines reusable visual tokens and components | Final |
| `.docs/GDG_GT_UI_IMAGE_PROMPTS.md` defines mandatory desktop page and section composition | Final |
| Alternate visual concepts require explicit approval and a PRD revision | Final |
| PWA, offline queue, and push included | Final |
| Native Forms is first-party and not an external provider embed | Final |
| Published form definitions are immutable and responses bind to exact versions | Final |
| Native Forms final submissions require an online server commit in v1.5 | Final |
| Canonical domain planned as `gdggt.dev` | Pending domain control |
| `gdgatgt.dev` redirects to canonical | Pending domain control |
| Exact logo assets and usage | Pending brand approval |

## 19. Requirement traceability summary

| Requirement family | Primary implementation | Blocking verification |
|---|---|---|
| AUTH | Gate, session, account APIs | Security unit and E2E |
| SEC | Middleware, protected APIs, RLS | Policy matrix and authorization E2E |
| CSRF | Session-bound token service | Mutation rejection and acceptance tests |
| EVT | Event pages, registration transaction, attendance | Concurrency and workflow E2E |
| TEAM | Team APIs and permission engine | Role and scope matrix |
| COMM | Communications, Realtime, email | Permission and delivery tests |
| FIN | Finance state machine and private storage | Transition, scope, and audit tests |
| NEWS | Public tokens and admin campaign APIs | Double opt-in and send authorization |
| CONTENT | CMS, media, sponsors, resources | Publication and storage matrix |
| FORM | Builder, public runtime, response data, uploads, exports | Logic parity, concurrency, authorization, accessibility, and E2E |
| BLOG | Private admin system | Public 404 plus admin workflows |
| PROJ | Private admin system | Public 404 plus admin workflows |
| PWA | Workbox, IndexedDB, queue UI | Install, offline, retry, cache inspection |
| PUSH | Subscription APIs and scheduler | Delivery, idempotency, cleanup |
| A11Y | Components and content | axe plus manual testing |
| PERF | Bundles, images, 3D fallbacks | Lighthouse and field-ready profiles |
| VIS | Approved public and admin visual contract | Deterministic screenshots, visual diff, manual review, and Tejas sign-off |

## 20. Final readiness

### PRD readiness

**Ready for direct implementation.**

The scope, user roles, public and admin information architecture, security boundary, major workflows, target experience, PWA behavior, test strategy, migration process, phases, and launch gates are defined.

### Implementation readiness

**Ready to begin Phase 0.**

No additional product decisions are required for the defined scope. Phase 0 is the first required implementation phase and must produce the canonical reproducible schema before feature migration proceeds.

### Launch readiness

**Blocked.**

Launch remains blocked until every security, functional, data, and quality gate in Section 16 passes.

---

## 21. Normative implementation conventions

### 21.1 Requirement language

- **Must** and **required** are launch-blocking.
- **Should** is required unless a documented technical reason is approved in the decision register.
- **May** is optional and cannot delay launch.
- Source behavior is preserved only when it does not conflict with this PRD, security requirements, accessibility, or data isolation.

### 21.2 Technical conventions

| Concern | Required convention |
|---|---|
| IDs | UUID generated server-side or by PostgreSQL |
| Time | Store UTC `timestamptz`; render in the event or viewer timezone |
| Date-only values | PostgreSQL `date`, never a midnight timestamp |
| Money | PostgreSQL `numeric(12,2)` plus ISO 4217 currency code; never floating point |
| Email | Trim, normalize to lowercase for uniqueness, retain original display casing only if needed |
| Slugs | Lowercase ASCII, hyphenated, unique, immutable after publication unless a redirect is created |
| Deletion | Soft-delete records referenced by audit, finance, messages, or registrations; hard-delete only disposable drafts and orphaned uploads |
| Pagination | Cursor-based for messages, audit, media, and activity; page-based is acceptable for small admin lists |
| Sorting | Explicit allowlist of fields and directions; never interpolate client SQL identifiers |
| Search | Server-side normalized search with a bounded query length |
| Validation | Shared Zod schemas at API boundaries and form-level validation for immediate feedback |
| Responses | JSON envelope defined in Section 25.1 |
| Correlation | Every API response carries `X-Request-ID`; audit and server logs use the same ID |
| API version | All new endpoints live under `/api/v1` |

### 21.3 Repository rules

- Existing React components may be migrated incrementally, but direct browser data services must be replaced by typed API clients.
- One shared authorization module owns role, team, route, action, and resource decisions.
- One shared sanitizer owns rich-text, Markdown, URL, and embed rules.
- One shared email module owns templates, sender identity, unsubscribe behavior, and provider calls.
- One shared storage module owns MIME detection, size limits, object keys, signed URLs, and deletion.
- Secrets are read only in server modules. Browser bundles must fail CI if known server variable names or secret patterns appear.
- The orphan `AdminSettings.tsx` page is not added as a new route. Gate rotation and account security live in a Super Admin security section of `/admin/users`.
- The orphan `Index.tsx` page is removed or excluded from the production bundle.

## 22. Public page build specifications

### 22.1 Shared public shell

The public shell contains a skip link, Georgia Tech chapter logo lockup, primary navigation, visible current-page state, mobile menu, maintenance banner when applicable, footer, newsletter field, social links, privacy link, accessibility link, and contact link.

The shared shell visually implements Prompts 2 and 5 from `.docs/GDG_GT_UI_IMAGE_PROMPTS.md`. Every route-specific public page implements its mapped prompt from Section 10.9. These prompts determine composition and art direction; the requirements below determine behavior, data, accessibility, and states. Neither source may be discarded in favor of an alternate template.

The first visible reference on each entry page uses the full name, “Google Developer Group on Campus at Georgia Institute of Technology.” Compact “GDG@GT” labeling may follow. Public navigation contains Home, Events, Team, Resources, Sponsors, Gallery, and Contact.

Navigation must work with keyboard, touch, 200 percent zoom, JavaScript-disabled fallback links where feasible, and reduced motion. The mobile menu traps focus while open, restores focus on close, and closes on Escape and route change.

### 22.2 Homepage `/`

**Purpose:** Establish identity and move visitors toward events or participation.

**Required order:**

1. Full-bleed peach and coral atmospheric hero with floating frosted navigation, supplied GDG logo, approved Georgia Tech architecture, glossy 3D forms, full organization identity, primary CTA to `/events`, and secondary CTA to `/contact?type=join`.
2. A curved transition into up to four public chapter metrics using real CMS-approved values only. Hide any metric with no verified data instead of displaying zero or invented values.
3. `Upcoming Events` with up to three image-first event cards ordered by `start_at`, coral date badges, metadata, and registration or detail actions.
4. Short mission and community section grounded in builders, learning, and impact at Georgia Tech.
5. Selected active team profiles or a link to `/team`.
6. Sponsor acknowledgment only when active sponsor records exist.
7. Dark charcoal footer with newsletter workflow, quick links, social links, and restrained Georgia Tech architectural line art.

**Data contract:** `GET /api/v1/public/home` returns only active CMS sections, the next three events, approved public metrics, selected team members, active sponsors, navigation, footer, and social links.

**States:** Skeletons preserve layout. Empty optional sections disappear cleanly. A public-data failure shows the static identity, navigation, CTAs, and a retry affordance rather than a blank page.

### 22.3 Events listing `/events`

**Required controls:** Search, upcoming/past status, event type, difficulty level, sort, and reset. Sort options are soonest, newest, title A to Z, and registration availability. Filters are URL query parameters and survive refresh and sharing.

**Event result:** Image-first rounded card with safe fallback, coral date badge, title, start date and time, timezone, location or online label, type, level, short description, registration state, and full-width link to `/events/:slug`.

**Visual layout:** The desktop page uses the approved peach wave background, a faint approved Tech Tower image, large coral display title, pill filters, and a three-column grid. Mobile uses the same header identity and single-column cards with horizontally scrollable filter chips. This page must not be converted into a navy editorial schedule list.

**Rules:** Only `published` events are public. Default view is upcoming, soonest first. Past events remain accessible. Results paginate. A full, closed, cancelled, or ended event never shows an active registration action.

### 22.4 Event detail `/events/:slug`

**Required content:** Title, image, status, local date and time, explicit timezone, location and room or online link, description, prerequisites, learning outcomes, what to bring, schedule, additional information, contact information, level, type, capacity state, registration control, calendar download, canonical share link, and up to three related upcoming events.

**Registration fields:** Name, email, optional notes, consent checkbox, bot-trap field, and idempotency key. There is no waitlist in v1.5. A full event returns `EVENT_FULL` and offers other events.

**SEO:** Canonical URL, title, description, Open Graph image, Twitter card, and schema.org `Event` JSON-LD. Cancelled and rescheduled state must be represented accurately.

**Calendar:** `.ics` output uses UTC timestamps plus timezone metadata, escaped text, stable UID, canonical URL, and updated sequence.

### 22.5 Team `/team`

Show only active public profiles, grouped by `team_section` and ordered by `order_index`. Each profile may show name, role, photo, short bio, LinkedIn, and GitHub. Email appears only when explicitly marked public. Missing photos use a consistent initials treatment. No automatic placeholder email is displayed.

### 22.6 Resources `/resources`

Show active resources with search, type, level, status, and tag filters. Supported source types remain study jam, cloud credit, documentation, and recording. External links use HTTPS, `noopener`, `noreferrer`, and a visible external-link indicator. View counts increment through a rate-limited endpoint and never block navigation.

### 22.7 Sponsors `/sponsors`

Show active tiers in configured order, active sponsors grouped by tier, and active impact statistics. Sponsor logos preserve aspect ratio and have meaningful alt text. The “Become a Sponsor” action opens the contact page with sponsorship preselected. No tier is rendered when it has no sponsor and no explanatory content.

### 22.8 Gallery `/gallery`

Use public image records from `media_files` where `is_public=true`. Support event filter, responsive masonry or varied editorial layout, progressive image sizes, lazy loading, keyboard-accessible lightbox, previous/next controls, caption, alt text, event association, and direct-image download only when allowed.

The public page never exposes storage object keys for private files. Video, audio, archive, and document files are excluded from the gallery.

### 22.9 Contact `/contact`

Fields are name, email, inquiry type, message, optional interests, and optional approved attachment. Inquiry types are general, membership, event, sponsorship, speaker, and accessibility.

Name is 2 to 100 characters. Message is 20 to 5,000 characters. Attachments are optional PDF, PNG, JPEG, or WebP up to 10 MB. Attachments use a signed direct upload to private quarantine because they exceed the serverless request-body limit. The endpoint applies honeypot, shared rate limiting, server validation, malware-safe file handling, and redacted logging.

Success creates a `contact_submissions` record, sends an acknowledgment to the submitter, and sends a structured notification to the configured chapter address. Email failure does not delete the submission; it creates a retryable delivery job.

### 22.10 Linktree `/l/:username`

Show only active profiles and active links in `sort_order`. Record analytics without storing raw IP addresses. Supported embeds are Google Forms and YouTube only in v1.5. All other links open externally. Unknown or inactive profiles return the branded 404 without revealing whether a private profile exists.

### 22.11 Native form `/forms/:slug`

**Purpose:** Let a respondent complete a chapter form entirely inside the website with clear progress, strong accessibility, and no exposure of admin or response data.

**Required composition:** Use Prompt 21. The page keeps the floating frosted public navigation, a compact peach atmospheric header, and a centered 720 to 820 pixel opaque white form panel. The form panel contains title, description, access or closed state, section heading, progress, visible fields, validation, privacy notice, back or next controls, save-and-resume control when enabled, and the final coral-gradient submit action. Public 3D objects remain restrained around the page background and never appear behind fields.

**Runtime rules:** Fetch only the current published version permitted by the access mode. Render fields from the immutable schema. Evaluate visibility and branching deterministically. On section change, focus the new section heading. On validation failure, show a summary and focus the first invalid field. Preserve entered values when moving backward unless a field becomes hidden and the form policy explicitly clears it.

**States:** Loading skeleton, invalid or expired access token, not yet open, closed, response limit reached, already responded, upload scanning, resumable draft restored, offline draft available, validation failure, submitting, committed success, and recoverable server failure. Draft or internal forms return the branded 404 to unauthorized users.

**Submission:** A final response requires network access. The browser may save a resume draft but does not show success until the server atomically commits the response. Refreshing or retrying the same idempotency key returns the prior safe result.

### 22.12 Newsletter token routes

`/newsletter/confirm` and `/newsletter/unsubscribe` render token validation state first, then perform state change with a POST action. Tokens are single-purpose, stored as hashes, expire, and are safe to retry. Responses never reveal whether an arbitrary email is subscribed.

### 22.13 Offline, maintenance, and 404

- `/offline` explains exactly which cached content remains available and lists queued submissions.
- `/maintenance` displays the configured message and safe public links. Admin access remains available through the normal gated flow.
- The 404 page offers Home and Events and never redirects automatically.
- `/blog`, `/blog/:slug`, and `/projects` use this same 404 response with HTTP status 404 at the hosting edge where supported.

## 23. Admin page build specifications

All admin screens use the same application shell, breadcrumb or clear back path, current page title, permission-aware primary action, notification access, user menu, session-expiry handling, loading skeleton, actionable empty state, inline validation, destructive confirmation, and success/error toast behavior. Tables retain filters in the URL when useful.

Prompt 13 in `.docs/GDG_GT_UI_IMAGE_PROMPTS.md` is the mandatory shell and dashboard composition. Prompts 14 through 20 and Prompt 22 are mandatory for their mapped admin route groups in Section 10.9. Prompt 21 is mandatory for the public Forms route. Admin pages without a dedicated prompt inherit Prompt 13 and may change only the route-specific content area required by the table below.

The approved desktop shell uses a charcoal left sidebar with coral active state and warm Georgia Tech architectural artwork, a white search and account header, a pale gray workspace, four compact coral-accent metric cards, two primary chart panels, operational lists below, and a right recent-activity rail. The mobile shell uses a drawer for navigation and sequences the same information into one column without shrinking desktop charts or tables.

| Route | Required workflow and data | Completion acceptance |
|---|---|---|
| `/admin` | Personal overview, permitted aggregate metrics, assigned tasks, unread messages, teams, pending approvals, recent activity, quick actions | Every widget respects action and team scope; one failed widget does not fail the page |
| `/admin/content` | Site settings, homepage sections, contact content, navigation, social links, footer, event-page labels, draft preview, publish | Secret settings are absent; published public content invalidates edge cache |
| `/admin/events` | Create, edit, duplicate, publish, cancel, archive, attendee list, check-in, CSV export, attendee email | Capacity and date rules validate server-side; email is audience-bound to the event |
| `/admin/team` | Public profile CRUD, ordering, active state, profile/member linkage | Public preview matches `/team`; placeholder emails are prohibited |
| `/admin/projects` | Private project CRUD, members, status, links, tags, statistics | No public route or anonymous data exposure |
| `/admin/members` | Community member CRUD, category, academic fields, interests, active state, profile synchronization | Duplicate email prevention and explicit merge review |
| `/admin/resources` | Resource CRUD, status, type, level, tags, ordering, active toggle | URL validation and public preview pass |
| `/admin/newsletter` | Subscribers, pending confirmation, templates, campaign draft, preview, schedule, send, delivery result | Send requires final confirmation, immutable recipient snapshot, and idempotency |
| `/admin/blog` | Posts, categories, approvals, comments, submissions, analytics | Blog remains non-public; HTML sanitization and editor ownership enforced |
| `/admin/users` | Account CRUD, roles, activation, reset, security metrics, gate rotation, revoke sessions | Super Admin restrictions and self-lockout protections pass |
| `/admin/profile` | Display name, public team profile, password change, sessions, recent own activity | Current password required; other sessions can be revoked |
| `/admin/sponsors` | Sponsor CRUD, tiers, benefits, impact statistics, ordering | Public preview and logo validation pass |
| `/admin/communications` | Announcements, tasks, comments, direct messages, team chat entry, scoped email | Target audience is previewed and authorized before send |
| `/admin/channels` | Channel list, create/archive, realtime messages, replies, pin, soft delete | Active account and channel membership enforced server-side |
| `/admin/whiteboard` | List, create, rename, open, autosave, export, delete | Access scope and optimistic concurrency prevent silent overwrite |
| `/admin/gallery` | Select public images, event association, caption, alt text, ordering, publish toggle | Only approved image MIME types can become public |
| `/admin/media` | Folders, upload, search, filters, metadata, tags, public toggle, signed preview, bulk operations | Object access, MIME, size, quota, and deletion checks pass |
| `/admin/guide` | Searchable, versioned operating guide for the deployed system | Contains no sample secrets or outdated PSU instructions |
| `/admin/linktree` | Profiles, links, ordering, approved embeds, styles, analytics | Username uniqueness, URL allowlist, and privacy rules pass |
| `/admin/forms` | Form library, templates, create, duplicate, ownership, collaborators, invitation delivery, team scope, state, schedule, response count, archive, and restore | Listing is permission-filtered; inaccessible forms cannot be inferred; raw invitation tokens never display; destructive actions follow retention rules |
| `/admin/forms/:formId/edit` | Visual builder, field library, sections, ordering, validation, conditional logic, access, settings, autosave, preview, version history, publish, close, and reopen | Keyboard builder path passes; invalid or cyclic logic cannot publish; publication creates an immutable version |
| `/admin/forms/:formId/responses` | Summary charts, paginated response table, individual response, saved views, search, filters, files, deletion or redaction, and CSV/XLSX/JSON export | Answer values never appear in logs; scope and export authorization pass; labels remain version-correct |
| `/admin/site-status` | Live/maintenance state, message, optional safe redirect, preview | Redirect allowlist and loop protection pass; change is audited |
| `/admin/teams` | Teams, memberships, roles, invitations, permissions, page access, announcements, transfers, activity, statistics | Team leads are limited to their teams; role changes are audited |
| `/admin/finances` | Transactions, submission, approval chain, rejection, completion, attachments, budgets, filters, reports, CSV | Decimal money, transition state machine, team scope, and immutable decisions pass |
| `/admin/audit-log` | Filter, search, details, export, statistics, retention view | Rows cannot be changed through normal application roles; exports are audited |
| `/admin/team/:teamId` | Scoped team summary, announcements, activity, stats, permitted quick actions | Non-members receive 403; URL substitution cannot cross team scope |
| `/admin/blog-editor` | Own posts and approval requests, assigned tasks, communications summary | Editor cannot publish, moderate, or access unrelated records |
| `/admin/blog-media` | Submission files, review status, comments, download | File access uses short-lived authorization and editor scope |

Special behavior:

- `/admin/blog-comments` redirects only to `/admin/blog?tab=comments`.
- `/admin/invite/:token` displays team, inviter, role, expiry, and accept/decline state without exposing other team data.
- A protected page returns 401 for no session and 403 for a valid session without permission. The SPA may show friendly UI, but APIs preserve the distinction.

## 24. Authorization matrix

### 24.1 Route eligibility

| Surface | Super Admin | Admin | Blog Editor | Team Member |
|---|---|---|---|---|
| Dashboard, own profile, guide | Full | Full | Own scope | Own scope |
| Users and security | Full | No route | None | None |
| Content, public profiles, resources, sponsors, gallery, media, site status, Linktree | Full | Full | None | Explicit page access plus action grant |
| Forms | Full | Full | None | Owned, collaborating, or team-scoped forms plus explicit action grants |
| Events | Full | Full | None | Explicit page access plus event action grant |
| Newsletter | Full | Full | None | Explicit page access plus newsletter action grant |
| Blog administration | Full | Full | Editor workspace only | Explicit page access only if granted |
| Projects administration | Full | Full | None | Explicit page access plus project action grant |
| Teams | Full | Full except Super Admin controls | None | Own memberships; leads manage own team within limits |
| Communications | Full | Full | Assigned/own communications summary | Own messages, tasks, and granted team actions |
| Channels | Full | Full | None unless explicitly granted | Active account plus channel membership or public internal channel |
| Whiteboards | Full | Full | None unless explicitly granted | Explicit whiteboard or team access |
| Finances | Full | Full | None | Own records and granted team scope; lead approval only for own team |
| Audit log | Full | Read/export | None | None |

### 24.2 Account hierarchy

- A Super Admin can create and manage all roles except removing the last active Super Admin.
- An Admin can create and manage Team Member and Blog Editor accounts, but cannot assign Admin or Super Admin, change a Super Admin, rotate the gate, or revoke a Super Admin session.
- A Team Lead can invite or add Team Member accounts to a team only when the account already exists or the invitation creates the fixed `team_member` role.
- No user can approve their own finance request, elevate their own role, delete their own active account, or remove their own final required team lead role.
- Deactivation revokes all server sessions immediately, blocks the next HTTP request, attempts to disconnect active Realtime clients, and guarantees Realtime authorization expiry within five minutes.

### 24.3 Team permission resolution

For Team Members, access requires all applicable checks:

1. Active account and valid session.
2. Route eligibility from `team_page_access` or a base route explicitly listed in this PRD.
3. Resource action grant from `team_permissions`.
4. Membership in the target team when a resource is team-scoped.
5. Ownership rule when a record is personal.
6. State-transition permission when the action changes workflow state.

Super Admin and Admin shortcuts never skip resource validation, input validation, CSRF, audit, or immutable-record rules.

### 24.4 Finance state machine

Allowed transitions:

- Draft to pending by creator.
- Pending to team-lead-approved by a lead of the associated team when team approval is required.
- Pending or team-lead-approved to admin-approved by Admin or Super Admin.
- Admin-approved to completed by Admin or Super Admin.
- Pending or team-lead-approved to rejected by an authorized approver with a reason.
- Draft or pending to cancelled by creator if no approval has occurred, or by Admin/Super Admin.

Completed, rejected, and cancelled records are immutable except for append-only notes and attachments explicitly allowed by policy. No approver may approve a record they submitted.

## 25. API contract

### 25.1 Common request and response behavior

Successful JSON:

```json
{
  "data": {},
  "meta": {
    "requestId": "uuid"
  }
}
```

Failed JSON:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check the highlighted fields.",
    "fields": {}
  },
  "meta": {
    "requestId": "uuid"
  }
}
```

Rules:

- `Content-Type: application/json; charset=utf-8` for JSON.
- Unknown JSON properties are rejected on security-sensitive endpoints.
- Request bodies default to 1 MB; upload endpoints use explicit limits.
- Protected mutation requests require `X-CSRF-Token`.
- Registration, newsletter, form submission, campaign send, finance transition, and upload completion require `Idempotency-Key`.
- List endpoints return `items` plus `nextCursor` or `page`, `pageSize`, and `total` where counting is safe.
- Sensitive responses set `Cache-Control: no-store`.
- Public content endpoints use `ETag` and short edge cache with stale-while-revalidate.

### 25.2 Standard status and error codes

| HTTP | Application code | Meaning |
|---:|---|---|
| 400 | `BAD_REQUEST` | Malformed request |
| 400 | `VALIDATION_ERROR` | Field validation failed |
| 401 | `AUTH_REQUIRED` | No valid session |
| 401 | `SESSION_EXPIRED` | Expired or revoked session |
| 403 | `GATE_REQUIRED` | Login requested without a valid gate |
| 403 | `CSRF_INVALID` | Missing or invalid CSRF token |
| 403 | `FORBIDDEN` | Authenticated but unauthorized |
| 404 | `NOT_FOUND` | Resource absent or concealed |
| 409 | `DUPLICATE` | Unique record already exists |
| 409 | `INVALID_STATE` | Workflow transition not allowed |
| 409 | `EVENT_FULL` | Capacity reached |
| 409 | `FORM_RESPONSE_LIMIT` | Form response limit reached |
| 409 | `ALREADY_RESPONDED` | Verified identity or invite already responded |
| 410 | `TOKEN_EXPIRED` | One-time token expired or consumed |
| 410 | `FORM_CLOSED` | Form is closed, expired, or no longer accepting responses |
| 413 | `PAYLOAD_TOO_LARGE` | Body or file exceeds limit |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | MIME type rejected |
| 422 | `UNSAFE_URL` | URL or embed rejected |
| 429 | `RATE_LIMITED` | Retry after returned delay |
| 500 | `INTERNAL_ERROR` | Safe generic failure |
| 503 | `TEMPORARILY_UNAVAILABLE` | Dependency or maintenance failure |

### 25.3 Authentication endpoints

| Method and path | Auth | Contract |
|---|---|---|
| `POST /api/v1/auth/gate` | Public | `{code}`; rate-limited; sets `__Host-gdg_gate`; returns only `{gateValid:true}` |
| `GET /api/v1/auth/gate` | Gate cookie | Returns gate validity only |
| `POST /api/v1/auth/login` | Gate cookie | `{email,password}`; creates opaque session and CSRF token |
| `GET /api/v1/auth/session` | Session | Returns minimum current user, role, team memberships, and permission version |
| `DELETE /api/v1/auth/session` | Session and CSRF | Revokes current session and clears cookies |
| `DELETE /api/v1/auth/sessions` | Session and CSRF | Revokes other sessions owned by current user; all sessions only for Super Admin target action |
| `POST /api/v1/auth/password` | Session and CSRF | Current password plus new password; revokes other sessions |
| `POST /api/v1/auth/realtime-token` | Session and CSRF | Returns a short-lived scoped Realtime JWT, never a service key |

Cookie names and rules:

- `__Host-gdg_gate`: HttpOnly, Secure, SameSite=Strict, Path=/, 15 minutes.
- `__Host-gdg_session`: HttpOnly, Secure, SameSite=Lax, Path=/, opaque 256-bit token, 8-hour idle and 7-day absolute expiry.
- CSRF token is returned in JSON after login and rotation, stored only in memory by the client, and bound to the server session.

### 25.4 Public endpoints

| Method and path | Purpose | Primary controls |
|---|---|---|
| `GET /api/v1/public/home` | Homepage aggregate | Public fields only, edge cached |
| `GET /api/v1/events` | Published event list | Filter and sort allowlist |
| `GET /api/v1/events/:slug` | Published event detail | 404 for draft or unknown |
| `GET /api/v1/events/:slug/calendar.ics` | Calendar file | Published event only |
| `POST /api/v1/events/:slug/registrations` | Atomic registration | Rate limit, bot check, idempotency, capacity |
| `GET /api/v1/team` | Active public profiles | Public fields only |
| `GET /api/v1/resources` | Active resources | Filter allowlist |
| `POST /api/v1/resources/:id/view` | View counter | Anonymous rate limit, no PII |
| `GET /api/v1/sponsors` | Active sponsor content | Public fields only |
| `GET /api/v1/gallery` | Public image records | Images only |
| `GET /api/v1/media/public/:id` | Public media bytes or redirect | Record must be public; safe cache headers |
| `POST /api/v1/contact` | Contact submission | Validation, rate limit, honeypot, idempotency |
| `POST /api/v1/contact/upload-intents` | Issue one-file signed attachment upload | MIME, size, quota, rate limit, quarantine object key |
| `POST /api/v1/contact/uploads/:uploadId/complete` | Verify and queue attachment scan | Idempotency, object verification, scan queue |
| `GET /api/v1/forms/:slug` | Published form definition | Access mode, token, schedule, public schema only |
| `POST /api/v1/forms/:slug/drafts` | Create resumable response draft | Rate limit, optional access token, hashed resume token |
| `PATCH /api/v1/forms/:slug/drafts` | Save resumable response draft | Resume token in authorization header or body, token hash, version, validation, expiry |
| `POST /api/v1/forms/:slug/upload-intents` | Issue one-file signed upload | Field policy, access, MIME, size, quarantine object key |
| `POST /api/v1/forms/:slug/uploads/:uploadId/complete` | Validate and queue uploaded file | Idempotency, object verification, scan queue |
| `POST /api/v1/forms/:slug/responses` | Atomic final response | Rate limit, bot check, version, idempotency, limits, logic validation |
| `PATCH /api/v1/forms/:slug/responses` | Edit allowed response | Edit token in authorization header or body, hashed token, edit window, immutable revision |
| `POST /api/v1/newsletter/subscriptions` | Start double opt-in | Generic response, rate limit, idempotency |
| `POST /api/v1/newsletter/confirm` | Confirm hashed token | Single-purpose token |
| `POST /api/v1/newsletter/unsubscribe` | Unsubscribe hashed token | Idempotent |
| `GET /api/v1/linktree/:username` | Active profile and links | Public fields only |
| `POST /api/v1/linktree/:username/links/:id/click` | Count click | Rate limit, hashed analytics |
| `GET /api/v1/site-status` | Maintenance state | Public safe fields only |

### 25.5 Protected resource endpoints

Every row below supports only the methods listed and requires session, action authorization, input validation, and audit where applicable.

| Resource path | Required methods and operations |
|---|---|
| `/api/v1/admin/events` and `/:id` | GET, POST, PATCH, DELETE/soft archive, publish, cancel, duplicate |
| `/api/v1/admin/events/:id/attendees` | GET, PATCH check-in, DELETE registration, CSV export |
| `/api/v1/admin/events/:id/email` | POST audience-bound message |
| `/api/v1/admin/team-profiles` and `/:id` | GET, POST, PATCH, DELETE/disable, reorder |
| `/api/v1/admin/members` and `/:id` | GET, POST, PATCH, DELETE/disable, merge |
| `/api/v1/admin/resources` and `/:id` | GET, POST, PATCH, DELETE, reorder |
| `/api/v1/admin/sponsors`, `/tiers`, `/impact-stats` | CRUD and reorder |
| `/api/v1/admin/content/:collection` | GET, PATCH, preview, publish for settings, pages, navigation, social, footer |
| `/api/v1/admin/media` and `/folders` | List, create upload intent, complete upload, metadata update, move, signed view, delete, bulk actions |
| `/api/v1/admin/gallery` | Select, publish, associate event, reorder |
| `/api/v1/admin/newsletter/subscribers` | List, add, deactivate, export |
| `/api/v1/admin/newsletter/templates` | CRUD and preview |
| `/api/v1/admin/newsletter/campaigns` | CRUD, preview, schedule, cancel, send, delivery status |
| `/api/v1/admin/blog/posts`, `/categories`, `/comments`, `/submissions` | Scoped CRUD, review, approval, moderation, download |
| `/api/v1/admin/projects` and `/:id/members` | Private CRUD and membership |
| `/api/v1/admin/teams` and nested membership, permission, page-access, invite, announcement routes | Scoped team operations |
| `/api/v1/admin/communications/announcements`, `/tasks`, `/messages` | Scoped CRUD, comments, read state, email action |
| `/api/v1/admin/channels` and `/:id/messages` | Create/archive, list, send, reply, pin, edit, soft delete |
| `/api/v1/admin/whiteboards` and `/:id` | List, create, load, rename, versioned save, export, delete |
| `/api/v1/admin/finances`, `/budgets`, `/:id/attachments` | CRUD, submit, approve, reject, complete, cancel, report, export |
| `/api/v1/admin/linktree/profiles`, `/links`, `/analytics` | CRUD, reorder, approved embed settings, aggregate analytics |
| `/api/v1/admin/forms` and `/:id` | List, create, read, update draft metadata, duplicate, archive, restore, delete subject to retention |
| `/api/v1/admin/forms/:id/draft` | Load and autosave mutable builder definition with optimistic version |
| `/api/v1/admin/forms/:id/validate` | Validate field schema, access settings, and conditional graph without publishing |
| `/api/v1/admin/forms/:id/versions` | List immutable versions, compare metadata, and load authorized preview |
| `/api/v1/admin/forms/:id/publish` | Validate and publish new immutable version |
| `/api/v1/admin/forms/:id/state` | Open, close, reopen, or schedule within authorized transitions |
| `/api/v1/admin/forms/:id/collaborators` | List, add, update, and remove scoped collaborators |
| `/api/v1/admin/forms/:id/invitations` | Create individually or from bounded CSV, list safe delivery state, resend, and revoke unused invitation tokens |
| `/api/v1/admin/forms/:id/responses` | Paginated authorized list, filters, columns, and saved views |
| `/api/v1/admin/forms/:id/responses/:responseId` | View, redact, delete subject to retention, and load authorized files |
| `/api/v1/admin/forms/:id/analytics` | Version-aware aggregate summaries only |
| `/api/v1/admin/forms/:id/exports` | Create export job, inspect status, and obtain short-lived download |
| `/api/v1/admin/site-status` | GET and PATCH |
| `/api/v1/admin/users` and `/:id` | Super Admin CRUD, activation, role, password reset, session revoke |
| `/api/v1/admin/security/gate` | Super Admin rotation only |
| `/api/v1/admin/audit` | List, aggregate, export; no update or delete endpoint |
| `/api/v1/admin/notifications` | List, mark read, mark all read, delete own |

Bulk endpoints cap operations at 100 records. Exports stream bounded results and require date filters when the dataset exceeds 10,000 rows.

## 26. Canonical target data model

### 26.1 Data-access classes

| Class | Tables | Browser behavior |
|---|---|---|
| Security-critical | `admin_users`, `admin_sessions`, `csrf_tokens`, `security_events`, `security_alerts`, `admin_actions` | Server only |
| Internal operations | Teams, communications, channels, whiteboards, finances, notifications, newsletter administration, Forms definitions and responses, media metadata | Server only; Realtime token for approved subscriptions |
| Public-source records | Events, public team profiles, resources, sponsors, CMS, Linktree, public media flags | Serialized by public APIs, never direct table access |
| Private future content | Blog and Projects tables | Server-only admin APIs |
| One-time public workflows | Registration, newsletter tokens, contact submissions, invite acceptance | Dedicated endpoints only |

All application tables enable RLS. The low-privilege publishable or legacy `anon` role receives no application-table privileges. `authenticated` privileges are limited to Realtime policies using server-issued short-lived claims. The secret key's service-role behavior remains server-only and bypasses RLS only after application authorization.

### 26.2 Core canonical tables

The canonical baseline preserves the 62 repository-defined tables unless explicitly consolidated during Phase 0. These required target additions or repairs are normative:

| Table | Required fields and constraints |
|---|---|
| `admin_users` | `id`, unique normalized `email`, `password_hash`, role enum, `display_name`, `is_active`, `failed_login_count`, `locked_until`, `last_login_at`, `password_changed_at`, timestamps |
| `admin_sessions` | `id`, `admin_user_id`, unique `token_hash`, `created_at`, `last_seen_at`, `idle_expires_at`, `absolute_expires_at`, `revoked_at`, optional hashed risk metadata |
| `csrf_tokens` | `id`, unique `session_id`, `token_hash`, `expires_at`, `rotated_at` |
| `event_attendance` | `id`, `event_id`, normalized `attendee_email`, `attendee_name`, optional `notes`, `registration_date`, `attended`, `check_in_time`, `idempotency_key`, timestamps; unique `(event_id, attendee_email)` and `(event_id, idempotency_key)` |
| `contact_submissions` | `id`, name, normalized email, inquiry type, message, interests, attachment object key, status, delivery state, timestamps |
| `forms` | `id`, unique slug, title, description, owner ID, optional team ID, state, access mode, current draft revision, current published version ID, open and close timestamps, response limit, one-response setting, settings JSONB, timestamps, archived timestamp |
| `form_versions` | `id`, form ID, monotonically increasing version number, immutable definition JSONB, schema hash, published by, published timestamp; unique form and version; definition cannot update after publication |
| `form_collaborators` | form ID, admin user ID, explicit action set, created by, timestamps; unique form and user |
| `form_access_tokens` | `id`, form ID, token type, unique token hash, optional encrypted intended email plus normalized email hash, use limit, used count, delivery state, last sent timestamp, expires timestamp, revoked timestamp, created timestamp |
| `form_response_drafts` | `id`, form ID, version ID, resume token hash, access token ID when used, encrypted or protected draft answers JSONB, expires timestamp, updated timestamp |
| `form_responses` | `id`, form ID, version ID, status, normalized verified identity hash when applicable, access token ID, idempotency key hash, submitted timestamp, last edited timestamp, edit token hash, source metadata hash, deleted or redacted timestamp; unique form plus idempotency key |
| `form_response_revisions` | `id`, response ID, revision number, safe change metadata, editor type and ID when authenticated, created timestamp; previous answer values remain protected and accessible only under response-view permission |
| `form_answers` | `id`, response ID, stable field ID, typed value JSONB, normalized search value only where approved, created and updated timestamps; unique response and field |
| `form_uploads` | `id`, form ID, version ID, field ID, response or draft ID, private object key, original filename, detected MIME, byte size, checksum, scan state, uploaded timestamp, attached timestamp, deleted timestamp |
| `form_export_jobs` | `id`, form ID, requester ID, format, filters JSONB, state, private object key, expires timestamp, error code, timestamps |
| `idempotency_keys` | scoped key hash, endpoint, actor or anonymous risk key, response status/body hash, `created_at`, `expires_at`; unique scope and key |
| `push_subscriptions` | `id`, owner type, owner ID or registration ID, endpoint hash and encrypted endpoint payload, keys, user agent, permission state, timestamps, failure count, revoked timestamp |
| `push_delivery_log` | event, subscription, scheduled occurrence, provider result, attempt count, sent timestamp; unique delivery key |

### 26.3 Event canonical fields

`events` must contain: `id`, unique `slug`, `title`, `short_description`, `description`, `start_at`, `end_at`, `timezone`, `location`, `room`, `event_link`, `image_media_id`, `registration_type`, external registration URLs, `registration_enabled`, `max_participants`, `external_attendees`, `type`, `level`, `prerequisites`, `what_youll_learn`, `what_to_bring`, `schedule`, `additional_info`, `contact_info`, `publication_status`, `is_featured`, `published_at`, creator/updater IDs, and timestamps.

`publication_status` is `draft`, `published`, `cancelled`, or `archived`. Registration is open only when the event is published, enabled, not cancelled, not ended, and below capacity. Capacity equals internal committed registration count plus nonnegative `external_attendees`. The target does not keep a separately mutable attendee counter.

### 26.4 Atomic registration transaction

The registration RPC or database transaction must:

1. Lock the event row.
2. Verify published state, registration state, current time, and registration type.
3. Return the existing successful response for a repeated idempotency key.
4. Reject duplicate normalized email for the event.
5. Count committed registrations and add `external_attendees`.
6. Reject with `EVENT_FULL` when capacity is reached.
7. Insert the registration.
8. Commit before any email call.
9. Enqueue confirmation email and optional push-verification work.

Database uniqueness must protect duplicate email and idempotency under concurrency. A 100-request concurrency test at the final available seat must create exactly one registration.

### 26.5 Newsletter token model

Subscriber state is `pending`, `active`, or `unsubscribed`. Store confirmation and unsubscribe token hashes, not raw tokens. Confirmation tokens expire after 24 hours. Unsubscribe tokens may be long-lived but rotate after use. Subscription attempts return the same generic public message for new, pending, and existing addresses.

Campaign sends create an immutable recipient snapshot. A campaign has one send idempotency key and cannot send twice. Provider callbacks update delivery metadata without exposing subscriber lists to the browser.

### 26.6 Native Forms schema and transaction contract

The form definition is stored as versioned JSONB validated against an application-owned JSON Schema. Every field and section has a UUID that remains stable across reorder and label edits. The definition includes field type, presentation, validation, option IDs, conditional rules, access settings, confirmation settings, and theme tokens. It must not contain executable code, raw HTML, secrets, notification credentials, or authorization decisions.

The final response transaction must:

1. Lock the form and referenced published version.
2. Verify access mode, access token, opening and closing time, published state, response limit, and one-response rule.
3. Return the previous safe success result for a repeated idempotency key.
4. Evaluate the versioned conditional graph and compute the server-authoritative visible and required field set.
5. Validate each submitted answer by stable field ID and reject unknown, hidden, missing, or invalid answers according to the form's retention-on-hide policy.
6. Verify every referenced upload belongs to the same form, version, field, and draft or response transaction and has scan state `clean`.
7. Insert the response and answers, consume any single-use access token, attach uploads, and mark any resume draft complete.
8. Commit before issuing a receipt, notification, analytics update, or integration event.
9. Enqueue post-commit work with a deduplication key based on response ID and action.

Response counts are derived from committed, non-deleted responses unless a separately maintained counter is updated inside the same transaction. Closing a form or reaching its limit prevents new responses but does not prevent authorized viewing or export of existing responses.

Published versions are immutable at the database and application layers. Correcting a form requires a new version. The admin response UI groups and compares versions without rewriting historical answers.

### 26.7 Storage contract

| Bucket | Access | Allowed content | Limits |
|---|---|---|---|
| `media` | Private; public records delivered through public media endpoint | Images, video, audio, documents, archives according to admin permission | Image 20 MB, video 250 MB, audio 50 MB, document/archive 25 MB |
| `blog-submissions` | Private | PDF, DOCX, Markdown, plain text, approved images | 20 MB |
| `finance-attachments` | Private | PDF, PNG, JPEG, WebP | 10 MB |
| Contact attachment prefix or dedicated private bucket | Private | PDF, PNG, JPEG, WebP | 10 MB |
| `form-uploads` | Private quarantine followed by protected clean state | Per-field allowlist; PDF, DOCX, plain text, PNG, JPEG, WebP by default | 25 MB per file, maximum 10 files per response unless an Admin lowers the limit |

Rules:

- Object keys are server-generated and never trust filenames.
- Validate declared MIME, detected MIME, extension, size, and image dimensions.
- SVG and HTML uploads are rejected for public rendering.
- Downloads use short-lived signed URLs or authenticated streaming.
- Public media responses set a strict content type, `nosniff`, safe content disposition, and cache headers.
- Deleting a file checks `media_usage`, finance references, content references, and active signed workflows.
- Vercel Function request and response bodies remain below the platform's 4.5 MB limit. Files are never proxied through a Vercel Function when they can exceed that limit.
- The server creates a one-object upload intent after validating actor, destination, expected MIME, expected size, and quota. It returns a short-lived signed upload URL and opaque upload ID. The browser uploads directly to the assigned private object key.
- Upload completion verifies the object exists, size, checksum where available, detected MIME, field ownership, and intent expiry before enqueuing malware scanning.
- New uploads remain in a quarantine prefix or quarantine state. They are unavailable to normal download or response viewing until marked clean. Rejected, expired, and abandoned objects are removed by scheduled cleanup.
- Heavy malware scanning does not run inside a latency-sensitive Vercel Function or Supabase Edge Function. A durable queue invokes an isolated external scanner or worker, then records the result and safely promotes or marks the object.

### 26.8 Retention and deletion

| Data | Default retention |
|---|---|
| Revoked/expired sessions and CSRF rows | 30 days, then delete |
| Gate and login rate-limit events | 90 days aggregate; raw risk keys expire with the rate window |
| Security events | 1 year |
| Audit actions | 2 years minimum |
| Contact submissions | 180 days after resolution unless legal or operational hold applies |
| Incomplete form response drafts | Form-configured duration, maximum 30 days |
| Abandoned or rejected form uploads | 24 hours after expiry or scan rejection |
| Form responses | Until form-specific retention expires or an authorized deletion or redaction request is completed; default 1 year unless the owner selects a shorter period |
| Generated form exports | 24 hours, then object and job download reference expire |
| Newsletter attempts | 30 days |
| Push delivery logs | 90 days |
| Failed email delivery detail | 90 days |
| Finance records and attachments | Retain until chapter leadership defines the required financial retention period; deletion disabled meanwhile |

The admin UI exposes retention state but never a bulk destructive action without Super Admin confirmation and a recent password check.

## 27. Realtime, scheduled work, and email

### 27.1 Realtime authorization

The primary login remains the custom HttpOnly session. For Realtime only:

1. The browser requests `/api/v1/auth/realtime-token` with a valid session and CSRF token.
2. The server issues a JWT lasting no more than five minutes containing user ID, role, permission version, channel topics, and no secrets. Use an imported asymmetric signing key such as ES256 where supported so signing material is not a shared browser-facing secret.
3. The browser authenticates the Realtime client with `realtime.setAuth()` and joins private Broadcast or Presence topics only.
4. Authorization policies on `realtime.messages` verify the token claims and the permitted topic. Server or database code publishes approved record changes to those topics. Application tables are not granted browser `SELECT` solely to enable Postgres Changes.
5. The browser refreshes the token before expiry and disconnects immediately on logout, session failure, or 401.
6. Permission changes revoke normal HTTP access on the next request. For an already connected Realtime client, the server attempts a forced disconnect and the five-minute token lifetime provides the hard maximum for stale channel access because Realtime policy decisions may remain cached until reauthorization.

No Realtime publication includes finances, audit rows, admin users, newsletter subscribers, security events, or gate/session tables.

### 27.2 Conflict behavior

- Messages are append-only with soft-delete and explicit edit timestamps.
- Whiteboard saves include `version` and `updated_at`. A stale save returns 409 and prompts reload or explicit conflict recovery.
- Presence and cursors are ephemeral and never persisted as audit data.
- Reconnect fetches missed records using the last acknowledged timestamp or cursor.

### 27.3 Scheduled jobs

| Job | Schedule | Required behavior |
|---|---|---|
| Overdue tasks | Every 15 minutes | Idempotently mark overdue and notify once per due occurrence |
| Scheduled announcements | Every 5 minutes | Publish due active announcements once |
| Newsletter campaigns | Every 5 minutes | Lock campaign, snapshot recipients, send once, record results |
| Event reminders | Every 15 minutes | Select reminder windows, deduplicate per event and recipient |
| Form schedules | Every 5 minutes | Open or close scheduled forms once and invalidate public caches |
| Form draft and upload cleanup | Hourly | Delete expired drafts, abandoned upload intents, and rejected quarantine objects idempotently |
| Form export and scan workers | Queue-driven with scheduled recovery | Process export and malware-scan jobs, deduplicate work, enforce timeouts, and retry bounded failures |
| Session/CSRF cleanup | Daily | Delete expired rows after retention window |
| Notification cleanup | Daily | Apply retention policy |
| Report cache cleanup | Daily | Delete expired cache only |

Each job requires `Authorization: Bearer <CRON_SECRET>`, rejects normal browser origins, uses a distributed lock, records run ID and counts, and is safe to retry.

Jobs that run every 5 or 15 minutes use Supabase Cron with `pg_cron` and `pg_net`, or an equivalently precise paid scheduler. They must not depend on Vercel Hobby cron, which supports only daily schedules and may run at any point in the selected hour. The selected scheduler, timezone, retry behavior, and missed-run alert are documented per environment.

### 27.4 Email contract

- One verified sending domain and one configured reply-to address.
- Templates are server-rendered and sanitize any managed HTML.
- Public workflows may email only the address validated in that workflow.
- Admin sends use saved audience definitions or explicit authorized addresses with a visible final recipient count.
- Maximum 1,000 recipients per campaign batch; provider throttling and retry use bounded backoff.
- Hard bounces and complaints deactivate future marketing mail.
- Transactional event, invite, password, and contact mail is separated from marketing unsubscribe state where legally appropriate.
- Production logs store provider message ID, template ID, status, and masked recipient only.

## 28. Validation, safety, and user-visible state

### 28.1 Rich text and Markdown

Allowed public rich-text output is limited to headings, paragraphs, lists, emphasis, blockquotes, code, preformatted text, tables, safe links, and approved images. Remove scripts, styles, forms, SVG, MathML, iframes, objects, event-handler attributes, inline style unless explicitly sanitized, and unsafe protocols.

Sanitize on write and on render. Markdown preview and published rendering use the same pipeline. Form titles, descriptions, labels, help text, option labels, confirmation messages, and respondent text displayed to administrators use the same safe text or rich-text policy and never render respondent HTML. Email HTML uses a separate stricter allowlist. Security tests include stored XSS payloads for event descriptions, form definitions and answers, blog content, comments, newsletter templates, Linktree fields, and media metadata.

### 28.2 URL and redirect policy

- Production URLs must use HTTPS except `mailto:` and `tel:` fields explicitly designed for them.
- Canonicalize punycode and reject embedded credentials.
- Server-side fetches reject localhost, link-local, private, multicast, and metadata-service addresses after DNS resolution and on redirects.
- Site-status redirects allow only configured chapter-owned HTTPS origins.
- Iframes allow only Google Forms and YouTube hosts and use restrictive `sandbox`, `allow`, and `referrerpolicy` attributes.
- Every external link visibly indicates that it leaves the site.

### 28.3 Required UI states

Every list, form, dashboard widget, and detail view implements:

- Loading skeleton that approximates final layout.
- First-use empty state with a permitted next action.
- Filtered empty state with reset action.
- Recoverable error with retry.
- Permission denied without leaking record existence.
- Offline state with cached timestamp when applicable.
- Stale-data indicator after background failure.
- Disabled and in-progress submit states that prevent duplicate action.
- Success confirmation tied to the completed server response.

### 28.4 Destructive action rules

Delete, revoke, archive, reject, cancel, bulk remove, and clear operations name the target and consequence. High-impact actions require typed confirmation or recent password verification. The interface never preselects destructive bulk options. Backend operations remain independently authorized and idempotent.

## 29. Observability, privacy, and security headers

### 29.1 Structured telemetry

Server logs contain timestamp, environment, request ID, route template, method, status, latency, actor ID when authenticated, authorization result, safe error code, and dependency timing. Sensitive fields are redacted before serialization.

Required alerts:

- Elevated login or gate failures
- Repeated 5xx rate
- Email provider rejection spike
- Scheduled job missed or duplicated
- Event registration conflict or capacity anomaly
- Database latency or connection exhaustion
- Storage upload failure spike
- Form submission rejection, response-limit conflict, scan failure, and export-job failure spike
- Push delivery failure spike
- CSP violation spike

### 29.2 Privacy

- Publish a plain-language privacy notice covering registrations, newsletter, contact, native form responses and uploads, Linktree analytics, push, and admin operations.
- Collect only fields needed for each workflow.
- Do not add third-party analytics, session replay, fingerprinting, or ad trackers in v1.5.
- Hash or truncate IP-derived risk keys and analytics identifiers.
- Provide an administrator workflow to export, redact, or delete a person's public-workflow data, including Forms responses, subject to finance, form-specific hold, and audit retention constraints.

### 29.3 Headers

Production requires HSTS, `nosniff`, strict referrer policy, restrictive permissions policy, frame ancestors none, base URI self, form action self, and a CSP without `unsafe-eval`. Roll CSP through report-only staging first. Admin and API responses use `no-store`; fingerprinted assets use immutable caching.

## 30. Build, dependency, and performance definition

Required scripts:

- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:coverage`
- `npm run test:e2e`
- `npm run test:db`
- `npm run build`
- `npm run preview`

Blocking build rules:

- Zero ESLint errors.
- Warnings do not increase and security, hook, accessibility, and correctness warnings are resolved before launch.
- TypeScript strict check passes.
- Production build passes without secrets or source maps exposed publicly.
- Zero known critical or high production dependency vulnerabilities. Any temporary exception requires documented exploitability analysis, owner, expiry, and compensating control.
- Browser compatibility data is refreshed.

Performance budgets measured on the public entry routes:

| Asset or metric | Budget |
|---|---:|
| Initial route JavaScript, gzip | 250 kB |
| Initial route CSS, gzip | 60 kB |
| Largest non-lazy image above fold | 250 kB |
| Initial font transfer | 120 kB |
| LCP at mobile p75 | 2.5 seconds |
| INP at p75 | 200 ms |
| CLS at p75 | 0.10 |

Three.js, Excalidraw, Forms builder libraries, spreadsheet export libraries, charts, Markdown syntax highlighting, and admin-only libraries must be route-lazy. The public home page does not load Excalidraw, Forms builder, charting, spreadsheet export, or admin modules. The public Forms route loads only the renderer and field types required by its published schema. A static fallback replaces 3D on reduced-motion, low-power, low-memory, or slow-network conditions.

## 31. Test traceability and definition of done

### 31.1 Mandatory test IDs

| ID range | Coverage |
|---|---|
| `AUTH-TEST-001..020` | Gate, login, lockout, session, revocation, password, cookies |
| `SEC-TEST-001..030` | Role/action/team scope, CSRF, RLS, storage, XSS, URL, logs, secrets |
| `EVT-TEST-001..025` | CRUD, publication, slug, detail, registration, concurrency, attendance, ICS, email |
| `TEAM-TEST-001..025` | Teams, membership, role, invite, transfer, page and action grants |
| `COMM-TEST-001..020` | Announcements, tasks, messages, channels, Realtime, email |
| `FIN-TEST-001..020` | Money precision, scope, transitions, self-approval, attachments, export |
| `NEWS-TEST-001..020` | Subscribe, privacy response, token, unsubscribe, campaign snapshot and send |
| `CONTENT-TEST-001..020` | CMS, team, resource, sponsor, gallery, media, Linktree, site status |
| `FORM-TEST-001..040` | Builder, fields, validation, logic, versions, access, invitations, drafts, submissions, uploads, limits, responses, sensitive fields, charts, exports, collaborators, retention |
| `PRIVATE-TEST-001..010` | Blog and Projects admin access plus public non-disclosure |
| `PWA-TEST-001..020` | Install, update, cache, offline queue, retry, conflict, push |
| `A11Y-TEST-001..020` | Keyboard, focus, names, errors, contrast, zoom, screen reader |
| `VIS-TEST-001..022` | Each numbered desktop prompt and its mapped route or section, including visual diff and manual fidelity review |
| `OPS-TEST-001..015` | Jobs, logging redaction, monitoring, backup, restore, rollback |

Each normative requirement must map to at least one test ID in the implementation tracker. A phase cannot exit with unmapped launch-blocking requirements.

### 31.2 Per-feature definition of done

A feature is done only when:

1. UI and API behavior match this PRD.
2. Authorization is enforced server-side and covered by negative tests.
3. Data migration and rollback exist.
4. Loading, empty, error, offline, and permission states are implemented.
5. Keyboard and screen-reader paths pass.
6. Unit, integration, database, and applicable E2E tests pass.
7. Audit and structured logs are present without sensitive data.
8. Documentation and environment variables are updated.
9. Performance budgets are not regressed.
10. The feature passes review in staging with production-like configuration.
11. Any mapped visual surface passes its `VIS-TEST` baseline at both required desktop viewports.
12. The feature introduces no prohibited visual substitution from Sections 10.5 or 10.8.

## 32. Developer execution sequence

A developer beginning from the PSU source should execute in this order:

1. Create the GT repository branch and preserve the PSU source as a read-only reference.
2. Install dependencies in an isolated environment and capture the baseline build, lint, audit, and bundle report.
3. Add test scripts, CI, fixtures, local Supabase configuration, and a disposable database reset command.
4. Reconstruct the complete source schema, then create one canonical GT baseline plus forward migrations.
5. Seed only approved GT configuration and the one-time Super Admin bootstrap mechanism.
6. Build shared server primitives: request ID, safe JSON, validation, cookies, session, CSRF, authorization, rate limits, audit, storage, mail, and idempotency.
7. Implement gate and session flows and delete the browser secret query and unsigned admin cookie.
8. Implement public read APIs and replace direct public Supabase reads.
9. Migrate protected services one subsystem at a time, starting with users, permissions, events, and media.
10. Add scoped Realtime tokens and migrate channels, notifications, team chat, and whiteboards.
11. Implement event detail, atomic registration, offline queue, and email confirmation.
12. Implement the approved visual system exactly in the Section 10.9 prompt order: shared shell and homepage, remaining public routes, base admin shell, mapped admin route groups, then Forms Prompts 19 through 22. Capture and approve each deterministic visual baseline before moving to the next group. Do not explore alternate visual directions. Then remove PSU branding and disabled public routes from router, sitemap, RSS, cache, and metadata.
13. Implement the native Forms schema, permission actions, builder, public runtime, direct uploads, response workspace, analytics, and exports. Complete Forms security, accessibility, concurrency, and logic-parity tests before enabling public forms.
14. Add PWA and push only after the protected API surface and cache rules pass security tests.
15. Resolve lint, dependency, bundle, accessibility, and cross-browser gates.
16. Deploy staging, run migration rehearsal, UAT, load, backup/restore, and rollback.
17. Promote the exact tested artifact to production and monitor for 48 hours.

No later phase may work around a failed earlier security gate with a permissive policy, browser-held secret, or direct service-role exposure.

## 33. Final completeness statement

This PRD supplies the product scope, route behavior, page workflows, roles, action rules, API conventions, endpoint inventory, canonical data changes, event and Forms transaction semantics, storage controls, Realtime design, scheduled jobs, email rules, validation, failure states, observability, privacy, exact visual source precedence, route-to-prompt mapping, design fidelity gates, build gates, testing traceability, and execution order required to implement v1.5.

Implementation does not require additional product clarification for the defined v1.5 scope. External launch inputs remain configuration rather than product ambiguity: approved logo files, final chapter copy and contact addresses, controlled domains, provider credentials, and Georgia Tech brand approval.

If an implementation choice conflicts with this document, use the safer interpretation that preserves functionality and denies unauthorized access, then record the decision before merge.

**End of Product Requirements Document v1.5**
