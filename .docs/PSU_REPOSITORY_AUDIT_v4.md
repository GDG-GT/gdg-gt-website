# GDG Penn State Website Repository Audit v4.1

**Audit date:** October 17, 2026  
**Source repository:** `/Users/tejas/Desktop/gdg-psu-website`  
**Source commit:** `f1d3613d4613ac7aea68f69601cd079a9bd5be98`  
**Source branch:** `main`  
**Audit mode:** Read-only source inspection plus disposable-copy build validation  
**Purpose:** Authoritative technical baseline for the GDG at Georgia Tech PRD v1.5

## 1. Audit verdict

The repository is a substantial React and Supabase application with a broad admin and collaboration surface. It is not safe to clone and deploy unchanged.

The public site and admin UI are real, but the current security boundary is not. The browser downloads the admin gate secret, most application services call Supabase directly, the latest broad RLS migration deliberately recreates unconditional policies, the custom session cookie can be forged, and the CSRF token is not bound to a session or validated by the application endpoints.

The database history is also not self-contained in `supabase/migrations/`. A fresh installation requires `supabase/schemas/initial-schema.sql` before the migrations. Even after accounting for that baseline, `event_attendance` and three RPCs used by application code have no definitions in the repository.

### Readiness

| Area | Verdict |
|---|---|
| Repository inventory | Verified |
| Public feature baseline | Usable after rebrand and selective route changes |
| Admin feature baseline | Preserve, but move protected data access behind server authorization |
| Fresh database reconstruction | Blocked by non-linear schema history and missing objects |
| Authentication | Critical remediation required |
| Authorization and RLS | Critical remediation required |
| PWA | Present only as partial artifacts and explicitly disabled |
| Automated tests | None found |
| Production launch | Blocked |

## 2. Method and evidence rules

This audit used direct inspection of version-controlled files, repository-wide searches, mechanical extraction of SQL objects, code-reference cross-checking, and a clean dependency install in a temporary copy. The PSU working tree was not modified.

Evidence labels used here:

- **Verified:** Directly present in the repository.
- **Derived:** Mechanically counted or cross-referenced from repository files.
- **Deployment-dependent:** Cannot be proven without the deployed Supabase or Vercel configuration.
- **Missing:** Referenced by code but not defined in version-controlled source.

No production database, Vercel project, Supabase dashboard, deployed secrets, or live network behavior was inspected. No source file was changed.

## 3. Repository baseline

### 3.1 Framework and package management

| Item | Verified value |
|---|---|
| Package manager | npm, `package-lock.json` present |
| Package name | `gdg-website` |
| React | `^18.3.1` |
| TypeScript | `^5.8.3` |
| Vite | `^7.1.5` |
| React Router | `^6.30.1` |
| Supabase JS | `^2.57.4` |
| TanStack Query | `^5.83.0` |
| Tailwind CSS | `^3.4.17` |
| Framer Motion | `^12.23.21` |
| Excalidraw | `^0.18.1` |
| Resend | `^6.0.3` |

The package has `dev`, `build`, `build:dev`, `lint`, and `preview` scripts. It has no `test` or `type-check` script.

### 3.2 Verified counts

| Artifact | Count | Notes |
|---|---:|---|
| React route registrations | 44 | 16 non-admin registrations and 28 `/admin*` registrations |
| Protected admin routes | 26 | Wrapped in `PageAccessGuard` |
| Public admin invite route | 1 | `/admin/invite/:token` |
| Admin redirect alias | 1 | `/admin/blog-comments` |
| Top-level page files | 19 | Includes `AdminContent.tsx` and `AdminDashboard.tsx` |
| Files under `src/pages/admin` | 26 | Includes unrouted `AdminSettings.tsx` |
| Component TypeScript files | 97 | Recursive under `src/components` |
| Service files | 44 | Direct children of `src/services` |
| Vercel API files | 7 | `.mjs` files under `api` |
| Edge Function directories | 10 | Includes `_shared` |
| Deployable Edge Functions | 9 | Directories containing `index.ts` |
| SQL migration files | 82 | Under `supabase/migrations` |
| Unique tables created by migrations | 58 | Does not include baseline-only tables |
| Unique tables created anywhere under `supabase` | 62 | Includes 4 baseline-only tables |
| Unique functions created by migrations | 44 | 67 total create or replace occurrences |
| Storage buckets created by SQL | 2 | `media`, `blog-submissions` |
| Static `CREATE POLICY` declarations | 250 | Historical declarations, not final active count |
| Static `DROP POLICY` declarations | 152 | Dynamic SQL prevents a reliable final count without execution |
| Test files | 0 | No `.test.*` or `.spec.*` files found |
| CI workflow files | 0 | No checked-in GitHub Actions, GitLab CI, or Jenkins workflow found |

### 3.3 Source-worktree validation limitation

`node_modules` is absent from the source worktree. The following commands could not execute there because local binaries were missing:

- `npm run lint`
- `tsc --noEmit --incremental false`
- `npm run build`

This source-worktree check is not a passing or failing build result. Dependencies were not installed into the source repository. Section 3.4 records the authoritative build, type, lint, and dependency results obtained from a disposable copy.

### 3.4 Disposable-copy build validation

The repository was copied to a temporary directory with `.git`, `node_modules`, and `dist` excluded. `npm ci --include=dev --ignore-scripts` was run only in that copy.

| Check | Result | Evidence |
|---|---|---|
| Dependency install | Passed | 774 packages installed |
| TypeScript | Passed | `npx tsc --noEmit --incremental false` exited 0 |
| Production build | Passed | Vite transformed 5,621 modules and exited 0 |
| ESLint | Failed | 350 findings: 10 errors and 340 warnings |
| Package audit, all dependencies | Failed | 42 vulnerabilities: 1 low, 16 moderate, 25 high |
| Package audit, production dependency graph | Failed | 31 vulnerabilities: 1 low, 14 moderate, 16 high |

The lint errors include lexical declarations inside switch cases in `teamActivityService.ts` and a disallowed control-character expression in the shared Edge Function sanitizer. Warnings are widespread and include explicit `any`, stale hook dependency arrays, refresh-boundary issues, and unnecessary wrappers.

The production build is technically successful but is not performance-ready. Large generated chunks include approximately:

- 2,210 kB minified, 505 kB gzip
- 1,824 kB minified, 743 kB gzip
- 1,094 kB minified, 354 kB gzip
- 884 kB minified, 242 kB gzip for the Three.js vendor chunk
- 636 kB minified, 153 kB gzip for a main application chunk

The build also reports static and dynamic imports of the same modules, which prevents intended code splitting for Supabase, service-worker utilities, team services, Resend services, and site status services. The checked-in browser compatibility database is approximately 16 months old.

This section supersedes Section 3.3 for build status. The source itself remained read-only.

## 4. Route and page inventory

### 4.1 Public route registrations

| Path | Component | Current status | GT v1.5 disposition |
|---|---|---|---|
| `/` | `Home` | Public | Keep and rebrand |
| `/events` | `Events` | Public | Keep and enhance |
| `/blog` | `Blog` | Public | Disable and return 404 |
| `/blog/:slug` | `BlogPost` | Public | Disable and return 404 |
| `/contact` | `Contact` | Public | Keep and rebrand |
| `/projects` | `Projects` | Public | Disable and return 404 |
| `/team` | `Team` | Public | Keep and rebrand |
| `/resources` | `Resources` | Public | Keep and rebrand |
| `/sponsors` | `Sponsors` | Public | Keep and rebrand |
| `/gallery` | `Gallery` | Public | Keep and rebrand |
| `/l/:username` | `Linktree` | Public | Keep |
| `/newsletter/confirm` | `NewsletterConfirm` | Public | Keep |
| `/newsletter/unsubscribe` | `NewsletterUnsubscribe` | Public | Keep |
| `/offline` | `Offline` | Public | Keep and integrate with PWA |
| `/maintenance` | `Maintenance` | Public | Keep |
| `*` | `NotFound` | Public fallback | Keep |

Required new route: `/events/:slug`.

### 4.2 Admin route registrations

| Path | Component | Guard classification |
|---|---|---|
| `/admin` | `AdminDashboard` | Protected |
| `/admin/content` | `AdminContent` | Protected |
| `/admin/events` | `AdminEvents` | Protected |
| `/admin/team` | `AdminTeam` | Protected |
| `/admin/projects` | `AdminProjects` | Protected |
| `/admin/members` | `AdminMembers` | Protected |
| `/admin/resources` | `AdminResources` | Protected |
| `/admin/newsletter` | `AdminNewsletter` | Protected |
| `/admin/blog` | `AdminBlog` | Protected |
| `/admin/users` | `AdminUsers` | Protected |
| `/admin/profile` | `AdminProfile` | Protected |
| `/admin/sponsors` | `AdminSponsors` | Protected |
| `/admin/communications` | `AdminCommunications` | Protected |
| `/admin/channels` | `AdminChannels` | Protected |
| `/admin/whiteboard` | `AdminWhiteboard` | Protected |
| `/admin/gallery` | `AdminGallery` | Protected |
| `/admin/blog-comments` | Redirect to `/admin/blog?tab=comments` | Redirect, not a page |
| `/admin/media` | `AdminMedia` | Protected |
| `/admin/guide` | `AdminGuide` | Protected |
| `/admin/linktree` | `AdminLinktree` | Protected |
| `/admin/site-status` | `AdminSiteStatus` | Protected |
| `/admin/teams` | `AdminTeams` | Protected |
| `/admin/finances` | `AdminFinances` | Protected |
| `/admin/audit-log` | `AdminAuditLog` | Protected |
| `/admin/team/:teamId` | `TeamDashboard` | Protected |
| `/admin/invite/:token` | `AcceptInvite` | Public token route |
| `/admin/blog-editor` | `BlogEditorDashboard` | Protected |
| `/admin/blog-media` | `BlogEditorMedia` | Protected |

`src/pages/admin/AdminSettings.tsx` exists but is not registered in `App.tsx`. `src/pages/Index.tsx` also exists but is not registered. These are orphan page files, not active routes.

## 5. Service and backend inventory

### 5.1 Services

The 44 verified service files are:

`adminService.ts`, `attendanceService.ts`, `auditService.ts`, `blogCommentsService.ts`, `blogReactionService.ts`, `blogService.ts`, `blogSubmissionService.ts`, `cacheService.ts`, `channelsService.ts`, `communicationsService.ts`, `contactService.ts`, `contentService.ts`, `csrfService.ts`, `emailService.ts`, `eventsEmailService.ts`, `eventsService.ts`, `financesService.ts`, `inputValidationService.ts`, `linktreeService.ts`, `mediaService.ts`, `membersService.ts`, `newsletterService.ts`, `notificationService.ts`, `optimizedContentService.ts`, `permissionsService.ts`, `preloaderService.ts`, `profileMergingService.ts`, `projectStarsService.ts`, `projectsService.ts`, `requestService.ts`, `resendService.ts`, `resourcesService.ts`, `securityService.ts`, `sessionService.ts`, `siteStatusService.ts`, `sponsorContentService.ts`, `sponsorsService.ts`, `teamActivityService.ts`, `teamInviteService.ts`, `teamManagementService.ts`, `teamMessagingService.ts`, `teamService.ts`, `teamStatisticsService.ts`, and `whiteboardService.ts`.

Most feature services call the browser Supabase client directly. Protected CRUD is therefore not mediated by a trusted server. `PageAccessGuard` and `permissionsService.ts` control the interface, but they do not create a server security boundary.

### 5.2 Vercel API routes

| File | Current purpose | Security observation |
|---|---|---|
| `csrf.mjs` | Generates a CSRF token | Returns a random token that is not bound to the session and does not validate it later |
| `keep-alive.mjs` | Database keep-alive query | GET uses the service role without checking `CRON_SECRET`; POST checks it |
| `media.mjs` | Public media proxy | Publicly proxies the `media` bucket and applies one-year immutable caching |
| `rss.mjs` | Public RSS | Includes public blog content and must be changed when blog routes are disabled |
| `send-email.mjs` | Sends arbitrary email through Resend | No admin session or CSRF validation; origin allowlisting is not authorization |
| `session.mjs` | Login, session check, logout | Session design is forgeable and does not use the existing session table |
| `sitemap.mjs` | Public sitemap | Includes routes/content that must be removed from the GT public surface |

### 5.3 Edge Functions

Deployable functions:

1. `check-overdue-tasks`
2. `confirmation-mail`
3. `send-comment-notification`
4. `send-communication-email`
5. `send-contact-form`
6. `send-email`
7. `send-event-email`
8. `send-newsletter`
9. `send-newsletter-campaign`

`_shared` contains shared utilities and is not deployable.

The handlers generally use `Access-Control-Allow-Origin: *`. Several use the service-role key or Resend key without performing application session and permission checks inside the handler. Supabase deployment-level JWT verification is deployment-dependent and is not a substitute for role and resource authorization. An anon token can satisfy basic JWT presence unless the handler validates identity and permissions.

## 6. Database reconstruction

### 6.1 Two-part source schema

The migration directory is not a complete fresh-install schema.

- `supabase/migrations` creates 58 unique tables.
- `supabase/schemas/initial-schema.sql` creates four additional unique tables not created by migrations: `events`, `team_members`, `sponsors`, and `site_content`.
- Across all SQL under `supabase`, 62 unique tables are created.
- `event_attendance` is referenced by services and an Edge Function but is not created anywhere.

The repository README explicitly instructs a fresh install to run `initial-schema.sql`, then `rls-policies.sql`, then `triggers.sql`, then seed data. Later migrations were written against that assumed baseline.

### 6.2 Complete repository-defined table inventory

`admin_actions`, `admin_sessions`, `admin_teams`, `admin_users`, `announcement_reads`, `announcements`, `blog_categories`, `blog_comments`, `blog_likes`, `blog_posts`, `blog_submission_comments`, `blog_submissions`, `budget_allocations`, `channel_messages`, `channels`, `communication_tasks`, `csrf_tokens`, `events`, `finance_attachments`, `finance_report_cache`, `finances`, `footer_content`, `internal_messages`, `linktree_analytics`, `linktree_links`, `linktree_profiles`, `media_files`, `media_folders`, `media_usage`, `members`, `navigation_items`, `newsletter_campaigns`, `newsletter_subscribers`, `newsletter_subscription_attempts`, `newsletter_templates`, `notifications`, `page_content`, `project_members`, `project_stars`, `projects`, `resources`, `security_alerts`, `security_events`, `site_content`, `site_settings`, `site_status`, `social_links`, `sponsor_impact_stats`, `sponsors`, `sponsorship_tiers`, `task_comments`, `team_activity_log`, `team_announcements`, `team_invites`, `team_member_transfers`, `team_members`, `team_memberships`, `team_messages`, `team_page_access`, `team_permissions`, `team_statistics`, and `whiteboards`.

### 6.3 Missing application database objects

| Object | Type | Evidence |
|---|---|---|
| `event_attendance` | Table | Queried by `attendanceService.ts`, `eventsService.ts`, and `send-event-email` |
| `increment_attendees_count` | RPC | Called by `attendanceService.ts` |
| `decrement_attendees_count` | RPC | Called by `attendanceService.ts` |
| `increment_resource_views` | RPC | Called by `resourcesService.ts` |

These objects may exist in the live PSU database, but they are missing from version control. They must be reconstructed before the GT schema can be considered complete.

### 6.4 SQL functions

There are 44 unique function names in migrations and 67 create or replace occurrences. The difference is repeated redefinition across later migrations.

Unique names:

`authenticate_admin`, `check_and_mark_overdue_tasks`, `check_newsletter_rate_limit`, `cleanup_expired_csrf_tokens`, `cleanup_expired_report_cache`, `cleanup_expired_sessions`, `cleanup_old_newsletter_attempts`, `cleanup_old_notifications`, `clear_admin_rate_limit`, `create_admin_session`, `create_admin_user`, `create_security_alert`, `debug_current_user`, `generate_csrf_token`, `get_category_stats`, `get_file_type_from_mime`, `increment_blog_views`, `increment_link_clicks`, `invalidate_admin_session`, `is_admin`, `is_admin_authenticated`, `is_admin_user`, `is_authenticated_admin`, `is_password_breached`, `is_storage_admin`, `is_super_admin`, `log_admin_action`, `log_admin_login`, `mark_overdue_tasks`, `monitor_failed_logins`, `sync_storage_to_media_files`, `update_admin_password`, `update_blog_post_comment_count`, `update_blog_post_like_count`, `update_blog_submission_comments_updated_at_column`, `update_blog_updated_at_column`, `update_folder_path`, `update_media_updated_at_column`, `update_project_stars_count`, `update_projects_updated_at`, `update_updated_at_column`, `validate_admin_secret`, `validate_admin_session`, and `validate_csrf_token`.

### 6.5 Storage buckets

| Bucket | Source definition | Current policy concern |
|---|---|---|
| `media` | `015_fix_media_storage.sql` and later storage migrations | Later migration sets the bucket public; browser services use it for broad media management |
| `blog-submissions` | `20241227_create_public_blog_bucket.sql` | Public upload and read policies conflict with the GT requirement to keep blog tooling private |

Application code also references `finance-attachments` as a bucket, but no bucket creation SQL was found. `finance_attachments` with an underscore is a database table and is a different object.

## 7. Authentication and authorization findings

### 7.1 Client-side admin gate secret

**Severity: Critical**

`src/components/Footer.tsx` is the real 416-line implementation.

- Lines 24 to 43 select `site_settings.value` where the key is `admin_secret_code`.
- Lines 159 to 163 compare the newsletter input to that downloaded value.
- A matching value opens `AdminLoginModal`.

Anyone who can load the page and call the same public query can recover the gate secret. The gate currently provides concealment only, not security.

### 7.2 Forgeable session design

**Severity: Critical**

`api/session.mjs` authenticates credentials through `authenticate_admin`, then creates:

- `gdg_session`: a random token that is never stored, hashed, or associated with the user.
- `gdg_admin`: unsigned JSON containing the user ID, email, role, display name, and expiry.

The GET validation path checks only that both cookies exist, parses `gdg_admin`, and checks its client-supplied expiry. It does not verify a signature, look up the random token, query `admin_sessions`, or confirm the user remains active. The repository contains a session table and session RPCs, but the Vercel session API does not use them.

Cookie settings are HttpOnly, `SameSite=Lax`, and secure only when `NODE_ENV` equals `production`. HttpOnly prevents JavaScript reads but does not make unsigned content trustworthy.

### 7.3 Client-only route authorization

**Severity: Critical when combined with direct data access**

`PageAccessGuard` checks the React admin context and calls `PermissionsService.canAccessPage`. That is useful for navigation and UX, but it is browser code and can be bypassed.

The role model itself is real:

- `admin_users.role` is later expanded to `super_admin`, `admin`, `team_member`, and `blog_editor`.
- `team_memberships.admin_user_id` references `admin_users.id`.
- Team permissions and page access are stored in `team_permissions` and `team_page_access`.

The missing layer is trusted server enforcement before protected reads and mutations.

### 7.4 RLS reset to unconditional access

**Severity: Critical**

`20250321000010_fix_all_rls_policies.sql`:

1. Iterates through every public-schema policy and drops it.
2. For a long list of tables, creates `allow_all_select`, `allow_all_insert`, `allow_all_update`, and `allow_all_delete` with unconditional `true` expressions.

The migration states that this is done because the site uses the regular browser client. Later channel and whiteboard migrations also create `FOR ALL USING (true)` policies.

Because protected services call the anon browser client directly, these policies expose operations that the interface presents as admin-only. Earlier restrictive migrations do not mitigate this because the later reset drops their policies.

### 7.5 CSRF implementation is incomplete

**Severity: High**

`api/csrf.mjs` returns a newly generated UUID. It separately attempts to call `generate_csrf_token` but ignores database failure and does not return the database-generated token. No session is required. The browser caches the returned token and can add it to headers, but the inspected Vercel mutation endpoints do not validate that token.

This is a token-shaped value, not working CSRF protection.

### 7.6 Email abuse surface

**Severity: High**

`api/send-email.mjs` accepts arbitrary recipients, subjects, and content without an admin session or permission check. It uses only an in-memory IP rate limiter. Allowed CORS origins do not prevent direct HTTP requests.

Several Edge Functions also accept email payloads and use Resend without validating an application session or action permission inside the handler. Deployment-level JWT settings remain unverified.

### 7.7 Browser-exposed email key configuration

**Severity: High if configured**

`.env.example` defines `VITE_RESEND_API_KEY`. `src/config/emailConfig.ts` reads it through `import.meta.env`, and `newsletterService.ts` imports that configuration. Any real value assigned to this variable is eligible for bundling into browser JavaScript. Resend credentials must use a server-only `RESEND_API_KEY` variable.

The Supabase anon key is intentionally public and is safe only when RLS and grants are correct. The service-role key is server-only in the checked-in example.

### 7.8 Stored content can reach unsafe HTML sinks

**Severity: High**

`EventCard.tsx` converts event descriptions to HTML and passes the result to `dangerouslySetInnerHTML` without DOM sanitization. Blog views enable `rehypeRaw`, allowing stored raw HTML to become DOM nodes. The repository has a DOMPurify helper, but the inspected event and blog render paths do not use it.

Target behavior must sanitize stored rich text on input and again on render with an explicit tag, attribute, and URL-protocol allowlist. Raw scriptable HTML, event attributes, `javascript:` URLs, SVG, MathML, embedded objects, and unapproved iframes must be rejected.

### 7.9 Arbitrary external embeds and URLs need allowlists

**Severity: High**

Linktree links and `EmbedModal.tsx` transform or embed administrator-supplied URLs. General iframe URLs are returned without a host allowlist. Public media and link fields also accept external URLs. This creates phishing, tracking, unsafe-navigation, and framing risk even when `noopener` is used for new windows.

The GT implementation must normalize URLs server-side, permit only `https:` except for explicit local development, restrict iframe hosts to an approved list, add sandbox and referrer-policy attributes, and reject credentials, local addresses, private network ranges, and non-web protocols.

### 7.10 Security headers exist but the CSP is permissive

**Severity: Medium**

`vercel.json` configures HSTS, clickjacking protection, content-type protection, referrer policy, permissions policy, and CSP. This is useful, but the CSP permits `'unsafe-inline'` and `'unsafe-eval'` for scripts and broadly permits HTTPS images. It also includes third-party domains that must be justified individually.

The target CSP must use nonces or hashes for scripts, remove `'unsafe-eval'`, minimize `'unsafe-inline'`, enumerate required `connect-src`, `img-src`, `font-src`, `frame-src`, and `worker-src` hosts, and ship in report-only mode before enforcement.

### 7.11 Logs disclose personal and operational data

**Severity: High**

The session API logs attempted email addresses, complete authentication result objects, and successful account emails. Email handlers log recipient addresses, subjects, provider responses, and message identifiers. There are 319 console logging calls across the application and server code.

Production logging must use structured redaction. Passwords, gate submissions, session tokens, CSRF tokens, invitation tokens, confirmation tokens, unsubscribe tokens, raw email content, provider authorization, and complete user records must never be logged. Email addresses and IP addresses must be masked or hashed unless an approved operational need requires them.

### 7.12 Package and maintenance risk

**Severity: High**

The clean install reports 42 dependency vulnerabilities, including high-severity dependency paths under Excalidraw, PostCSS, and Tailwind, plus moderate findings affecting DOMPurify and React Router dependency paths. The result reflects the lockfile on the audited commit and must be re-evaluated when dependencies are upgraded.

No automatic force upgrade is safe. The GT project must update direct dependencies deliberately, review breaking changes, regenerate the lockfile, rerun unit and browser tests, and reach zero known critical or high production vulnerabilities before launch.

## 8. PWA and offline state

Verified artifacts:

- `public/manifest.json` exists and contains PSU branding.
- `src/pages/Offline.tsx` exists.
- `public/offline.html` exists.
- `src/utils/serviceWorker.ts` exists and expects a `/sw.js` file.
- No `/sw.js` or generated service worker is checked in.
- `vite-plugin-pwa` and Workbox packages are not installed.
- `src/main.tsx` explicitly unregisters all service workers and reloads the page.

Verdict: the repository is not an active PWA. It contains partial legacy scaffolding.

## 9. Realtime and collaboration state

Realtime usage appears in:

- `src/components/admin/NotificationBell.tsx`
- `src/components/admin/TeamChat.tsx`
- `src/components/admin/WhiteboardCanvas.tsx`
- `src/contexts/ContentContext.tsx`
- `src/pages/admin/AdminChannels.tsx`

The repository therefore has existing realtime behavior that must be preserved and secured. The exact deployed publication and Realtime settings are deployment-dependent.

## 10. Product-scope findings for GT

The source supports the following major systems and they should be treated as preservation scope:

- Admin accounts and roles
- Events and attendance
- Public team and member management
- Teams, memberships, permissions, invitations, transfers, announcements, and statistics
- Channels and messages
- Whiteboards
- Communications, tasks, comments, and internal messages
- Finances, budgets, attachments, and approval workflows
- Newsletter subscribers, templates, campaigns, and scheduling
- Blog authoring, submissions, comments, likes, and editorial workflows
- Projects, members, and stars
- Media folders, files, and usage tracking
- Resources
- Sponsors, tiers, and impact statistics
- Linktree profiles, links, and analytics
- Notifications
- Site status, content, navigation, footer, and settings
- Security events and audit actions

Blog and Projects can be removed from the public surface without removing their admin systems.

## 11. Required pre-implementation actions

1. Build a disposable database reconstruction from `initial-schema.sql` plus the 82 migrations in deterministic order.
2. Add version-controlled definitions for `event_attendance` and the three missing RPCs, or replace them with a single atomic registration RPC.
3. Produce a canonical GT baseline migration instead of blindly replaying unsafe historical policy resets.
4. Replace the client-side secret query with a server-side gate endpoint.
5. Replace the unsigned admin cookie with an opaque, server-validated custom session backed by `admin_sessions` or an equivalent server store.
6. Move protected data access behind server endpoints that validate session, permission, CSRF, and input before using the service-role key.
7. Replace the final RLS state with server-only application-table grants and denial of direct browser access. Serialize public data through same-origin server endpoints.
8. Protect every email-sending and service-role Edge Function with action-specific authorization and rate limits.
9. Remove `VITE_RESEND_API_KEY` and all other secret-capable browser environment variables.
10. Add test and CI infrastructure before feature migration continues.

## 12. Launch blockers

- Client downloads the admin gate secret.
- Session cookies are forgeable.
- Protected authorization is enforced primarily in browser code.
- Latest RLS reset is intentionally permissive.
- Protected browser services mutate Supabase directly.
- CSRF protection is not functional end to end.
- Email endpoints can be abused without application authorization.
- Stored event and blog content reaches unsafe HTML-capable render paths.
- External iframe and navigation URLs are not governed by a complete allowlist.
- Production logs disclose email addresses and authentication details.
- ESLint fails with 10 errors and 340 warnings.
- The dependency graph contains 42 known vulnerabilities, including 25 high-severity findings.
- The successful production build emits multiple oversized application chunks.
- Fresh schema is not reproducible from migrations alone.
- `event_attendance` and three used RPCs are missing from version control.
- No automated tests or CI exist.
- PWA is disabled.
- PSU branding and domains remain throughout configuration and content.

## Appendix A. Service-to-data summary

| Service | Primary data or integration |
|---|---|
| `adminService` | `admin_users`, `admin_actions`, admin auth/password RPCs |
| `attendanceService` | `event_attendance`, `events`, missing attendee count RPCs, confirmation email |
| `auditService` | `admin_actions`, `admin_users` |
| `blogCommentsService` | `blog_comments`, `blog_posts`, comment notification |
| `blogReactionService` | Browser reaction utility, no direct table detected |
| `blogService` | `blog_categories`, `blog_posts`, `blog_likes` |
| `blogSubmissionService` | `blog_submissions`, comments, `blog-submissions` bucket |
| `cacheService` | Client cache utility |
| `channelsService` | `channels`, `channel_messages` |
| `communicationsService` | Announcements, reads, tasks, comments, internal messages, email |
| `contactService` | `send-contact-form` Edge Function |
| `contentService` | Site settings/content and multiple public feature tables |
| `csrfService` | `/api/csrf` |
| `emailService` | `send-event-email` Edge Function |
| `eventsEmailService` | Email composition and scheduling helpers |
| `eventsService` | `events`, `event_attendance` |
| `financesService` | Finances, budgets, attachments, admin users |
| `inputValidationService` | Validation utility |
| `linktreeService` | Linktree profiles, links, analytics, click RPC |
| `mediaService` | Media tables, `media` bucket, admin users |
| `membersService` | `members`, `team_members` |
| `newsletterService` | Subscribers, campaigns, templates, rate limit RPC, campaign Edge Function |
| `notificationService` | Notifications, memberships, admin users |
| `optimizedContentService` | Cached composition over content services |
| `permissionsService` | `team_page_access`, client role and permission logic |
| `preloaderService` | Resource preload utility |
| `profileMergingService` | `team_members`, `admin_users` |
| `projectStarsService` | `project_stars`, `projects` |
| `projectsService` | `projects`, `project_members` |
| `requestService` | Request concurrency utility |
| `resendService` | `send-email` Edge Function and `/api/send-email` fallback |
| `resourcesService` | `resources`, missing view increment RPC |
| `securityService` | Security events, admin users, admin actions |
| `sessionService` | `/api/session` |
| `siteStatusService` | `site_status` |
| `sponsorContentService` | Sponsor tiers, sponsors, impact statistics |
| `sponsorsService` | `sponsors` |
| `teamActivityService` | `team_activity_log` |
| `teamInviteService` | `team_invites` |
| `teamManagementService` | Teams, memberships, users, permissions, announcements |
| `teamMessagingService` | `team_messages` |
| `teamService` | `team_members` |
| `teamStatisticsService` | Memberships, messages, announcements, teams, finances, statistics |
| `whiteboardService` | `whiteboards` |

## Appendix B. Migration manifest

Classification is mechanical and describes SQL content, not an inclusion decision. Every file must be considered during canonical baseline reconstruction.

| Migration | Detected content |
|---|---|
| `001_add_password_auth.sql` | create table, alter table, RLS, DML |
| `002_content_management.sql` | create table, alter table, RLS |
| `003_admin_users_management.sql` | create table, alter table, function, trigger, RLS, DML |
| `004_add_members_table.sql` | create table, alter table, RLS |
| `005_add_resources_table.sql` | create table, alter table, RLS |
| `006_add_team_members_columns.sql` | alter table, RLS |
| `007_fix_admin_rls_policies.sql` | alter table, RLS |
| `007_update_newsletter_subscribers.sql` | alter table, RLS, DML |
| `008_add_blog_approval_columns.sql` | alter table, DML |
| `008_add_newsletter_campaigns.sql` | create table, alter table, RLS, DML |
| `009_add_security_events.sql` | create table, alter table, function, trigger, RLS, DML |
| `010_fix_security_and_passwords.sql` | create table, alter table, function, trigger, RLS, DML |
| `011_create_communications_system.sql` | create table, alter table, function, trigger, RLS, DML |
| `012_create_media_system.sql` | create table, alter table, function, trigger, RLS, DML |
| `013_create_blog_system.sql` | create table, alter table, function, trigger, RLS, DML |
| `014_ensure_audit_log.sql` | alter table, RLS, DML |
| `015_fix_media_storage.sql` | function, storage, DML |
| `016_add_blog_submission_comments.sql` | create table, alter table, function, trigger, RLS |
| `016_fix_storage_policies.sql` | function |
| `017_fix_blog_submission_comments_rls.sql` | alter table, RLS |
| `017_update_audit_actions.sql` | alter table |
| `018_fix_blog_submissions_rls.sql` | RLS |
| `019_fix_communications_rls.sql` | RLS |
| `020_create_blog_comments.sql` | create table, alter table, function, trigger, RLS, DML |
| `021_add_comment_notification_trigger.sql` | extension and trigger-related setup |
| `20241224000001_create_linktree_tables.sql` | create table, alter table, function, trigger, RLS |
| `20241224000002_add_increment_function.sql` | function, DML |
| `20241224000003_add_external_attendees.sql` | alter table, DML |
| `20241225000001_fix_security_issues.sql` | alter table, RLS |
| `20241226_blog_improvements.sql` | create table, alter table, RLS, DML |
| `20241227_create_blog_likes.sql` | create table, alter table, function, trigger, RLS, DML |
| `20241227_create_public_blog_bucket.sql` | create table, alter table, RLS, storage, DML |
| `20250119_add_sponsors_page_content.sql` | create table, alter table, RLS, DML |
| `20250119_setup_media_storage_policies.sql` | RLS, storage, DML |
| `20250127_add_event_level.sql` | alter table, DML |
| `20250127_add_project_stars.sql` | create table, alter table, function, trigger, RLS, DML |
| `20250127_create_projects_table.sql` | create table, alter table, function, trigger, RLS, DML |
| `20250127_fix_admin_project_permissions.sql` | RLS, DML |
| `20250127_fix_blog_likes.sql` | create table, alter table, RLS |
| `20250127_fix_linktree_policies.sql` | RLS |
| `20250127_fix_newsletter_subscribers.sql` | create table, alter table, RLS |
| `20250127_fix_project_stars_trigger.sql` | function, trigger, DML |
| `20250127_fix_projects_policies.sql` | RLS |
| `20250127_production_rls_policies.sql` | alter table, function, RLS, DML |
| `20250127_simple_production_rls.sql` | alter table, RLS, DML |
| `20250128_add_embed_type_to_linktree_links.sql` | alter table, DML |
| `20250128_add_overdue_task_automation.sql` | function, DML |
| `20250128_add_show_click_count_to_linktree_links.sql` | alter table, DML |
| `20250129_add_page_content_defaults.sql` | DML |
| `20250129_create_site_status_table.sql` | create table, alter table, RLS, DML |
| `20250129_move_meeting_to_contact.sql` | DML |
| `20250130_debug_rls_issue.sql` | alter table |
| `20250130_finalize_rls_security.sql` | alter table, RLS |
| `20250203_add_newsletter_rate_limiting.sql` | create table, function, DML |
| `20250203_enable_sponsor_tables_rls.sql` | alter table, RLS |
| `20250203_fix_function_search_paths.sql` | function, DML |
| `20250203_fix_remaining_function.sql` | function, trigger, DML |
| `20250203_recreate_triggers.sql` | trigger |
| `20250209_add_team_section_to_members.sql` | alter table, DML |
| `20250209_add_team_section_to_team_members.sql` | alter table, DML |
| `20250224_add_announcement_scheduling.sql` | alter table, DML |
| `20250224_additional_features.sql` | create table, alter table, function, RLS, DML |
| `20250224_create_team_hierarchy_system.sql` | create table, alter table, function, trigger, RLS, DML |
| `20250224_team_features_expansion.sql` | create table, alter table, trigger, RLS, DML |
| `20250316000000_create_secure_auth_function.sql` | function, DML |
| `20250316000001_fix_rls_policies.sql` | alter table, function, RLS |
| `20250321000000_fix_storage_policies.sql` | function, RLS, storage, DML |
| `20250321000001_add_session_management.sql` | create table, alter table, function, RLS, DML |
| `20250321000002_add_csrf_protection.sql` | create table, alter table, function, RLS, DML |
| `20250321000003_improve_auth_security.sql` | function, DML |
| `20250321000004_add_monitoring_alerts.sql` | create table, alter table, function, trigger, RLS, DML |
| `20250321000005_fix_newsletter_rls.sql` | RLS |
| `20250321000007_add_update_password_function.sql` | function, DML |
| `20250321000008_sync_storage_to_media_files.sql` | function, storage, DML |
| `20250321000009_fix_media_rls_policies.sql` | RLS |
| `20250321000010_fix_all_rls_policies.sql` | global policy reset to unconditional access |
| `20250321000011_add_event_link.sql` | alter table |
| `20250404000000_add_clear_rate_limit_function.sql` | function, DML |
| `20260616000001_add_event_columns.sql` | alter table |
| `20260616000002_channels.sql` | create table, alter table, unconditional RLS, DML |
| `20260616000003_public_media.sql` | alter table, RLS |
| `20260616000004_whiteboards.sql` | create table, alter table, unconditional RLS |

## Appendix C. Verification commands

Representative commands used:

```bash
git status --short --branch
git rev-parse HEAD
rg -c '<Route ' src/App.tsx
rg -o '<PageAccessGuard>' src/App.tsx | wc -l
find src/services -maxdepth 1 -type f -name '*.ts' | wc -l
find src/pages/admin -maxdepth 1 -type f -name '*.tsx' | wc -l
find src/components -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l
find api -type f -name '*.mjs' | wc -l
find supabase/functions -mindepth 2 -maxdepth 2 -type f -name 'index.ts' | wc -l
find supabase/migrations -maxdepth 1 -type f -name '*.sql' | wc -l
rg -n 'event_attendance|increment_attendees_count|decrement_attendees_count|increment_resource_views' .
rg -n 'admin_secret_code' src/components/Footer.tsx
rg -n 'allow_all_|USING \(true\)|WITH CHECK \(true\)' supabase/migrations
find . -type f \( -name '*.test.*' -o -name '*.spec.*' \)
```

## Final status

**Repository audit:** Complete for version-controlled source.  
**Deployment verification:** Not performed.  
**PRD use:** This document supersedes the earlier generated PSU audit as the technical baseline for PRD v1.5.
