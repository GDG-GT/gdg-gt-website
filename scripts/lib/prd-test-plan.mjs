// Reviewed logical acceptance cases. File references identify executable suites,
// not a claim that every assertion, manual review or hosted gate has passed.
export const prdTestCases = [];
const add = (id, requirements, scope, automated, remaining = []) =>
  prdTestCases.push({
    id,
    requirements: requirements.split(" ").filter(Boolean),
    scope,
    automated,
    remaining: [
      ...remaining,
      "Production-like staging review and applicable visual/device/manual acceptance",
    ],
    acceptance: "unverified",
  });
const unit = (name) => `tests/server/${name}.test.mjs`;
const sql = (name) => `database/tests/${name}.sql`;
const local = (name) =>
  `scripts/test-local-${["form-presentation", "form-navigation"].includes(name) ? "form-images" : name}.mjs`;
add(
  "SEC-TEST-030",
  "",
  "Browser database isolation and separate HTML entry preservation",
  ["tests/client-architecture.test.mjs", "tests/phase0-inventory.test.mjs"],
  ["Hosted source and runtime network inspection"],
);
prdTestCases.at(-1).normative = ["26.1", "30", "32"];
add(
  "AUTH-TEST-001",
  "AUTH-001 AUTH-002 AUTH-003",
  "Newsletter field and officer-entry intent",
  ["src/ui/newsletter-entry.test.ts", unit("newsletter-gate"), local("auth")],
  ["Real keyboard Enter/Subscribe/Shift+Enter paths"],
);
add(
  "AUTH-TEST-002",
  "AUTH-004 AUTH-005",
  "Protected salted password hashes and constant-time proof",
  [unit("security"), sql("001_security_foundation"), local("auth")],
);
add(
  "AUTH-TEST-013",
  "AUTH-006 AUTH-007",
  "Generic failed gate/login limits and persistent lockout",
  [unit("auth"), sql("013_gate_failures"), sql("004_password_and_lockout")],
  ["Distributed hosted limiter/load review"],
);
add(
  "AUTH-TEST-011",
  "AUTH-008 AUTH-009 AUTH-010",
  "Opaque 15-minute gate cookie and minimal status",
  [unit("auth"), local("auth")],
);
add("AUTH-TEST-012", "AUTH-011", "Login cannot bypass the gate", [
  unit("auth"),
  local("auth"),
]);
add(
  "AUTH-TEST-014",
  "AUTH-012",
  "Opaque session issuance and hashed persistence",
  [unit("auth"), local("auth")],
);
add(
  "AUTH-TEST-019",
  "AUTH-013",
  "Current session, account and role revalidation",
  [unit("auth"), sql("004_password_and_lockout"), local("session-generation")],
);
add(
  "AUTH-TEST-015",
  "AUTH-014",
  "Unsigned identity and role cookies are ignored",
  [unit("auth"), unit("entry"), local("auth")],
);
add(
  "AUTH-TEST-017",
  "AUTH-015",
  "Logout revokes session and private browser state",
  [unit("auth"), local("auth"), unit("pwa-worker")],
);
add(
  "SEC-TEST-007",
  "AUTH-016",
  "Super Admin manual gate rotation and old capability invalidation",
  [unit("entry"), sql("001_security_foundation")],
  ["Hosted multi-instance gate invalidation"],
);
add(
  "SEC-TEST-008",
  "SEC-001 SEC-003 SEC-006",
  "Same-origin server boundaries and non-authoritative route guards",
  [unit("entry"), unit("access"), "tests/client/api.test.mjs"],
  ["Complete active browser import/network inventory"],
);
add(
  "SEC-TEST-002",
  "SEC-002 SEC-007 SEC-008 SEC-009",
  "No direct browser table/RPC grants or pooled connection identity",
  [sql("001_security_foundation"), sql("030_scoped_realtime"), local("auth")],
  ["Hosted pool/RLS/storage matrix"],
);
add(
  "SEC-TEST-009",
  "SEC-004",
  "Protected dispatch method/session/action/CSRF/validation boundaries",
  [
    unit("http"),
    unit("auth"),
    unit("users"),
    unit("finance-routes"),
    unit("form-admin-routes"),
  ],
);
add(
  "SEC-TEST-010",
  "SEC-005",
  "Dedicated private server client and fail-closed configuration",
  [unit("entry"), unit("secret-scan"), "scripts/scan-secrets.mjs"],
  ["Hosted bundle/env isolation"],
);
add(
  "SEC-TEST-011",
  "SEC-010",
  "Authorized workflow-only email and bounded audiences",
  [
    unit("event-mail"),
    unit("newsletter"),
    unit("form-delivery"),
    sql("089_event_mail_review"),
  ],
  ["Hosted provider delivery/retry/abuse acceptance"],
);
add(
  "SEC-TEST-012",
  "SEC-011",
  "Server-issued short-lived scoped Realtime identity",
  [
    unit("realtime-route"),
    unit("realtime-token"),
    sql("030_scoped_realtime"),
    local("realtime"),
  ],
);
add(
  "SEC-TEST-013",
  "SEC-012",
  "Stored content and email output sanitization",
  [unit("blog"), unit("newsletter"), unit("upload-content"), unit("forms")],
  ["Full browser stored-XSS corpus across every content surface"],
);
add(
  "SEC-TEST-014",
  "SEC-013",
  "URL, private fetch and iframe allowlists",
  [unit("validation"), unit("linktree"), unit("site-status"), unit("push")],
  ["Hosted DNS rebinding/redirect SSRF review"],
);
add(
  "OPS-TEST-001",
  "SEC-014 AUDIT-003",
  "Structured telemetry and credential/content redaction",
  [unit("telemetry"), unit("mail-transport"), unit("audit-routes")],
  ["Hosted log collector privacy review"],
);
add(
  "AUTH-TEST-016",
  "CSRF-001 CSRF-002 CSRF-003",
  "Session-bound CSRF, protected mutation, rotation and logout",
  [unit("auth"), "tests/client/api-session-generation.test.mjs", local("auth")],
);
add(
  "AUTH-TEST-018",
  "CSRF-004",
  "Origin and SameSite supplement explicit CSRF",
  [unit("auth"), unit("http")],
);
add(
  "SEC-TEST-015",
  "CSRF-005",
  "Public origin, idempotency, honeypot and quota controls",
  [sql("007_public_submissions"), unit("form-public-routes"), unit("contact")],
  ["Hosted abuse/load behavior"],
);
const events = [
  [
    "EVT-001",
    "Event state/CRUD and current team/action scope",
    [sql("005_event_operations"), local("events")],
  ],
  [
    "EVT-002",
    "Complete validated event record fields",
    [unit("events"), sql("005_event_operations")],
  ],
  ["EVT-003", "Public event filtering and ordering", [local("events")]],
  [
    "EVT-004",
    "Event detail, schedule, capacity, ICS and share",
    [unit("events"), local("events")],
  ],
  [
    "EVT-005 EVT-008",
    "Atomic capacity enforced in PostgreSQL",
    [sql("003_event_concurrency"), "scripts/test-database.mjs"],
  ],
  [
    "EVT-006 EVT-007",
    "Normalized duplicate prevention and registration idempotency",
    [sql("002_event_registration"), local("events")],
  ],
  [
    "EVT-009",
    "Authorized attendance correction/check-in/removal and summary",
    [sql("005_event_operations"), local("events")],
  ],
  [
    "EVT-010",
    "Confirmation outbox only after committed registration",
    [sql("002_event_registration"), unit("mail-transport"), local("events")],
  ],
  [
    "EVT-011",
    "Published canonical/social/Event raw HTML",
    [unit("site-document"), local("documents"), unit("seo")],
  ],
  [
    "EVT-012",
    "Reconstructed attendance schema and derived counts",
    [sql("002_event_registration"), sql("003_event_concurrency")],
  ],
];
events.forEach(([r, s, a], i) =>
  add(`EVT-TEST-${String(i + 3).padStart(3, "0")}`, r, s, a),
);
add(
  "EVT-TEST-024",
  "EVT-003 EVT-004 EVT-005 EVT-007 EVT-008 EVT-012",
  "Independent URL filters, local timezone, derived availability before pagination and scoped pending registration interactions",
  [
    "tests/client/event-ui.test.tsx",
    unit("public-collections"),
    sql("106_public_event_inventory"),
    local("event-inventory"),
  ],
  [
    "Real supported-device, screen-reader and published lifecycle acceptance; injected DOM transport is separate from actual local SQL/HTTP proof",
  ],
);
prdTestCases.at(-1).normative = ["22.3", "22.4", "28.3", "31.2"];
add(
  "EVT-TEST-025",
  "EVT-002 EVT-004 EVT-011",
  "Derived reschedule history, accurate raw/client metadata, calendar status, canonical sharing and dual registration routes",
  [
    "tests/client/event-ui.test.tsx",
    unit("events"),
    unit("site-document"),
    sql("107_event_rescheduling"),
    local("events"),
  ],
  [
    "Hosted crawlers/calendar clients and supported-device accessibility review; cancelled events remain private under the published-only contract",
  ],
);
prdTestCases.at(-1).normative = ["22.4", "26.2", "31.2"];
const teams = [
  [
    "TEAM-001",
    "Public profiles versus private directory/accounts",
    [unit("members"), sql("058_community_members"), unit("public-collections")],
  ],
  [
    "TEAM-002",
    "Team hierarchy, membership, transfers, statistics, activity and notices",
    [sql("025_teams"), sql("028_team_announcements"), local("teams")],
  ],
  [
    "TEAM-003 TEAM-004",
    "Bound single-use invitation accept/decline/revoke/expiry",
    [
      sql("027_team_invitations"),
      sql("103_invitation_decline"),
      local("team-invitations"),
    ],
  ],
  [
    "TEAM-005 TEAM-006",
    "Lead/team scope and separate page/action grants",
    [unit("teams"), sql("026_explicit_team_actions"), local("teams")],
  ],
  [
    "TEAM-007",
    "Public profile column minimization",
    [unit("public-collections"), local("public-collections")],
  ],
];
teams.forEach(([r, s, a], i) =>
  add(`TEAM-TEST-${String(i + 1).padStart(3, "0")}`, r, s, a),
);
add(
  "COMM-TEST-001",
  "COMM-001",
  "Announcements, tasks, private messages, channels, pins and boards",
  [
    sql("038_tasks"),
    sql("043_direct_messages"),
    sql("045_chapter_announcements"),
    sql("029_channels"),
    sql("034_whiteboards"),
    local("tasks"),
    local("direct-messages"),
  ],
);
add(
  "COMM-TEST-002",
  "COMM-002 COMM-003 COMM-004",
  "Authorized Realtime and collaboration mutations",
  [
    sql("030_scoped_realtime"),
    sql("036_whiteboard_realtime"),
    sql("048_managed_team_chat"),
    unit("whiteboards"),
    local("whiteboards"),
  ],
  ["Hosted reconnect/device/concurrent collaboration"],
);
add("COMM-TEST-003", "COMM-005", "Scoped internal email fan-out review", [
  sql("045_chapter_announcements"),
  sql("089_event_mail_review"),
  unit("event-mail"),
  local("announcements"),
]);
add(
  "COMM-TEST-004",
  "COMM-001",
  "Account-bound notification inbox loading/error/stale states, read-all to read-only dismiss-all, late-response fences, mutation freezing and semantic focus",
  [
    "tests/client/notification-inbox-ui.test.tsx",
    "tests/client/accessibility-structure.test.tsx",
    local("notification-bulk"),
  ],
  [
    "Full supported-browser/screen-reader/realtime outage and institutional notification acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.2", "28.3", "31.2"];
add(
  "OPS-TEST-009",
  "COMM-006",
  "Authenticated scheduler, leases, dedupe and bounded retries",
  [
    unit("jobs"),
    sql("019_scheduled_jobs"),
    sql("039_task_jobs"),
    local("jobs"),
  ],
  ["Hosted scheduler watchdog/recovery/load"],
);
add(
  "FIN-TEST-001",
  "FIN-001",
  "Exact finance ledger, budgets, reports and state transitions",
  [unit("finances"), sql("050_finance_ledger"), local("finances")],
);
add(
  "FIN-TEST-002",
  "FIN-002 FIN-005",
  "Private attachments and authorized short-lived download",
  [
    unit("finance-routes"),
    sql("051_finance_attachments"),
    local("finance-uploads"),
  ],
);
add(
  "FIN-TEST-003",
  "FIN-003 FIN-004",
  "Current-state authorization, self-approval rejection and audit",
  [unit("finance-routes"), sql("050_finance_ledger"), local("finances")],
);
add(
  "NEWS-TEST-001",
  "NEWS-001 NEWS-002 NEWS-003",
  "Private double opt-in and revocable individual tokens",
  [
    sql("007_public_submissions"),
    sql("087_newsletter_token_bulk_cleanup"),
    local("submissions"),
  ],
);
add(
  "NEWS-TEST-002",
  "NEWS-004 NEWS-005",
  "Campaign/subscriber/template review, snapshots, scheduling and delivery",
  [
    unit("newsletter"),
    sql("082_newsletter_workspace"),
    sql("083_newsletter_send_review"),
    sql("084_newsletter_delivery"),
    local("newsletter"),
  ],
  ["Real provider/sender-domain/retry/load acceptance"],
);
add(
  "NEWS-TEST-003",
  "NEWS-006",
  "Private sender credentials and transport configuration",
  [unit("mail-transport"), "scripts/scan-secrets.mjs"],
);
add(
  "NEWS-TEST-004",
  "NEWS-002 NEWS-003",
  "Read-only token review before explicit confirmation/opt-out, safe retries, truthful ambiguous failures and no global capability cache",
  [
    "tests/client/newsletter-token-ui.test.tsx",
    unit("newsletter-token-review"),
    sql("108_newsletter_token_review"),
    local("newsletter"),
    local("newsletter-review"),
  ],
  [
    "Full supported-device/screen-reader and hosted sender/link-scanner acceptance",
  ],
);
prdTestCases.at(-1).normative = ["22.12", "28.3", "31.2"];
add(
  "CONTENT-TEST-015",
  "CONTACT-001 CONTACT-002 CONTACT-003",
  "Bound contact inputs, fixed destination and escaped template",
  [
    unit("contact"),
    unit("mail-transport"),
    sql("007_public_submissions"),
    sql("088_contact_attachments"),
    local("contact-files"),
  ],
);
add(
  "CONTENT-TEST-016",
  "CONTACT-001 CONTACT-002 CONTACT-003",
  "Contact duplicate-submit protection, safe field errors/focus, attachment retry and inquiry-route isolation",
  [
    "tests/client/contact-ui.test.tsx",
    "tests/server/contact-upload.test.ts",
    local("contact-files"),
  ],
  [
    "Native fictional browser submission and local mail capture do not approve hosted delivery, real chapter copy or full accessibility/device acceptance",
  ],
);
prdTestCases.at(-1).normative = ["22.9", "28.3", "31.2"];
add(
  "CONTENT-TEST-019",
  "CONTENT-001 CONTENT-002",
  "Independent homepage/CMS recovery, stale snapshots, request races and keyboard retry focus",
  [
    "tests/client/public-content-recovery.test.tsx",
    "tests/client/content-snapshot.test.ts",
  ],
  ["Hosted outage/reconnect and assistive-technology review"],
);
prdTestCases.at(-1).normative = ["22.2", "28.3"];
add(
  "CONTENT-TEST-001",
  "CONTENT-001",
  "Managed CMS, libraries and private media operations",
  [
    unit("site-content"),
    unit("site-preview-routes"),
    sql("022_site_content"),
    sql("073_private_media_core"),
    local("site-content"),
    local("media-core"),
  ],
);
add(
  "CONTENT-TEST-002",
  "CONTENT-002",
  "Active public columns, paged resource/team/sponsor inventory",
  [
    unit("public-collections"),
    sql("100_public_sponsor_ordering"),
    local("public-collections"),
  ],
);
add(
  "CONTENT-TEST-011",
  "CONTENT-002",
  "Resource filter normalization/reset/pagination recovery, public profile presentation, meaningful sponsor packages and archived alias concealment",
  [
    "tests/client/public-discovery-ui.test.tsx",
    unit("public-collections"),
    local("public-collections"),
  ],
  [
    "Supported-device keyboard/screen-reader and approved chapter content/visual review",
  ],
);
prdTestCases.at(-1).normative = ["22.5", "22.6", "22.7", "28.3", "31.2"];
add(
  "CONTENT-TEST-003",
  "CONTENT-003 CONTENT-004",
  "Private storage separated from explicit public media publication",
  [
    sql("075_private_media_uploads"),
    sql("077_media_publication"),
    sql("081_gallery_image_grants"),
    local("media-files"),
  ],
);
add(
  "CONTENT-TEST-010",
  "CONTENT-003 CONTENT-004",
  "Approved gallery event choices, shared pagination, failure recovery, safe image fallback and lightbox keyboard focus",
  [
    "tests/client/public-gallery-ui.test.tsx",
    unit("public-collections"),
    local("media-files"),
  ],
  [
    "Real screen-reader and full supported-device/visual review; synthetic approved rectangles do not approve chapter photography",
  ],
);
prdTestCases.at(-1).normative = ["22.8", "28.3", "31.2"];
add(
  "CONTENT-TEST-004",
  "CONTENT-005 CONTENT-006",
  "Upload MIME/signature/size/ownership/quarantine and SVG policy",
  [unit("upload-content"), unit("upload-routes"), local("uploads")],
);
add(
  "A11Y-TEST-005",
  "",
  "External link cues and Linktree consent, frame reset, focus return and guarded discard",
  ["tests/client/public-links.test.tsx", "tests/client/linktree-ui.test.tsx"],
  [
    "Real provider availability and complete browser/screen-reader/device review",
  ],
);
prdTestCases.at(-1).normative = ["22.10", "28.2", "28.3"];
add(
  "A11Y-TEST-007",
  "FORM-026",
  "Pinned axe WCAG 2.1 A/AA and best-practice structural checks across public pages, populated cards, form validation, gallery dialog, builder and response states",
  ["tests/client/accessibility-structure.test.tsx"],
  [
    "JSDOM excludes color contrast and cannot certify geometry, pixels, actual canvas, screen-reader behavior or incomplete axe rules; full browser axe/Lighthouse/device acceptance remains mandatory",
  ],
);
prdTestCases.at(-1).normative = ["12.1", "13.2", "23", "31.2"];
add(
  "A11Y-TEST-006",
  "",
  "Page destination focus, public/workspace boundary, inquiry context and frame-independent menu keyboard opening",
  [
    "tests/client/route-focus.test.tsx",
    "tests/client/public-content-recovery.test.tsx",
  ],
  [
    "Full screen-reader, browser/device and keyboard/zoom accessibility acceptance",
  ],
);
prdTestCases.at(-1).normative = ["22.1", "28.3", "31.2"];
add(
  "A11Y-TEST-004",
  "",
  "Compact top-menu Tab containment, ArrowDown entry, Escape focus return and route/outside close",
  ["tests/client/public-content-recovery.test.tsx"],
  ["Full screen-reader, device and supported-browser acceptance"],
);
prdTestCases.at(-1).normative = ["22.1", "28.3"];
add(
  "A11Y-TEST-001",
  "CONTENT-007",
  "Responsive image dimensions, formats, lazy loading and alt text",
  [
    "tests/form-images.test.ts",
    "tests/client/public-image.test.tsx",
    unit("media-content"),
  ],
  [
    "Every public image/breakpoint/assistive-text review; no full browser pass yet",
  ],
);
add(
  "CONTENT-TEST-008",
  "LINK-001 LINK-002 LINK-003 LINK-004",
  "Active Linktree profiles/links, ordering, safe embeds and bounded tracking",
  [
    unit("linktree"),
    unit("linktree-routes"),
    sql("053_linktree_workflows"),
    sql("054_linktree_team_publication_guard"),
    local("linktree"),
  ],
);
const forms = [
  [
    "FORM-001",
    "Native first-party renderer and authoring",
    [unit("forms"), local("forms")],
  ],
  [
    "FORM-002",
    "Form create/template/duplicate/archive/restore and retained erasure",
    [
      unit("form-admin-routes"),
      sql("072_form_permanent_deletion"),
      local("form-deletion"),
    ],
  ],
  [
    "FORM-003",
    "Supported field types and blocks",
    [
      unit("forms"),
      "tests/form-runtime-fields.test.ts",
      "tests/form-images.test.ts",
    ],
  ],
  [
    "FORM-004",
    "Field identity, help and type-appropriate validation",
    [
      "tests/form-builder-validation.test.ts",
      "tests/form-runtime-fields.test.ts",
      unit("forms"),
    ],
  ],
  [
    "FORM-005",
    "Builder ordering/duplication/history/autosave and non-submitting preview",
    [
      "tests/form-presentation.test.ts",
      unit("form-admin-routes"),
      local("form-presentation"),
    ],
  ],
  [
    "FORM-006",
    "Shared branch logic and invalid/cyclic publication refusal",
    [unit("form-branches"), local("form-branches")],
  ],
  [
    "FORM-007",
    "Theme/progress/schedule/editing/receipts and own response copy",
    [
      "tests/form-presentation.test.ts",
      unit("form-delivery"),
      unit("form-respondent"),
      local("form-respondent"),
    ],
  ],
  [
    "FORM-008",
    "Current identity/access policy and one-response enforcement",
    [
      unit("form-access-routes"),
      sql("092_identified_forms"),
      local("form-access"),
    ],
  ],
  [
    "FORM-009",
    "Private slug/capability and noindex discovery boundaries",
    [
      unit("form-public-routes"),
      unit("seo"),
      unit("site-document"),
      local("form-navigation"),
    ],
  ],
  [
    "FORM-010",
    "Immutable versions, stable hashes and historical labels",
    [sql("010_forms"), sql("064_form_response_history"), local("form-history")],
  ],
  [
    "FORM-011",
    "Runtime labels/progress/errors/review and shared logic parity",
    ["tests/form-runtime-fields.test.ts", unit("forms"), local("form-runtime")],
  ],
  [
    "FORM-012",
    "Exact-version server response validation and hidden/unknown/file rejection",
    [unit("form-public-routes"), sql("010_forms"), local("forms")],
  ],
  [
    "FORM-013",
    "Atomic response/identity/invite/limit/file commit and idempotency",
    [
      sql("010_forms"),
      sql("014_form_access_uploads"),
      "scripts/test-database.mjs",
      local("uploads"),
    ],
  ],
  [
    "FORM-014",
    "Expiring fragment-only resume capability",
    [
      "tests/capability-navigation.test.ts",
      unit("form-lifetime"),
      local("form-navigation"),
    ],
  ],
  [
    "FORM-015",
    "Distinct response-edit capability and retained revisions",
    [
      unit("form-public-routes"),
      sql("064_form_response_history"),
      local("form-history"),
    ],
  ],
  [
    "FORM-016",
    "Private scanned direct upload and physical cleanup",
    [unit("upload-routes"), unit("scanner"), local("uploads")],
  ],
  [
    "FORM-017",
    "Public abuse/schema/count/identity non-disclosure boundaries",
    [
      unit("form-public-routes"),
      unit("form-access-routes"),
      local("form-access"),
    ],
  ],
  [
    "FORM-018",
    "Scoped complete library filters and paged options",
    [
      "tests/form-library.test.ts",
      sql("099_form_library_filters"),
      local("form-library"),
    ],
  ],
  [
    "FORM-019",
    "Response summary/table/detail/version views",
    [
      unit("form-admin-routes"),
      sql("064_form_response_history"),
      local("form-history"),
    ],
  ],
  [
    "FORM-020",
    "Safe version-aware CSV/XLSX/JSON and background export",
    [
      unit("form-exports"),
      sql("063_form_background_exports"),
      local("form-exports"),
    ],
  ],
  [
    "FORM-021",
    "Authorized safe reviewed response notifications",
    [
      unit("form-delivery"),
      sql("065_form_reviewed_delivery"),
      local("form-delivery"),
    ],
  ],
  [
    "FORM-022 FORM-023",
    "Explicit form/team/collaborator actions and denied editor access",
    [
      unit("form-admin-routes"),
      unit("form-access-routes"),
      sql("010_forms"),
      local("forms"),
    ],
  ],
  [
    "FORM-024",
    "Sensitive operations audited without answer/file contents",
    [unit("form-admin-routes"), unit("form-privacy"), local("uploads")],
  ],
  [
    "FORM-025",
    "Retained identity redaction, holds, archive and reviewed permanent deletion",
    [
      unit("form-deletion"),
      sql("066_form_retention_holds"),
      sql("072_form_permanent_deletion"),
      local("form-privacy"),
    ],
  ],
  [
    "FORM-026",
    "Keyboard/error/focus/grid/progress accessibility",
    [
      "tests/form-runtime-fields.test.ts",
      "tests/form-builder-validation.test.ts",
    ],
    ["Complete manual WCAG/screen-reader/zoom/contrast and axe review"],
  ],
  ["FORM-027", "Five structure-only reusable templates", [unit("forms")]],
  [
    "FORM-028",
    "Event/team/campaign references and access-preserving integration",
    [
      unit("form-integrations"),
      sql("071_form_integrations"),
      local("form-integrations"),
    ],
  ],
  [
    "FORM-029",
    "Sensitive answers masked; separate reveal/export proof and audit",
    [unit("form-admin-routes"), unit("form-exports"), local("forms")],
  ],
  [
    "FORM-030",
    "Bound invitation CSV, single-use delivery/rotation/revocation",
    [
      unit("form-access-routes"),
      sql("014_form_access_uploads"),
      local("form-access"),
    ],
  ],
];
forms.forEach(([r, s, a, remaining = []], i) =>
  add(`FORM-TEST-${String(i + 1).padStart(3, "0")}`, r, s, a, remaining),
);
add(
  "PRIVATE-TEST-001",
  "BLOG-001 BLOG-006",
  "Private editorial content, assignments, approvals and scoped analytics",
  [
    unit("blog"),
    sql("061_private_blog"),
    sql("104_editorial_overview"),
    local("blog"),
  ],
);
add(
  "PRIVATE-TEST-002",
  "BLOG-002 BLOG-003 BLOG-004",
  "No public Blog routes/discovery or anonymous table access",
  [
    unit("seo"),
    unit("site-document"),
    sql("061_private_blog"),
    local("documents"),
  ],
);
add(
  "PRIVATE-TEST-003",
  "BLOG-005",
  "Scanned private editorial files and authorized download",
  [unit("blog"), sql("062_private_blog_uploads"), local("blog-uploads")],
);
add(
  "PRIVATE-TEST-007",
  "PROJ-001 PROJ-005",
  "Preserved private project workflows",
  [unit("projects"), sql("055_private_projects"), local("projects")],
);
add(
  "PRIVATE-TEST-008",
  "PROJ-002 PROJ-003 PROJ-004",
  "No public Projects/discovery or direct grants",
  [
    unit("seo"),
    unit("site-document"),
    sql("055_private_projects"),
    local("documents"),
  ],
);
add(
  "CONTENT-TEST-009",
  "STATUS-001 STATUS-002 STATUS-003",
  "Authorized maintenance, escape paths, health and safe redirects",
  [unit("site-status"), sql("057_site_status_control"), local("site-status")],
  ["Actual offline/device maintenance behavior"],
);
add(
  "SEC-TEST-021",
  "AUDIT-001 AUDIT-002",
  "Protected-action history, identifiers, safe detail and filtered statistics",
  [unit("audit-routes"), sql("105_audit_statistics"), local("workspace")],
);
add(
  "SEC-TEST-005",
  "AUDIT-004",
  "Append-only audit rows and no application mutation endpoint",
  [sql("001_security_foundation"), unit("audit-routes")],
);
add(
  "PWA-TEST-001",
  "PWA-001 PWA-002 PWA-003",
  "Production worker, GT manifest and deliberate lifecycle",
  [
    unit("pwa-policy"),
    unit("pwa-worker"),
    unit("build-graph"),
    "scripts/check-build-budgets.mjs",
  ],
);
add(
  "PWA-TEST-004",
  "PWA-004",
  "Actual installability on supported Chromium/Android/iOS",
  [],
  ["Real supported-device installation/uninstall/reinstall acceptance"],
);
add(
  "FORM-TEST-034",
  "FORM-005 FORM-018 FORM-019 FORM-026",
  "Protected definition/library scope, aborted superseded reads, initial builder/response retry, stale-result fencing, visible saved/date filters and response-tab keyboard operation",
  ["tests/client/form-data-recovery.test.tsx"],
  [
    "Actual supported-browser outage/role-change/reconnect and manual accessibility acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "31.2"];
add(
  "PWA-TEST-005",
  "",
  "Minimal public queue, retry classification, leases, interrupted-final-attempt recovery, expiry and logout fences",
  [unit("public-queue"), "tests/client/submission-queue-ui.test.tsx"],
  [
    "Real multi-tab/worker interruption, lost-response, 48-hour expiry and logout storage-failure acceptance",
  ],
);
prdTestCases.at(-1).normative = ["11.3", "28.3", "31.2"];
add(
  "PWA-TEST-006",
  "",
  "Device storage loading/error/stale recovery, offline retry, consent and semantic focus",
  ["tests/client/submission-queue-ui.test.tsx"],
  ["Supported-device storage/private-mode/keyboard/screen-reader review"],
);
prdTestCases.at(-1).normative = ["11.3", "22.13", "28.3", "31.2"];
add(
  "PWA-TEST-007",
  "PUSH-001 PUSH-009",
  "User-gesture-only permission and iOS installed-context guidance",
  [unit("push")],
  ["Actual permission UI and supported/unsupported device contexts"],
);
add(
  "PWA-TEST-008",
  "PUSH-002 PUSH-003",
  "Session/verified-registration derived push identity",
  [unit("push"), sql("090_event_push"), sql("091_push_fences"), local("push")],
);
add(
  "PWA-TEST-009",
  "PUSH-004 PUSH-005",
  "Encrypted provider subscriptions and private VAPID signing",
  [unit("push"), sql("090_event_push"), "scripts/scan-secrets.mjs"],
);
add(
  "PWA-TEST-010",
  "PUSH-006 PUSH-007",
  "Idempotent scheduled reminder and failed subscription cleanup",
  [unit("push"), sql("090_event_push"), sql("091_push_fences"), local("push")],
  ["Real approved provider/device delivery and failure acceptance"],
);
add(
  "PWA-TEST-011",
  "PUSH-008",
  "Safe canonical notification click target",
  [unit("push"), unit("pwa-worker")],
  ["Real installed-device notification click"],
);
add(
  "OPS-TEST-010",
  "",
  "Fictional full-schema backup restore preserves data, ACLs and enforcement",
  ["scripts/test-backup-restore.mjs"],
  [
    "Hosted scheduled/PITR database backup and private object-storage restore; measured institutional RPO/RTO; approved recovery runbook",
  ],
);
prdTestCases.at(-1).normative = ["16.3", "29", "31.2"];
add(
  "A11Y-TEST-002",
  "",
  "Overview loading, error, stale snapshot and independent widget interaction",
  ["tests/client/workspace-ui.test.tsx"],
  [
    "JSDOM interaction tests do not measure CSS/layout, screen readers, device behavior or contrast",
  ],
);
prdTestCases.at(-1).normative = ["28.3", "31.2"];
add(
  "A11Y-TEST-003",
  "AUDIT-002",
  "Audit detail focus/return, cursor history and recoverable filter/detail errors",
  ["tests/client/workspace-ui.test.tsx"],
  ["Real screen-reader, keyboard-only browser and supported-device review"],
);
add(
  "FORM-TEST-031",
  "FORM-007 FORM-011 FORM-014 FORM-015 FORM-026",
  "Respondent identity, copy, pending/idempotent submit, resume/edit fragments, preview and error focus interactions",
  ["tests/client/public-form-ui.test.tsx"],
  [
    "Transport is injected; real server/storage/scanner integration and manual assistive-technology acceptance remain separate",
  ],
);
add(
  "FORM-TEST-032",
  "FORM-004 FORM-026",
  "File count/byte/type and safe-pattern settings through actual controlled inputs",
  ["tests/client/form-settings-ui.test.tsx"],
  ["Real keyboard/screen-reader and published file-policy acceptance"],
);

add(
  "FORM-TEST-033",
  "FORM-011 FORM-014 FORM-026",
  "Frame-independent validation/section focus, read retry, branded concealment, readable review, private-link feedback and mutation cancellation",
  ["tests/client/public-form-ui.test.tsx", local("form-runtime")],
  [
    "Full supported-device/screen-reader accessibility and hosted error/response acceptance",
  ],
);
prdTestCases.at(-1).normative = ["22.11", "28.3", "31.2"];

add(
  "FORM-TEST-035",
  "FORM-004 FORM-026",
  "View-only definition routing, independent response/access actions, scoped create/copy grants, section reorder and undo",
  [
    "tests/client/form-editor-permissions.test.tsx",
    unit("access"),
    unit("form-admin-routes"),
    sql("109_form_library_creation_capabilities"),
    local("form-viewing"),
  ],
  [
    "Browser keyboard/assistive-technology review across all builder tabs, permission changes and responsive inspector layouts",
  ],
);
prdTestCases.at(-1).normative = ["22.11", "26.1", "31.2"];

add(
  "CONTENT-TEST-020",
  "LINK-001 LINK-002 LINK-003 LINK-004",
  "Independent Linktree permission/inventory/detail/analytics read recovery, stale snapshots, private context isolation, offline drafts and confirmed mutation lifecycle",
  ["tests/client/linktree-workspace-recovery.test.tsx", local("linktree")],
  [
    "Real browser outage/role-change/assistive-technology acceptance, visual baselines and approved external-provider checks",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "31.2"];

add(
  "TEAM-TEST-025",
  "",
  "Community directory CSV validation/review/expiry/confirmation, duplicate prevention, filtered private export consent, offline input and session cancellation",
  [
    "tests/client/member-transfer-ui.test.tsx",
    unit("member-transfer"),
    local("member-transfer"),
  ],
  [
    "Supported-device/screen-reader and real-browser network interruption/download acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "31.2"];

add(
  "COMM-TEST-020",
  "COMM-001",
  "Private-message read cancellation, error/empty recovery, mutation duplicate/context fencing, audit-review lifecycle and semantic feedback",
  ["tests/client/direct-message-lifecycle.test.tsx", local("direct-messages")],
  [
    "Full browser network-fault, review-expiry, assistive-technology and supported-device acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "27.1", "28.3", "31.2"];

add(
  "COMM-TEST-019",
  "COMM-001 COMM-002 COMM-003",
  "Channel permission/list/history/member read recovery, pinned isolation, ordered delta pages, mutation/context fences and native list/live-log accessibility",
  [
    "tests/client/channel-recovery.test.tsx",
    local("channels"),
    local("team-chat"),
  ],
  [
    "Full real-browser outage/role/reconnect, screen-reader and supported-device acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "27.1", "28.3", "31.2"];

add(
  "COMM-TEST-018",
  "COMM-001",
  "Task inventory/detail/permission read recovery, optimistic task/comment conflicts, displayed history refresh, stable retries and private-context cancellation",
  [
    "tests/client/task-recovery.test.tsx",
    local("tasks"),
    local("task-privacy"),
  ],
  [
    "Real-browser interruption, permission changes, screen-reader and supported-device acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "31.2"];

add(
  "COMM-TEST-017",
  "COMM-001 COMM-005",
  "Announcement independent read recovery, private context fences, draft conflicts, stable retries and exact audience preview expiry/confirmation lifecycle",
  ["tests/client/announcement-recovery.test.tsx", local("announcements")],
  [
    "Supported-browser outage/reconnect, assistive-technology and hosted publication acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "27.1", "28.3", "31.2"];

add(
  "COMM-TEST-016",
  "COMM-001 COMM-003 COMM-004",
  "Whiteboard private read recovery, unchanged-version permission refresh, canvas generation fences, stable autosave/metadata retries, pending drawing preservation, offline pause and retained conflicts",
  ["tests/client/whiteboard-recovery.test.tsx", local("whiteboards")],
  [
    "Real drawing-editor keyboard/screen-reader, interruption/reconnect/concurrent-edit and supported-device acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "27.1", "28.3", "31.2"];

add(
  "FIN-TEST-020",
  "FIN-001 FIN-002 FIN-003 FIN-004 FIN-005",
  "Independent finance permissions/inventory/budgets/reports/detail recovery, exact-decimal draft conflicts, guarded retained decisions/notes, stable retries and aborted private download/quarantine operations",
  [
    "tests/client/finance-recovery.test.tsx",
    local("finances"),
    local("finance-uploads"),
    local("finance-recovery"),
  ],
  [
    "Supported-device/screen-reader, browser interruption/download and hosted finance acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "31.2"];

add(
  "CONTENT-TEST-018",
  "CONTENT-004",
  "Media inventory/folder/error recovery, metadata/publication confirmation retries, scoped private-context cancellation and quarantined upload/download lifecycle",
  [
    "tests/client/media-recovery.test.tsx",
    local("media-core"),
    local("media-files"),
    local("media-recovery"),
  ],
  [
    "Real-browser interruption/download/publication, assistive-technology, supported-device and hosted storage/worker acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "31.2"];

add(
  "CONTENT-TEST-017",
  "PROJ-001 PROJ-002 PROJ-003",
  "Private project independent read recovery, navigation/account/session isolation, scoped creation, stale permissions/revisions, stable retries and retained participant operations",
  ["tests/client/project-recovery.test.tsx", local("projects")],
  [
    "Browser interruption, supported-device/screen-reader and hosted project acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "31.2"];

add(
  "PRIVATE-TEST-004",
  "BLOG-001 BLOG-005 BLOG-006",
  "Private editorial independent reads, draft/confirmation retry identity, stale revisions and grants, account/session/navigation cancellation, category choice pagination and guarded quarantine/download authorization",
  ["tests/client/blog-recovery.test.tsx", local("blog"), local("blog-uploads")],
  [
    "Supported-device/screen-reader, browser interruption/download and hosted editorial/storage acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "31.2"];

add(
  "NEWS-TEST-005",
  "NEWS-001 NEWS-002 NEWS-003 NEWS-004 NEWS-005",
  "Newsletter independent read recovery, stale draft and selected-subscriber fencing, account/session cancellation, unchanged retry keys, review-time expiry/exact confirmation, offline safeguards and delivery review editor locking",
  [
    "tests/client/newsletter-recovery.test.tsx",
    "tests/client/newsletter-navigation.test.tsx",
    local("newsletter"),
  ],
  [
    "Real supported-device/send/download interruption, screen-reader and hosted provider/worker acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "31.2"];

add(
  "CONTENT-TEST-005",
  "STATUS-001 STATUS-002 STATUS-003",
  "Site availability stale-snapshot/read recovery, preserved conflict drafts, exact mode validation, unchanged confirmation retry keys, account/session isolation, pending cancellation and offline safeguards",
  ["tests/client/site-status-recovery.test.tsx", local("site-status")],
  [
    "Full supported-device/screen-reader, browser interruption and hosted availability/redirect acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "31.2"];

add(
  "CONTENT-TEST-006",
  "CONTENT-001 CONTENT-002",
  "Independent CMS permission/inventory/selected-record recovery, stale grant/revision fences, guarded publication/archive/restore reviews, uncertain-save preservation, account/session cancellation and keyed private composition snapshots",
  ["tests/client/cms-recovery.test.tsx", local("cms-recovery")],
  [
    "Real composition/device/screen-reader/browser interruption and hosted CMS/cache acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "31.2"];

add(
  "CONTENT-TEST-007",
  "CONTENT-001 CONTENT-002",
  "Atomic actor-bound CMS/collection mutation replay with current-session/action/team revalidation, changed-intent conflicts, stable client keys and concurrent create/audit deduplication",
  [
    "tests/server/curated-content-retries.test.mjs",
    "tests/client/cms-recovery.test.tsx",
    "tests/client/collection-retries.test.tsx",
    sql("110_curated_content_retries"),
    local("cms-recovery"),
    local("content"),
  ],
  [
    "Full supported-device/browser interruption, hosted concurrency/retention and operational acceptance",
  ],
);
prdTestCases.at(-1).normative = ["25.1", "26.1", "28.3", "31.2"];

add(
  "CONTENT-TEST-012",
  "CONTENT-001 CONTENT-002",
  "Resource/sponsor/public-team independent permission/inventory/detail recovery, account/session cancellation, preserved stale drafts, current grant checks, scoped creation, stable retries and separate visibility reviews",
  [
    "tests/client/collection-recovery.test.tsx",
    "tests/client/collection-retries.test.tsx",
    local("collection-recovery"),
  ],
  [
    "Full supported-device/screen-reader, live-browser interruption/visual and hosted collection acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "31.2"];

add(
  "AUTH-TEST-003",
  "AUTH-013 AUTH-015",
  "Own-profile independent session/activity read errors, retries, stale snapshots, denied-state clearing and account/session isolation",
  ["tests/client/profile-read-recovery.test.tsx", local("profile-reads")],
  [
    "Profile mutation recovery, live browser outage/role changes, full screen-reader/device and hosted acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "31.2"];

add(
  "FORM-TEST-036",
  "FORM-002 FORM-007 FORM-026",
  "Form archive/restore/close/reopen consequence review, fresh state/grant checks, revision-bound confirmation, pending/offline/cancel and session replacement",
  [
    "tests/client/form-availability-review.test.tsx",
    "tests/client/form-editor-permissions.test.tsx",
    local("form-library"),
  ],
  [
    "Full availability/invitation/privacy mutation recovery, real-browser keyboard/screen-reader/device and hosted acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "28.4", "31.2"];

add(
  "FORM-TEST-037",
  "FORM-021 FORM-025 FORM-026",
  "Delivery/retention initial-read skeletons, in-place retry, request cancellation and non-mutating private configuration reads",
  [
    "tests/client/form-settings-read-retry.test.tsx",
    local("form-settings-reads"),
  ],
  [
    "Full delivery/privacy mutation recovery, real-browser interruption, screen-reader/device and hosted acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "31.2"];

add(
  "FORM-TEST-038",
  "FORM-008 FORM-010 FORM-026",
  "Scoped candidate/collaborator search and pagination beyond 100 and 1000, independent private read recovery, access consequence reviews, cancellation and current authorization",
  [
    "tests/client/form-access-recovery.test.tsx",
    unit("form-access-routes"),
    unit("form-admin-routes"),
    sql("111_form_access_account_inventory"),
    local("form-access-inventory"),
  ],
  [
    "Live browser keyboard/role/network interruption, full screen-reader/device/visual and hosted acceptance",
  ],
);
prdTestCases.at(-1).normative = ["23", "28.3", "28.4", "31.2"];

add(
  "A11Y-TEST-008",
  "",
  "Pinned production-build public browser smoke with contrast-enabled axe, scroll/overflow checks, desktop/mobile captures, compact-menu keyboard recovery and anonymous private-route refusal",
  [
    "tests/browser/public-smoke.spec.ts",
    "tests/browser/public-fixture.ts",
    local("public-browser"),
    local("hero-browser"),
  ],
  [
    "All 22 populated visual surfaces, approved initial baselines, pinned-container pixel comparison, real device/Safari/assistive-technology runs and remaining public/private critical browser workflows",
  ],
);
prdTestCases.at(-1).normative = ["10.6", "10.10", "12.1", "12.4", "13.3", "28.3", "31.2"];

export const requirementOverrides = {
  "FORM-007":
    "Tejas requested an opt-in exact own-response copy only to the entered address, including own sensitive answers and excluding file bytes/private links; separate reviewed owner receipts retain their existing policy.",
  "FORM-008":
    "Tejas removed anonymous forms. Name/email are required now; entered identity is declared, not falsely verified. Georgia Tech SSO and Google login remain deferred.",
  "FORM-014":
    "Draft expiry/fragment handling remains; respondents are identified by declared name/email under the current no-anonymous decision.",
};
