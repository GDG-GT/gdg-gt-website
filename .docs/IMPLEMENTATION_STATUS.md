# PRD v1.5 implementation status

The full PRD is now in scope following Tejas's request on 2026-10-19. This is an
incremental implementation tracker, not a completion or launch claim.

## Current checkpoint

### Private direct messages and audited review — 2026-10-20

- Communications now has Tasks and Messages workspaces. The inbox uses protected
  APIs, fixed one-to-one participants, exact-email addressing, normalized search,
  scoped counts and cursor pagination. Sender/session identities are server-owned.
  Ordinary Admins cannot read unrelated conversations; Super Admins do not receive
  implicit private-body access. No browser table-read or RPC grants were added.
- Added same-thread replies/quote references, bounded plain text, author-only
  revision-checked edits, retained removal placeholders/restoration, explicit
  recipient-only read acknowledgments and independent personal archives. New
  replies unarchive both personal inboxes. Inactive recipients cannot receive new
  messages, but authorized historical records remain readable.
- Source Super Admin oversight is an explicit password-confirmed, reason-recorded,
  five-minute review bound to one opaque session. Review is read-only and reads
  are audited. Stop/expiry denies the next HTTP request/token mint. Review socket
  JWTs cannot outlive their proof, including near-expiry issuance. Browser review
  data clears at its deadline; unsent drafts survive ordinary live refresh.
- Private exact-topic sockets and durable jobs carry identifiers only. Delivery
  rechecks accounts/message/worker lease, deduplicates generic in-app notices and
  emails a protected link without the subject/body. Local Mailpit delivery was
  verified. No external mail or production send was enabled.
- Actual local suite: 39 independent-session HTTP/WebSocket/mail checks, plus a
  held browser fixture with a real remote follow-up. Browser sent, edited, removed
  and restored a message, and preserved an unsent draft during live refresh.
  Desktop 1280/1280 px; phone 375/375 px (height 1789 px). Real wheel scrolling
  reached 812 px. Overrides reset; fictional threads/accounts recoverably archived
  and notices read. Evidence: `ui-review/real-direct-message-wide.jpg`,
  `ui-review/real-direct-message-mobile.jpg`,
  `ui-review/real-direct-message-cleanup.jpg`. Impeccable kept the existing calm
  palette/controls and moved exceptional review into a disclosure.
- All 44 canonical migrations applied locally. SQL covers participants/reviewers,
  archives, conflicts, read receipts, tombstones, notice fencing/deduplication,
  session/socket expiry and both 100-client capacity regressions. All 155 unit
  tests, TypeScript, scoped ESLint and production build pass; existing bundle
  warnings remain. Read errors recover separately from action errors, and short
  proof-bound renewal avoids once-per-second churn throughout the final minute.
- Full PRD/COMM acceptance remains open: chapter announcements, scoped email
  campaigns, private attachments, remaining modules and final quality/security/
  accessibility gates still need implementation and verification.

### Scoped tasks, comments and overdue automation — 2026-10-20

- Communications now opens the protected Tasks workspace; the legacy page entry
  is a compatibility wrapper, not a browser database/scheduler implementation.
  Active accounts receive an own-communications route, while every record read and
  mutation is resolved separately. Blog Editors see assigned/own task summaries,
  not unrelated chapter work. Navigation links respect current route eligibility.
- Implemented private creator/assignee and explicitly granted team scope,
  server-owned creation/attribution, eligible assignment, filters/counts/paging,
  detail editing, revision conflicts, status transitions, recoverable archive /
  restore and password/title-confirmed reassignment. Former private assignees lose
  access immediately on the next request. Private personal-task recipient probes
  receive a uniform denial before any unrelated account lookup.
- Comments have cursor history, idempotent posting, author-only edits, permitted
  soft deletion, tombstones and revision checks. Status and assignment activity is
  immutable through the comment API and projects safe, readable transition data.
  Private account emails are not returned in task or comment projections. Shared
  validation covers date-only calendars, bounded plain text, tags and state; byte
  limits accommodate valid full-length Unicode descriptions/comments.
- Added a separate-secret, distributed-lease overdue job at 15-minute cadence.
  UTC calendar deadlines are marked once per deadline occurrence. Reopening a
  late task does not duplicate its notice; changing the deadline creates a new
  occurrence. Completed/archived tasks and inactive teams are excluded. Durable
  notification delivery rechecks current assignee, scope, occurrence and worker
  lease, and carries only generic text with a protected task deep link.
- Actual local integration: 41 task/worker checks plus 7 recipient-privacy /
  Unicode regression checks. Real independent sessions exercised editor/assignee /
  outsider boundaries, comments, reassignment, stale writes, date round-trips,
  authenticated scheduling, duplicate suppression and fenced delivery. No rate or
  scheduler state was reset. All new fictional tasks/accounts were recoverably
  archived; their notifications were marked read. Local scheduler restarted with
  the new cadence and completed a clean zero-work overdue run.
- Browser posted a fictional note, completed a task, reviewed the safe activity
  history and confirmed preservation/blocking of a stale staged title. Phone
  editor viewport/document widths 375/375 px, height 2811 px; override reset.
  Actual wheel scrolling moved the review page from 0 to 604.5 px, then reset.
  Evidence: `ui-review/real-task-completed-desktop.jpg`,
  `ui-review/real-task-editor-mobile.jpg`, `ui-review/real-task-conflict.jpg`.
  Impeccable guidance kept the existing restrained admin controls/palette and
  improved task-navigation spacing rather than introducing a new visual system.
- All 42 canonical migrations applied locally. Isolated SQL covers nullable
  assignees failing closed, private scope, revisions, comments, occurrence/worker
  fencing and both existing 100-client capacity checks. All 141 units, TypeScript,
  scoped ESLint and production build pass, with prior bundle warnings remaining.
- This is not complete COMM/PRD acceptance. Chapter-wide announcements, direct
  messages, scoped email fan-out, private attachments and remaining modules/gates
  still require implementation and verification. No production deployment or
  external mail was performed.

### Protected, versioned live whiteboards — 2026-10-20

- The active Whiteboards route and legacy compatibility entry points now use
  protected APIs instead of browser database reads/writes or Postgres Changes.
  Private creator/explicit-collaborator scope and team-scoped action grants are
  checked per operation. Explicit viewer/editor admission does not change chapter
  roles; former team members cannot retain a team board through collaboration.
- Implemented scoped search/counts/pagination, create, rename, explicit sharing /
  revocation with password confirmation, read-only viewers, portable scene export,
  recoverable archive and administrative restoration. Sharing changes recheck
  current password identity under the hierarchy lock. Collaborator email inventory
  is available only to board managers. Archived boards cannot be written.
- Autosaves require both version and saved timestamp, use idempotency keys and
  serialize concurrent edits. Stale writes return 409. Unsaved drawing/details
  remain in tab memory; users can download a local drawing copy or explicitly
  reload the server version. An open metadata form also blocks silent adoption of
  a remote version. Native drawing normalization does not count as a user edit.
- Shared Zod validation runs in the editor and API. Scene limits reject embeds,
  images, files, executable links, invalid coordinates/styles, excessive nesting,
  duplicate IDs, overlong text and oversized drawings. Editor cloud features and
  file imports are disabled. Editor JS/CSS load lazily; packaged fonts are prepared
  locally, with asset-path configuration evaluated before the editor package.
- Private whiteboard sockets use the existing short-lived single-topic role and
  restrictive policy. Broadcasts contain only board identity, never scene data.
  Rejoins reread the API. Revocation requests immediate reauthorization, with the
  same five-minute hard expiry bound. No application-table browser grants added.
- Actual independent-session HTTP/WebSocket integration: 38 checks, including
  exactly one winner from two concurrent saves, timestamp conflicts, scope and
  viewer/editor boundaries, private socket topic isolation, metadata-only
  broadcasts, table-read denial, export and archive recovery. Temporary accounts
  and boards were recoverably archived. Repeated runs respect confirmation/login
  quotas; a read-only preflight avoids creating fixtures during cooldown.
- Browser created a separate fictional board, drew/autosaved a shape, fitted it
  at 375 px, downloaded and verified its `.excalidraw` scene, and recoverably
  archived it. The generated export remains in Downloads. A second live fixture
  demonstrated remote refresh, preservation of a staged rename on conflict, and
  explicit server-version recovery. Responsive override reset. Evidence:
  `ui-review/real-whiteboard-live-desktop.jpg`,
  `ui-review/real-whiteboard-fit-mobile.jpg` (375/375 px width, height 1512 px),
  `ui-review/real-whiteboard-conflict.jpg`, and
  `ui-review/real-whiteboard-review-cleanup.jpg`. Existing restrained admin tokens
  and controls were preserved under the Impeccable product-UI guidance.
- All 37 migrations applied locally; isolated SQL covers team and explicit scope,
  session revocation, idempotency and Realtime, plus both 100-client capacity tests.
  All 135 unit tests, TypeScript and scoped ESLint pass. Production build passes
  with existing bundle warnings. This is not full PRD/production completion:
  communications/tasks, team chat, financial workflows, other unfinished content
  modules and final accessibility/security/performance gates remain.

### Private Realtime channels and notifications — 2026-10-20

- Connected the active channel workspace and notification bell/inbox to private
  Broadcast subscriptions. Content still travels through authorized HTTP reads,
  not socket payloads or browser database queries. A rejoin triggers a fresh read;
  foreground polling remains a recovery/backstop path.
- PRD token endpoint is `/api/v1/auth/realtime-token`; the earlier local spelling
  remains a compatibility alias. Session + CSRF issuance validates current scope
  and produces a maximum-five-minute token containing a least-privileged socket
  role, exact topic, permission version and server-backed grant identity. A
  restrictive policy prevents future permissive policies widening this role.
- Production signing accepts imported ES256 P-256 keys; symmetric signing is
  explicitly restricted to the isolated loopback development stack. No signing
  material, bearer token or private profile data is stored in browser storage.
  Separate clients prevent channel and notification tokens broadening each other.
- Logout/session failure disconnect immediately. Account/session/membership and
  team-state changes broadcast a body-free reauthorization instruction. Clients
  tear down old scopes and request current grants; the five-minute expiry remains
  the hard server-enforced maximum for a client ignoring that instruction.
- Actual local integration: 19 checks, including real private joins, cross-room /
  cross-account rejection, signature tampering, token expiry, revoked sessions,
  PostgREST table/RPC denial and metadata-only database broadcasts. Additional
  browser review saw a new message and unread count appear without page reload.
  Fictional rooms recoverably archived; only the review notification marked read.
- Browser evidence: `ui-review/real-channel-live-desktop.jpg` (natural 885 px
  viewport, full page), `ui-review/real-channel-live-mobile.jpg` (375 px viewport,
  document width 375 px, height 1348 px), `ui-review/real-notification-live.jpg`.
  Temporary responsive override reset. The restrained approved admin palette and
  existing control vocabulary were preserved during this Impeccable UI pass.
- Canonical migrations through 033 applied locally, with isolated SQL scope and
  concurrency checks. All 129 unit tests, TypeScript, scoped ESLint and production
  build pass; existing bundle warnings and broader production acceptance remain
  open. This is not complete COMM or full PRD acceptance.
  Whiteboards/team chat/content refresh, private attachments, tasks, finances,
  remaining modules and final accessibility/performance/security gates remain.

### Protected channel core — 2026-10-20

- Active Channels route now uses protected room and message APIs. Private rooms
  default to explicit membership, internal rooms have a defined chapter audience,
  and team rooms require current active team membership. Existing editor accounts
  receive a channel route only after explicit room admission; admission does not
  expose other internal rooms. Metadata edits cannot silently widen room scope.
- Room administration confirms the actor's password; role/member changes and
  archive/restore are revision-checked and audited. Messages support session-owned
  senders, idempotent sends, sender-only edits, moderator pins, same-room replies,
  soft-deleted tombstones, read markers and derived unread counts. Deleted text
  is excluded from message projections and reply previews. Archived rooms are
  read-only, including for administrators.
- Message history uses stable timestamp/ID cursors; explicit memberships are
  paginated and ordinary recipients do not receive private account emails. UI
  preserves an unsent draft on failure, separates room-change state, supports
  replies and pin views, and refreshes through the protected API every five seconds.
  This polling is explicitly not claimed as the required scoped Realtime feature.
- Actual independent-session local HTTP integration: 33 checks. Isolated SQL
  includes NULL-denial checks, private scope, idempotency, cross-room reply denial,
  sender/moderator boundaries, deleted-preview removal and unread markers. All 29
  migrations are applied locally. Unit count: 113; TypeScript, scoped ESLint and
  build pass, with existing bundle warnings remaining.
- Browser sent a fictional message, replied and pinned the original in a private
  test-only room. Evidence: `ui-review/real-channel-conversation-desktop.jpg`
  (1440 px full-page capture), `ui-review/real-channel-conversation-mobile.jpg`
  (375 × 812). Mobile viewport/document widths 375/375 px; height 1559 px. Temporary
  viewport reset and room recoverably archived, preserving fictional messages.
- Scoped Realtime, private message attachments, richer search/notifications and
  remaining collaboration/PRD modules are still required. No production or full
  channel acceptance claim is made by this checkpoint.

### Team announcements and durable notifications — 2026-10-20

- Team announcements now have protected draft/edit/publication, scheduling,
  expiry, priority, independent pinning, account-owned read acknowledgements,
  revision conflicts, recoverable archive and restore-as-draft workflows.
  Ordinary members cannot see drafts or scheduled/expired posts, and inaccessible
  records are filtered before counts. Editing a published body returns it to draft.
- Publication snapshots the active team audience and queues a durable, scheduled
  notification job. The fenced worker rechecks current team/account membership,
  publication version, expiry and active team state before delivery. Duplicate
  claims do not duplicate notifications. Notifications contain generic metadata
  and a protected deep link, never the private post body. Pinning does not change
  publication identity or accidentally cancel scheduled delivery.
- Actual local API/notification integration: 24 checks. Isolated SQL additionally
  covers worker lease rejection and delivery/read idempotency. All 28 migrations
  are applied locally. Current unit count: 108; TypeScript, scoped ESLint and
  production build pass, with the previously documented bundle warnings remaining.
- Browser-created a fictional draft, explicitly confirmed publication, and read
  the real committed post. Captures:
  `ui-review/real-team-announcement-published-desktop.jpg` (1440 × 900), and
  `ui-review/real-team-announcement-published-mobile.jpg` (375 × 812). Phone
  viewport/document widths are both 375 px, content height 1471 px. Viewport reset.
  The temporary team was recoverably archived and the scheduler restored.
- Corrected team-workspace title/sidebar selection so a team deep link is not
  mislabeled as the unrelated public-profile editor. Restored visible selected-tab
  styling for the team navigation. No external recipient or production data used.
- Richer team statistics, messages/tasks/channels/whiteboards, finances, remaining
  private/content modules and final cross-browser/security/accessibility gates
  remain unfinished. Full PRD and production completion are not claimed.

### Secure team invitation lifecycle — 2026-10-20

- Team invitation management and the recipient route now use same-origin APIs.
  The active legacy path-token invitation page no longer loads the browser
  database flow; new invitations use `/team/join#invite=...` and remove the fragment
  from the visible address. Raw capabilities never appear in manager responses.
- Invitations are single-use, email/account-bound, valid for seven days, and
  hashed at rest. Encrypted outbox delivery supports deduplicated recipients,
  cooldown-protected resend rotation and revocation. Acceptance rechecks the
  inviter's current authority and team state. Losing lead/admin authority closes
  outstanding links rather than preserving a stale privilege.
- Existing recipients must sign in as the intended account and pass CSRF; the
  invitation cannot overwrite credentials or change their chapter role. New
  recipients choose a password and receive only the fixed Team Member account
  role, plus the explicitly approved team membership role. No automatic session
  or chapter-gate bypass is issued.
- Actual local HTTP/SMTP integration: 28 checks, including encrypted-secret
  cleanup after local delivery, duplicate prevention, email mismatch, replay,
  wrong-account rejection, unchanged existing credentials, resend/revoke and
  inviter-authority loss. All fictional teams/accounts were archived. Local mail
  capture only; no external email or remote account changes occurred.
- All 27 migrations and isolated SQL checks pass, with 104 unit tests, TypeScript,
  scoped ESLint and build checks passing. Browser review covered the invitation
  composer and unsaved granular Forms-grant controls; no browser-created
  credential or permission change was submitted. Evidence:
  `ui-review/real-team-invitations-desktop.jpg` (1440 × 900),
  `ui-review/real-team-invitations-mobile.jpg` (375 × 812), and
  `ui-review/real-team-grants-desktop.jpg`. Mobile document width is 375 px,
  content height 1577 px; actual wheel scrolling moved 765 px. Viewport reset.
- The temporary visual fixture was recoverably archived after review. The local
  scheduler was restored after deterministic delivery tests. Team announcements,
  richer historical statistics, collaboration, broader security/accessibility
  acceptance and the remaining PRD modules are still required.

### Team membership and grant administration — 2026-10-20

- Team directory and individual team routes now use protected APIs. Chapter
  administrators can create/edit/archive/restore teams, with a required founding
  lead and no default page grants. Team members see only their current active
  memberships; unrelated records are filtered before counts and pagination.
- Leads/co-leads can add/remove ordinary members within their own team but cannot
  grant officer roles, change chapter roles, edit security permissions or transfer
  people across teams. Chapter administrators can assign team roles and transfer
  memberships atomically. The final active lead is protected in both membership
  operations and account deactivation. Account roles are not team roles.
- A structured page/action editor covers 16 operational surfaces and explicit
  Forms response/sensitive/export actions. Security/user/audit controls cannot be
  delegated here. Special-action rows no longer imply general read/edit access.
  Current grants are applied on the next request. Team restoration leaves previous
  page grants disabled for deliberate reapproval.
- Transfers preserve inactive source membership, create member-level destination
  access, append a transfer record and activity entries in one transaction, and
  drop old team grants immediately. Activity and transfer records are append-only.
  Ordinary members receive display names, not private account emails. Counts are
  derived from actual current memberships rather than placeholder statistics.
- Local HTTP integration: 28 checks with independent lead/member/outsider
  sessions. Only newly created fictional teams/accounts were used and archived.
  All 26 migrations are applied locally. Isolated SQL, 104 units, TypeScript,
  scoped ESLint and production build pass; existing production performance and
  security acceptance gates remain open. Mobile editor width/document width:
  375/375 px; content height 1762 px. Proof: `ui-review/real-team-editor-mobile.jpg`.
- Invitations, announcements, richer historical statistics and collaboration
  remain unfinished. This checkpoint does not claim complete TEAM acceptance,
  full PRD completion or production readiness.

### Protected account management — 2026-10-20

- The active Users screen now uses protected server APIs, not the legacy browser
  database service. Creation, role/name edits, activation, session inspection and
  revocation, reset, recoverable archival and inactive restoration are connected.
  Directory access is Super Admin only; Admin API operations are restricted to
  Team Member / Blog Editor targets and cannot grant privileged roles.
- Every account mutation confirms the actor's password; high-impact actions also
  require typed target identity. The database rechecks the current actor, session,
  verified password hash, target hierarchy and optimistic revision under a shared
  hierarchy lock. Self-management uses the separate own-profile routes; users
  cannot self-elevate, deactivate or archive through this API.
- New accounts use an undisclosed random credential and must complete setup.
  Single-use, email-bound setup/reset capabilities expire in 24 hours, are hashed
  at rest, and enter the outbox only encrypted. Administrators never receive raw
  links or temporary passwords. The recipient page removes the URL fragment and
  stores no capability/password in browser storage. Reset blocks old passwords
  and revokes existing sessions; role and activation changes also revoke sessions.
- Real local HTTP integration: 31 checks, including setup replay/email binding,
  immediate next-request revocation, role escalation denial, resend cooldown,
  recoverable archival and restore-as-inactive. Fictional accounts were archived.
  Local scheduler handles the added delivery kind; no external email was sent.
- Isolated database tests pass with 24 forward migrations, plus both existing
  100-client concurrency checks. Existing 97 unit tests, TypeScript, scoped ESLint
  and production build pass. Mobile editor is 375 px wide with document width
  375 px and 1865 px scrollable content. Screenshot:
  `ui-review/real-account-editor-mobile.jpg`. Browser creation was inspected but
  not submitted; credential/setup flows were tested through the local HTTP suite.
- This is not full security/teams completion. Security-event/alert tooling,
  team administration/invitations/transfers, short-lived Realtime scopes and the
  broader PRD modules below remain required, along with final accessibility,
  security coverage, dependency and performance acceptance.

### Public content operations — 2026-10-20

- Resource, sponsor, sponsorship-tier, impact-statistic and public team-profile
  routes now use same-origin server APIs instead of legacy browser database
  services. New records are private drafts. Publishing is a separate permission;
  edits return published records to review. Optimistic revisions, team ownership,
  explicit team grants, duplication where valid, archive/restore, filtered
  inventory and mutation audits are implemented. Tier levels remain unique.
  Linked public-profile edits cannot silently bypass publication review.
- Site-content editing covers approved identity settings and links, structured
  page copy, navigation, social links, and footer copy. Configuration keys are
  allowlisted; server credentials cannot be read or changed through this editor.
  Private Blog/Projects routes cannot be added as public navigation or page copy.
  Navigation parent cycles are rejected. Public aggregates include only published
  copy and omit editor identities. Header/home/contact copy, public navigation,
  footer/social links, sponsorship packages and approved impact figures consume
  those values. Unsupported legacy content shapes still need migration review;
  this is not a claim of complete CMS schema or visual acceptance.
- Actual local content API integration: 23 checks. Site-content API/public
  serialization integration: 16 checks. All fictional fixtures were archived,
  including the resource created and published through the browser. The browser
  proof captures the temporary published fixture, not real chapter content.
- Twenty-two migrations are applied in actual local Supabase. Isolated SQL tests
  cover scoped content grants, draft/publication separation, stale revisions,
  recoverable archival, CMS field restrictions and navigation cycles, as well as
  the existing event/Form 100-client tests. Unit count is now 97; type-check,
  scoped ESLint and production build pass. Existing vendor chunk/performance,
  dependency, strictness, coverage and broad accessibility gates remain open.
- Mobile CMS copy editor: viewport/document width both 375 px, content height
  2115 px, observed scroll movement 812 px. Human-readable section-specific fields
  replace the initial all-fields-at-once editor. Evidence:
  `ui-review/real-cms-editor-mobile.jpg` and
  `ui-review/real-resource-published-desktop.jpg` (1440 × 900).
- Finances, users/team administration, channels/whiteboards, private editorial
  workflows, campaigns, media management and Linktree still need their own real
  server migrations. Forms work noted below remains partial. Full PRD completion
  and production readiness are not claimed.

### Private Forms workflows and worker runtime — 2026-10-20

This pass extends the checkpoint below; the complete PRD remains unfinished.

- Invitation, unlisted-link, and verified-email issuance now use hashed access
  tokens, encrypted recipient/delivery secrets, deduplicated recipient batches,
  final confirmation, resend rotation/cooldown, revocation, and masked status UI.
  The local SMTP worker delivers private fragment links, not raw tokens to admins.
  Actual local API/database/mail integration: 34 checks.
- Private form uploads use 120-second, one-object signed direct PUTs, expected
  size/MIME/checksum validation, durable scan jobs, a real native ClamAV worker,
  detected-content validation, image metadata stripping, and separate randomized
  clean objects. A replayed upload cannot modify promoted bytes. Response-file
  downloads require current form/response/sensitive permissions and are audited;
  download capabilities expire in 60 seconds. Real Storage/scanner/API checks: 36.
- File association and removal serialize with final submission. Saved drafts bind
  files to the respondent capability; cleanup preserves active resume drafts and
  committed response attachments. Expired/abandoned/rejected form uploads are
  tombstoned and cleaned after the retention delay, with retries on object errors.
- Section routing and early endings are shared between browser and server.
  Publication rejects backward cycles, invalid destinations, conflicting rules,
  unreachable sections, and tested unreachable required-field conditions. Actual
  HTTP branching/republication integration: 11 checks. Five distinct reusable
  templates and a blank starter contain structure only. Stable option IDs survive
  reorder-plus-rename without duplication.
- A separate bearer-authenticated scheduler rejects browser origins/cookies,
  records fenced run IDs, counters and retries, and deduplicates completed cadence
  occurrences. Local form schedules run every five minutes, draft/upload cleanup
  hourly, and mail delivery every minute. Scan work runs outside request handlers.
  Job API integration: 10 checks; actual scanner health/clean/EICAR checks: 3.
- Nineteen forward migrations are applied to actual local Supabase. Isolated SQL
  tests include access, upload quotas, draft-file binding, cleanup protection,
  worker/job lease fencing, and both 100-client concurrency checks. Latest unit
  count: 91. TypeScript and scoped ESLint checks pass. Production build still has
  vendor chunk warnings; full security/coverage/accessibility gates remain open.
- Browser review confirmed the inspector dialog scrolls (589 px viewport,
  708 px content, 119.5 px actual scroll movement) and public form document width
  equals its 885 px viewport. File-picker automation requires the browser
  extension's file-URL permission; it was not broadened silently. Actual signed
  byte upload and scanning are independently verified through integration tests.
- Native scanner, local scan worker, and precise local scheduler are development
  processes only. No production scanner/scheduler or email provider was deployed.
  Forms still needs asynchronous large exports, full historical-revision UI,
  reviewed receipts/notification settings, comprehensive privacy retention, and
  complete role/browser/accessibility acceptance. Other PRD modules listed below
  remain in scope and require implementation, not just UI routes.
- `.env.example` no longer recommends browser-exposed email-provider secrets.
  Dedicated local credentials remain ignored and mode 0600. Dependency audit
  remediation is still required; passing build/tests is not a zero-vulnerability
  or production-readiness claim. Current disk check: about 18 GiB free.

### Real local workflows — latest implementation pass, 2026-10-19

This section supersedes older prototype-only statements below. The full PRD is
**not complete**; no staging/production or final visual acceptance is claimed.

- The active browser now uses `/api/v1`, real opaque sessions, and the dedicated
  loopback Supabase database. The fixture adapter is disabled in real-API mode.
  No browser application-table privileges were opened to make this work.
- Event draft/edit/publication, revision conflicts, slug redirects, registrations,
  attendee correction/check-in/soft deletion, CSV, and audience-snapshot email
  enqueueing have server implementations. Local event HTTP evidence has 21 checks;
  audience delivery and all team permission combinations still need more coverage.
- Public CMS reads, team/resources/sponsors/gallery metadata, newsletter double
  opt-in, and contact persistence are server-backed. Local SMTP captures mail;
  no external provider delivery is enabled. Newsletter/contact integration evidence
  has 16 checks. Public image-byte delivery and contact attachments remain open.
- Own-account/profile, password/session management, dashboard widgets, own
  notifications, and append-only audit list/export are connected. Dashboard
  widgets fail independently and omit ungranted sections. Workspace integration
  has 15 real HTTP/database checks, including current-role revocation.
- Forms now has an RLS-locked schema, shared bounded browser/server validation,
  action/team/collaborator authorization, optimistic draft saves, immutable
  published versions, atomic online submissions, hashed resume/edit tokens,
  protected answer revisions, masked sensitive values, filtered responses,
  version-aware summaries, account-owned saved views, CSV/XLSX/JSON downloads,
  operational-hold checks, and identity redaction across historical answers.
  Active library/builder/respondent/response routes use these APIs. No real answers
  or authentication tokens are saved to browser localStorage by these routes.
- Forms remains partial: invitation/verification issuance and delivery UI, complete
  branch/end logic, scanned private uploads, large asynchronous exports, full
  history UI, retention cleanup, reviewed receipts, richer settings/templates,
  and complete action/access-mode acceptance coverage remain required. Publication
  of file fields and receipts is fail-closed until their services are connected.
- Thirteen target migrations applied in actual local Supabase. Isolated SQL tests
  also pass, including **100 event clients: one final-seat registration** and
  **100 form clients: one final-slot response**, with one deduplicated outbox job
  per committed operation. Evidence: `phase0/canonical-tests.json`.
- Latest full verification at this checkpoint: 74 unit tests, TypeScript check,
  ESLint with zero errors, and production build passed. This is not complete
  mandatory PRD test coverage. Build still reports large/circular vendor chunks;
  strict TypeScript, coverage/CI, security/dependency remediation, and browser
  acceptance across all routes remain open.
- Added bounded CSRF refresh/retry for stale tokens, transient auth-error retry
  instead of treating an API outage as logout, and single-request sidebar access
  discovery. The gate now counts failed entries separately from successful opens;
  its five-failure lockout is persistent, with a separate bounded request quota.
- Browser proof: created/published a fictional form, submitted fictional answers,
  then read the committed response in the protected workspace. Dashboard phone
  viewport was 375 px with document width 375 px and real scroll movement of
  812 px. Evidence screenshots are under `ui-review/real-*`. These are verification
  captures, not user visual approval. Temporary viewport was reset.
- Other legacy admin modules still need server migration (CMS mutation, teams,
  users, finance, communications/channels/whiteboards, media, campaigns, private
  blog/projects, and Linktree). Do not mistake an accessible route for a completed
  workflow. The real API no longer silently substitutes preview records.
- Runtime: Vite `127.0.0.1:8080`, watch-mode Node API `127.0.0.1:8081`, isolated
  Colima/Supabase. Current disk check showed about 27 GiB free; older disk errors
  below are historical, not a current blocker. No cloud resources were changed.

- Local public/admin UI prototype exists; see `UI_LOCAL_REVIEW.md` for its limits.
- The yellow palette was rejected. Surfaces now use low-chroma neutral off-whites;
  homepage framing is peach again. Coral and charcoal remain.
- Main public pages and all sidebar destinations were opened and screenshot
  inspected at desktop width after the palette change. No document-width overflow
  was observed. Loading captures are not final visual approval.
- Removed inherited universal scroll-chain suppression. Real wheel input on the
  admin profile moved the document from 0 to approximately 848 CSS pixels.
  Keyboard scrolling also worked on Events. Overlapping legacy modal locks now
  restore the document only when their final owner releases it.
- The new phone-width review was interrupted by browser-control timeouts. It
  remains pending; a viewport reset was attempted but could not be confirmed.
- Resolved the ten inherited ESLint errors without weakening rules. Input-safety
  tests cover normalization, control-character filtering, and HTML text escaping.
  This does not certify the existing sanitizer or legacy API security.
- Mechanical inventory and numbered requirement tracking are generated under
  `phase0/`. Every requirement starts unverified; test IDs/evidence must be filled
  by actual implementation and execution. Normative non-numbered sections apply
  in addition to these numbered IDs.

## Required order from here

1. Phase 0: execute the historical schema in an isolated disposable database,
   record failures and effective catalogs, reconstruct missing objects, derive a
   reviewed canonical GT baseline. Do not run old seed/policy scripts on GT.
2. Local/test infrastructure and CI; dependency remediation and bundle budgets.
3. Deny-by-default data/storage grants, server-only application access, secure
   gate/session/CSRF/authorization primitives and negative tests.
4. Migrate services subsystem by subsystem, preserving route/action/team scope.
5. Complete event registration, collaboration, finance, CMS, newsletter, and
   first-party Forms contracts with real persistence and transaction tests.
6. PWA/offline/push only after protected API and cache security gates pass.
7. Browser/accessibility/load/security/visual acceptance, then authorized staging.

No phase exits on the strength of mock UI behavior. No protected feature is
production-ready while the browser still uses the legacy direct table services.

## Current external inputs / gates

- Hosted GT-owned Supabase, Redis/rate-limit, email, scanner/queue, Realtime signing, and
  deployment credentials are not configured. Do not reuse PSU credentials.
- No domains are assumed to be controlled; no purchase or remote deploy is authorized
  by this local checkpoint.
- Approved marks, final content/recipients, financial retention policy, and Tejas's
  visual sign-off remain launch inputs.
- The latest production dependency audit reports 31 findings (16 high, 14 moderate,
  1 low). These remain open pending individually tested remediation; no blanket
  acceptance or `audit fix --force` has been applied.

Phase 0 is in progress. All later phase exit gates remain open.

## Backend foundation checkpoint — 2026-10-19

- Explicit repair transforms reproduce all 83 historical SQL files with zero
  failures and all 62 source-defined tables in network-isolated PostgreSQL 17.
  Evidence: `phase0/source-replay-repaired.json`. This is source archaeology,
  not a copy of source data or source security policies into GT.
- `database/migrations/202610190001_canonical_structure.sql` reconstructs clean
  structure only. Target tables have RLS and deny browser table/function access.
  Security and public-workflow additions are separate forward migrations.
- All four current target migrations and database tests passed against isolated
  PostgreSQL. A 100-independent-client final-seat test produced exactly one
  registration, 99 full-capacity outcomes, and one durable confirmation job.
  Evidence: `phase0/canonical-tests.json`. Storage/Realtime remain unverified.
- Added server-only scrypt verification, opaque hashed sessions, bound CSRF,
  persistent sliding risk limits, current-role checks, central authorization,
  same-origin validation, safe request envelopes, and redacted telemetry.
- Added `/api/v1` deployment entry and loopback local Node API/Vite proxy.
  Auth, password rotation, and manual Super Admin gate rotation are implemented
  server-side. **The browser UI has not migrated to these real endpoints.**
- Retired unsafe source session, CSRF, arbitrary-email, media, feed, sitemap,
  and keep-alive handlers with no-store HTTP 410 responses. Historical code is
  preserved in Git. Public sitemap must be rebuilt before launch.
- Removed obsolete keep-alive cron and unsafe-eval/third-party tracking hosts
  from production CSP. Staging report-only verification is still required.
- Latest code verification: **58 unit tests pass, typecheck passes, ESLint has
  zero errors, production build passes**. Inherited lint warnings, non-strict TS,
  large chunks, stale browser compatibility data, and dependency vulnerabilities
  remain open. Unit tests use an injected fake store; they do not certify live
  Supabase HTTP integration or complete the PRD's mandatory security suite.
- Migration `202610190004_password_and_lockout.sql` and its SQL test now pass,
  including persistent account lockout, token rotation, other-session revocation,
  and rejection of a stale verified password hash. The canonical test report was
  refreshed after the runtime recovery.

## Resolved local infrastructure blocker

The Mac's disk reached approximately 100 MB free during the updated Supabase
image pull. File writes and Vitest initially failed with `ENOSPC`; Docker then
reported containerd metadata I/O errors. Removed only the 127 MB temporary npm
CLI download created during this work (re-downloadable). File tests/build work
again with approximately 229 MB free, but this is insufficient for the stack.
The attempt to remove eight stopped generated test containers failed with I/O
errors; no successful database/container deletion is claimed.

Follow-up checks showed host space had increased to 39–41 GiB. A non-destructive
Colima restart cleared the runtime's metadata I/O errors. Its kernel log recorded
filesystem recovery from prior I/O failure; a newly downloaded Postgres image
still contained a zero-filled ELF loader. Removing/re-pulling that image reused
the damaged cache. Three stopped diagnostic containers and that image reference
were removed/re-downloadable; no initialized application database was erased.
The full repaired historical replay was also repeated in the new profile:
83/83 SQL files passed and the 62-table catalog was unchanged (only its forensic
container identifier changed). No historical data entered the GT application DB.

The project now uses a separate **`gdg-gt` Colima profile** with 4 CPUs, 4 GiB RAM,
and a 40 GiB sparse virtual data disk. The old default profile is stopped and its
data remains intact. Project commands explicitly select `colima-gdg-gt`, without
requiring a global Docker context switch. Fresh image downloads run successfully.
Supabase CLI **2.121.0** is now pinned in project dev dependencies; the old global
CLI is untouched. No cloud project was changed.

All four migrations applied in actual local Supabase. Database, gateway, Auth,
Storage, Realtime, and local mail containers are healthy. Published ports bind
only to `127.0.0.1`. Platform Auth is enabled for transport key generation; signup
is disabled and application accounts still use custom opaque server sessions.

Local auth was bootstrapped with random, non-default credentials for one fictional
development Super Admin. Private configuration and credentials are ignored by Git
and mode 0600. Nothing was copied from source accounts. Re-running bootstrap
verifies existing credentials and never resets them silently.

`npm run test:local-auth` passed **16 real HTTP integration checks** through Vite,
the Node API, and Supabase, including anonymous table/RPC denial, gate enforcement,
origin checks, role-property rejection, hashed sessions and CSRF, current account
lookup, unsigned-cookie rejection, logout, and revoked-token replay rejection.
Evidence: `phase0/local-auth-integration.json`. This is not full PRD certification.

The UI preview remains on `http://127.0.0.1:8080`. The configured real Node API
listens on loopback port 8081 and is proxied at `/api/v1`. The browser's legacy UI
fixtures have **not** yet been migrated to the real API. No default target admin
password or source credentials were installed. Host space was approximately
34 GiB free after setup; historical free-space readings are not current readings.

## First isolated source replay

`npm run audit:db:source` runs PostgreSQL 17 in a labeled, resource-limited Docker
container with network disabled, no published ports, and no host mounts. It runs
the historical baseline and 82 migrations in lexical order, each in its own
transaction. Historical failures roll back and are recorded, not ignored.

First result: 67 files applied, 16 rolled back, and 53 public tables created versus
62 defined in repository SQL. The report includes SQLSTATEs, image ID, catalog,
constraints, and effective policies: `phase0/source-replay.json`.

Auth/storage in this first source replay are **minimal platform shims**, not a
Supabase security implementation. This is a forensic source-only database, not a
GT target environment. Standalone seed files are not executed; embedded migration
DML remains inside the network-isolated audit container and is never copied to GT.
The exact container is stopped and recoverable; no user containers were deleted.

Remaining Phase 0 work includes resolving dependency order and invalid source SQL,
complete platform-specific verification, reconstructing missing objects, checking
effective grants, and reviewing a clean GT canonical baseline. The replay is
evidence of the reconstruction problem, not completion of the reconstruction.
