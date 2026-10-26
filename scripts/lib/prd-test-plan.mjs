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
  "CONTENT-TEST-004",
  "CONTENT-005 CONTENT-006",
  "Upload MIME/signature/size/ownership/quarantine and SVG policy",
  [unit("upload-content"), unit("upload-routes"), local("uploads")],
);
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
  ["tests/form-images.test.ts", "tests/client/public-image.test.tsx", unit("media-content")],
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

export const requirementOverrides = {
  "FORM-007":
    "Tejas requested an opt-in exact own-response copy only to the entered address, including own sensitive answers and excluding file bytes/private links; separate reviewed owner receipts retain their existing policy.",
  "FORM-008":
    "Tejas removed anonymous forms. Name/email are required now; entered identity is declared, not falsely verified. Georgia Tech SSO and Google login remain deferred.",
  "FORM-014":
    "Draft expiry/fragment handling remains; respondents are identified by declared name/email under the current no-anonymous decision.",
};
