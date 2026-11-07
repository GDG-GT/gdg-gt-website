// Remaining mandatory IDs, reviewed by domain against the available source
// suites. References contribute evidence; every case remains unverified. Empty
// source lists deliberately expose manual/hosted work rather than invent tests.
const cases = [];
const s = (n) => `tests/server/${n}.test.mjs`;
const c = (n) => `tests/client/${n}.test.tsx`;
const d = (n) => `database/tests/${n}.sql`;
const group = (prefix, normative, rows) => {
  for (const [number, scope, automated, remaining = []] of rows)
    cases.push({
      id: `${prefix}-TEST-${String(number).padStart(3, "0")}`,
      scope,
      automated,
      normative,
      remaining,
    });
};
group(
  "AUTH",
  ["24.2", "25.3", "28.3"],
  [
    [
      7,
      "Disabled, archived, temporary-expired and locked accounts cannot receive a session",
      [s("auth"), s("users")],
    ],
    [
      8,
      "Password reuse, current-proof failure and other-session revocation remain distinct safe outcomes",
      [s("auth"), c("profile-mutation-recovery")],
    ],
    [
      9,
      "Account lifecycle and recovery capabilities exclude changing proof/token material from stable intent",
      [s("users"), c("user-account-mutations")],
    ],
    [
      10,
      "Current session/bootstrap transport failures cancel obsolete private generations",
      [
        "tests/client/api-session-generation.test.mjs",
        c("profile-read-recovery"),
      ],
    ],
    [
      20,
      "Production cookie parsing, secure attributes and production HTTPS configuration fail closed",
      [s("security"), s("auth")],
    ],
  ],
);
group(
  "SEC",
  ["21.3", "24", "25.1", "28", "29"],
  [
    [
      1,
      "Anonymous, forbidden and retired protected routes preserve their different safe status boundaries",
      [s("entry"), s("users"), s("http")],
    ],
    [
      3,
      "JSON decoding rejects unsupported types, malformed UTF-8/object bodies and actual oversized streams",
      [s("http")],
    ],
    [
      4,
      "Browser Origin, method, session binding and CSRF are enforced independently of UI route guards",
      [s("auth"), s("http"), "tests/client/api-session-generation.test.mjs"],
    ],
    [
      6,
      "Public destinations, rich content and calendar/export strings reject executable or ambiguous input",
      [s("validation"), s("events"), s("newsletter")],
    ],
    [
      16,
      "Session revocation or changed actor authority fences already-pending private work",
      [s("users"), "tests/client/api-session-generation.test.mjs"],
    ],
    [
      17,
      "Private upload preparation and download routes require current scoped authority",
      [s("upload-routes"), s("object-storage")],
    ],
    [
      18,
      "File byte/MIME and stream limits are checked before scanner acceptance",
      [s("upload-content"), s("scanner")],
    ],
    [
      19,
      "Sensitive Forms data and exports retain privacy scope and authenticated encryption boundaries",
      [s("forms"), s("form-exports"), c("form-response-mutation-recovery")],
    ],
    [
      20,
      "Audit and telemetry use bounded safe identifiers rather than user-controlled fields or exception text",
      [s("telemetry"), s("http")],
    ],
    [
      23,
      "CSP violation ingestion uses bounded categories and operational counters",
      [s("telemetry"), d("097_operational_monitoring"), c("account-security"), "tests/browser/security-release.spec.ts"],
    ],
    [
      24,
      "Development server and browser import boundaries do not expose private source or database SDK access",
      [
        "tests/client-architecture.test.mjs",
        "scripts/test-local-dev-security.mjs",
      ],
    ],
    [
      25,
      "Public build artifacts exclude secrets, private source and production source maps",
      [
        s("secret-scan"),
        "scripts/check-build-budgets.mjs",
        "scripts/scan-secrets.mjs",
      ],
    ],
    [
      26,
      "Opaque and encrypted capabilities reject malformed encodings, changed keys and authentication failures",
      [s("security"), s("events")],
    ],
    [
      27,
      "Private Forms links stay publication/generation bound and conceal unavailable targets",
      [s("form-links-routes"), c("form-link-recovery")],
    ],
    [
      28,
      "Scanner startup, framing and verdict failures never manufacture a clean upload",
      [s("scanner"), s("upload-content"), "scripts/test-local-scanner.mjs"],
    ],
    [
      29,
      "Public document projections conceal private routes and encode all published HTML/JSON metadata",
      [s("site-document"), s("projects"), s("blog")],
    ],
  ],
);
group(
  "EVT",
  ["22.3", "22.4", "25.5", "26.3", "26.4", "27.4"],
  [
    [
      1,
      "Event writes reject client-owned columns, unsafe URLs, invalid slugs and invalid current revisions",
      [s("events"), s("event-workspace-mutations")],
    ],
    [
      2,
      "Event inventory filters, selected reads and explicit retry retain the current public/private context",
      [
        c("event-admin-read-recovery"),
        c("event-ui"),
        "scripts/test-local-event-inventory.mjs",
      ],
    ],
    [
      16,
      "Attendee edits and check-in preserve exact original intent across lost responses",
      [s("event-workspace-mutations"), c("event-admin-mutations")],
    ],
    [
      17,
      "Calendar downloads fold UTF-8, escape content and preserve stable identity on cancellation",
      [s("events"), c("event-ui")],
    ],
    [
      18,
      "Attendee CSV neutralizes every formula-bearing exported string",
      [s("events"), "scripts/test-local-events.mjs"],
    ],
    [
      19,
      "Attendee email requires an event-bound reviewed audience and exactly-once queue outcome",
      [s("event-mail"), s("event-mail-recovery"), c("event-mail-recovery")],
    ],
    [
      20,
      "External registration destinations and internal consent are separately validated",
      [s("events"), c("event-ui")],
    ],
    [
      21,
      "Public event image failures keep readable titles and safe fallback imagery",
      [c("event-ui"), "tests/browser/public-compositions.spec.ts"],
    ],
    [
      22,
      "Publication, cancellation and archive consequences use current authority and reviewed versions",
      [s("event-workspace-mutations"), c("event-admin-mutations")],
    ],
    [
      23,
      "Creating or duplicating an event freezes the original key and never creates a replacement after uncertainty",
      [s("event-workspace-mutations"), c("event-admin-mutations")],
    ],
  ],
);
group(
  "TEAM",
  ["23", "24.2", "24.3", "25.5", "27.1"],
  [
    [
      11,
      "Team active state and record updates preserve current team and actor authority",
      [s("team-mutation-recovery"), c("team-mutation-recovery")],
    ],
    [
      12,
      "Explicit action grants and page/resource dependencies cannot invent inherited security access",
      [s("teams"), d("026_explicit_team_actions")],
    ],
    [
      13,
      "Team roles cannot become organization account roles or security administration grants",
      [s("teams"), d("025_teams")],
    ],
    [
      14,
      "Member transfers are reviewed, atomic and destination-scoped",
      [s("teams"), d("025_teams"), "scripts/test-local-teams.mjs"],
    ],
    [
      15,
      "Invitation issuance/resend/revocation keeps the original recipient and action identity",
      [s("invitation-mutation-recovery"), c("invitation-mutation-recovery")],
    ],
    [
      16,
      "Invitation expiry, revocation and stored capability hashes are enforced before acceptance",
      [d("027_team_invitations"), "scripts/test-local-team-invitations.mjs"],
    ],
    [
      17,
      "Permission changes expose dependencies and require current consequence review",
      [
        s("teams"),
        c("team-mutation-recovery"),
        "tests/browser/team-review.spec.ts",
      ],
    ],
    [
      18,
      "Team announcements retain schedule, pin, publication and current read scope",
      [s("team-announcements"), c("team-announcement-mutations")],
    ],
    [
      19,
      "Team summary, memberships and independent panels clear when current access is denied",
      [c("team-read-recovery"), c("team-child-read-recovery")],
    ],
    [
      20,
      "Team candidate and directory reads use bounded server paging rather than a fetched-list ceiling",
      [s("teams"), "scripts/test-local-team-read-recovery.mjs"],
    ],
    [
      21,
      "Team chat access uses current membership and authorized scoped Realtime",
      [s("team-chat"), s("realtime-token"), d("048_managed_team_chat")],
    ],
    [
      22,
      "Team lifecycle consequences remain version-bound through concurrent changes",
      [s("team-mutation-recovery"), d("114_team_mutation_replay")],
    ],
    [
      23,
      "Transient parent/child failures retain proposals while offline or denied work pauses safely",
      [c("team-parent-pause"), c("team-child-read-recovery")],
    ],
    [
      24,
      "Invitation accept/decline transitions cannot cross actor, team, status or expiry boundaries",
      [d("027_team_invitations"), "scripts/test-local-team-invitations.mjs"],
    ],
  ],
);
group(
  "COMM",
  ["23", "24.3", "25.5", "27.1", "27.2", "27.4"],
  [
    [
      5,
      "Task comments and task lifecycle actions remain current-authority scoped",
      [s("tasks"), c("task-recovery")],
    ],
    [
      6,
      "Personal tasks and direct-message inventories reveal only the current recipient/actor scope",
      [s("direct-message-routes"), c("direct-message-lifecycle")],
    ],
    [
      7,
      "Channel replies, pinning and message removal require current channel membership",
      [s("channels"), d("029_channels")],
    ],
    [
      8,
      "Reconnect cursors and Realtime tokens retain scope without duplicating recovered messages",
      [
        s("realtime-token"),
        s("realtime-route"),
        d("049_channel_reconnect_cursor"),
      ],
    ],
    [
      9,
      "Channel creation and archive lifecycle obey membership and action grants",
      [s("channels"), c("channel-recovery")],
    ],
    [
      10,
      "Message edits, deletes and lost-response recovery preserve one exact message intent",
      [s("direct-messages"), c("direct-message-lifecycle")],
    ],
    [
      11,
      "Team chat writes and independent read recovery clear private data after denial",
      [s("team-chat"), "scripts/test-local-team-chat.mjs"],
    ],
    [
      12,
      "Task status, priority and date validation cannot be replaced by stale UI values",
      [s("tasks"), c("task-recovery")],
    ],
    [
      13,
      "Announcement scheduling and publication use stable reviewed audience and content",
      [s("chapter-announcements"), c("announcement-recovery")],
    ],
    [
      14,
      "Scoped announcement email is separately authorized and never inferred from UI visibility",
      [s("chapter-announcements"), "scripts/test-local-announcements.mjs"],
    ],
    [
      15,
      "Whiteboard revisions and recovery refuse silent concurrent overwrites",
      [s("whiteboards"), c("whiteboard-recovery")],
    ],
  ],
);
group(
  "FIN",
  ["23", "24.4", "25.5", "26.8", "28.4"],
  [
    [
      4,
      "Canonical decimal money never relies on floating-point rounding",
      [s("finances")],
    ],
    [
      5,
      "Submission requires current authorized scope and valid server-owned request fields",
      [s("finance-routes"), d("050_finance_ledger")],
    ],
    [
      6,
      "Approval chain and self-approval prohibitions are enforced in the ledger transaction",
      [d("050_finance_ledger"), "scripts/test-local-finances.mjs"],
    ],
    [
      7,
      "Rejection requires current proof, revision and a deliberate decision",
      [s("finances"), s("finance-routes")],
    ],
    [
      8,
      "Completion preserves actual money and retained supporting evidence",
      [d("050_finance_ledger"), d("051_finance_attachments")],
    ],
    [
      9,
      "Cancellation and terminal transitions cannot silently overwrite later decisions",
      [d("050_finance_ledger"), c("finance-recovery")],
    ],
    [
      10,
      "Financial decisions and exact report/export scopes are audited",
      [s("finance-routes"), "scripts/test-local-finances.mjs"],
    ],
    [
      11,
      "Finance attachments remain private, bounded and scanner-authorized",
      [s("finances"), "scripts/test-local-finance-uploads.mjs"],
    ],
    [
      12,
      "Budget dates, decimal allocations and activation transitions validate server-side",
      [s("finances"), s("finance-routes")],
    ],
    [
      13,
      "Budget changes preserve exact current version and allocation constraints",
      [d("050_finance_ledger"), c("finance-recovery")],
    ],
    [
      14,
      "Report totals and state counts use the same authorized filtered inventory",
      [s("finance-routes"), "tests/browser/operations-compositions.spec.ts"],
    ],
    [
      15,
      "Finance CSV retains exact cents, masks identities and neutralizes formulas",
      [s("finances"), s("finance-routes")],
    ],
    [
      16,
      "Retained financial records cannot be erased through ordinary delete routes or cleanup",
      [s("finance-routes"), d("051_finance_attachments")],
    ],
    [
      17,
      "Selected-request refresh failure retains a dated proposal and pauses stale actions",
      [c("finance-recovery")],
    ],
    [
      18,
      "Unknown finance saves reconcile before exact fresh-proof retries",
      [c("finance-recovery"), "scripts/test-local-finance-recovery.mjs"],
    ],
    [
      19,
      "Inactive budget and inventory reads remain explicit and recoverable",
      [d("052_finance_inactive_budgets_cleanup"), c("finance-recovery")],
    ],
  ],
);
group(
  "NEWS",
  ["22.12", "23", "26.5", "27.3", "27.4", "29.2"],
  [
    [
      6,
      "Subscription normalization and consent do not silently activate a subscriber",
      [s("newsletter"), c("newsletter-recovery")],
    ],
    [
      7,
      "Repeated subscription requests preserve generic privacy responses",
      [s("newsletter-gate"), "scripts/test-local-newsletter.mjs"],
    ],
    [
      8,
      "Confirmation token inspection does not consume a pending subscription",
      [s("newsletter-token-review"), c("newsletter-token-ui")],
    ],
    [
      9,
      "Unsubscribe inspection and explicit confirmation preserve the original token action",
      [s("newsletter-token-review"), c("newsletter-token-ui")],
    ],
    [
      10,
      "Token expiry, hashes and cleanup keep raw capabilities out of routine records",
      [
        d("108_newsletter_token_review"),
        d("087_newsletter_token_bulk_cleanup"),
      ],
    ],
    [
      11,
      "Subscriber management uses current state and bounded paginated selectors",
      [s("newsletter"), c("newsletter-recovery")],
    ],
    [
      12,
      "Campaign subjects, templates and copied drafts remain normalized and escaped",
      [s("newsletter"), c("newsletter-recovery")],
    ],
    [
      13,
      "Recipient selectors and final review create a fixed eligible audience snapshot",
      [
        d("083_newsletter_send_review"),
        "scripts/test-local-newsletter-review.mjs",
      ],
    ],
    [
      14,
      "Scheduled campaign work is lease-bound and validates saved dates",
      [d("084_newsletter_delivery"), "scripts/test-local-newsletter.mjs"],
    ],
    [
      15,
      "Approving an uncertain campaign cannot create another audience or send intent",
      [c("newsletter-recovery"), d("083_newsletter_send_review")],
    ],
    [
      16,
      "Campaign delivery attempts retain bounded retry/lease semantics",
      [d("084_newsletter_delivery"), "scripts/test-local-newsletter.mjs"],
      [
        "Actual authorized provider delivery and accepted-but-lost provider callbacks remain hosted acceptance",
      ],
    ],
    [
      17,
      "Provider callbacks verify original bytes, timestamp and rotation signatures",
      [s("newsletter-webhook")],
    ],
    [
      18,
      "Terminal campaign detail and subscriber capabilities follow explicit retention cleanup",
      [
        d("085_newsletter_results_cleanup"),
        d("087_newsletter_token_bulk_cleanup"),
      ],
    ],
    [
      19,
      "Unsubscribe state suppresses recipients at the actual delivery boundary",
      [d("084_newsletter_delivery"), "scripts/test-local-newsletter.mjs"],
    ],
    [
      20,
      "Audience authority and campaign permission are enforced independently of visible editor controls",
      [s("newsletter"), d("082_newsletter_workspace")],
    ],
  ],
);
group(
  "CONTENT",
  ["22", "23", "25.5", "28.3"],
  [
    [
      13,
      "Curated collections preserve ordering, inactive state, private proposals and current denial clearing",
      [s("content-records"), c("public-content-recovery"), c("cms-recovery")],
    ],
    [
      14,
      "Published navigation, footer and page copy use validated public projections and recoverable publishing",
      [s("site-content"), s("curated-content-retries"), c("cms-recovery")],
    ],
  ],
);
group(
  "PRIVATE",
  ["6.2", "23", "24", "26.1", "28.1"],
  [
    [
      5,
      "Blog content stays private and cannot create public document or discovery projections",
      [s("blog"), s("site-document")],
    ],
    [
      6,
      "Editor ownership and approval actions cannot become publishing or moderation authority",
      [s("blog"), c("blog-recovery")],
    ],
    [
      9,
      "Project membership, dates, links, status and tags use current private authority",
      [s("projects"), c("project-recovery")],
    ],
    [
      10,
      "Private editorial/project files require scoped authorization and safe upload handling",
      [s("blog"), s("projects"), "scripts/test-local-blog-uploads.mjs"],
    ],
  ],
);
group(
  "PWA",
  ["11", "27.3", "28.3", "30"],
  [
    [
      2,
      "GT manifest and icons expose the intended install surface without claiming actual device installation",
      [s("pwa-policy"), "scripts/prepare-pwa-icons.mjs"],
      ["Physical Chromium/Android/iOS installability and icon presentation"],
    ],
    [
      3,
      "Waiting updates require explicit guarded activation and preserve another dirty tab",
      ["scripts/test-production-pwa-update.mjs"],
      ["Hosted retention of prior hashed JavaScript and deployed rollback"],
    ],
    [
      12,
      "CacheStorage excludes APIs, admin, Forms and capability/query application URLs",
      [
        s("pwa-policy"),
        s("pwa-worker"),
        "scripts/test-production-pwa-boundaries.mjs",
      ],
    ],
    [
      13,
      "Offline public submissions do not turn validation, capacity or authorization refusal into automatic retry",
      [s("public-queue"), c("submission-queue-ui")],
    ],
    [
      14,
      "IndexedDB multi-tab claims serialize one in-flight submission and expose storage failures",
      [
        s("public-queue"),
        c("submission-queue-ui"),
        "scripts/test-production-pwa-boundaries.mjs",
      ],
    ],
    [
      15,
      "Logout epochs and expiry erase stored personal payload and fence late acknowledgements",
      [s("public-queue"), "scripts/test-production-pwa-boundaries.mjs"],
    ],
    [
      16,
      "Push permission is requested only after a deliberate eligible user action",
      [s("push")],
      [
        "Actual supported-device permission prompts and denial/re-prompt behavior",
      ],
    ],
    [
      17,
      "Push subscriptions require a current session or verified registration capability",
      [s("push"), "scripts/test-local-push.mjs"],
    ],
    [
      18,
      "Notification click destinations reject unsafe origins, paths and capability material",
      [s("push"), s("pwa-worker")],
    ],
    [
      19,
      "Installed iOS/Android permission, delivery and click flows work on actual supported devices",
      [],
      [
        "Physical installed-device permission, real opt-in delivery/click and browser support acceptance; no provider send is authorized in this local task",
      ],
    ],
    [
      20,
      "Push worker delivery preserves leases, terminal failures and retry limits",
      [s("push"), "scripts/test-local-push.mjs"],
      [
        "Actual authorized VAPID/provider delivery, device receipt and monitoring",
      ],
    ],
  ],
);
group(
  "A11Y",
  ["12.1", "22.1", "23", "28.3", "31.2"],
  [
    [
      12,
      "Real 200-percent browser zoom and reflow preserve all workflows and controls",
      ["scripts/test-local-browser-zoom.mjs"],
      [
        "Actual Chromium browser zoom is covered across public, workspace and Forms routes; remaining manual critical workflows and other supported browsers/devices require review",
      ],
    ],
    [
      13,
      "Screen-reader critical paths work with VoiceOver, NVDA or JAWS",
      [],
      [
        "Manual assistive-technology paths, names, announcements and reading order",
      ],
    ],
    [
      14,
      "Actual Safari/devices preserve orientation, viewport and software-keyboard behavior",
      [],
      [
        "Physical supported devices and Safari; emulated WebKit is separate evidence",
      ],
    ],
    [
      15,
      "Validation errors are associated, readable and focus the actionable invalid field",
      [
        c("contact-ui"),
        c("event-ui"),
        c("form-settings-ui"),
        c("accessibility-structure"),
      ],
    ],
    [
      16,
      "Gallery lightbox retains keyboard operation, accessible labels and return focus",
      [c("public-gallery-ui"), c("accessibility-structure")],
    ],
    [
      17,
      "Builder and respondent field ordering remain operable without pointer dragging",
      [c("form-editor-permissions"), c("accessibility-structure")],
    ],
    [
      18,
      "Charts provide meaningful labels and accessible data alternatives without invented totals",
      [
        c("workspace-ui"),
        "tests/browser/workspace-compositions.spec.ts",
        "tests/browser/operations-compositions.spec.ts",
        "tests/browser/secondary-compositions.spec.ts",
      ],
    ],
    [
      19,
      "Forced-colors and user transparency/motion preferences retain readable controls",
      ["scripts/test-local-browser-zoom.mjs"],
      [
        "Actual forced-colors/high-contrast and user preference review on supported systems",
      ],
    ],
    [
      20,
      "File transfer, cancellation, retries and scanning states have accessible progress and focus",
      [c("respondent-file-recovery"), c("form-response-file-recovery")],
    ],
  ],
);
group(
  "OPS",
  ["14", "16", "26.8", "27.3", "29", "31.2", "32", "33"],
  [
    [
      2,
      "Hosted CSP, HSTS, framing, referrer, permissions and cache headers match the required route matrix",
      ["scripts/test-production-security-headers.mjs", s("asset-cache-policy")],
      [
        "Actual deployed header requests, CSP reporting, allowed embed/connect origins and private/no-store routes",
      ],
    ],
    [
      3,
      "Scheduled work requires server-only credentials, correct occurrence and current lease",
      [s("jobs"), s("runtime-plan"), "scripts/test-local-jobs.mjs"],
    ],
    [
      4,
      "Queued mail maintains bounded retry and authenticated payload handling",
      [s("events"), s("event-mail"), "scripts/test-local-jobs.mjs"],
      ["Actual authorized mail provider acceptance and delivery monitoring"],
    ],
    [
      5,
      "Pinned malware scanner, signatures, startup trust and actual framed scanning are verified",
      [s("scanner"), "scripts/test-local-scanner.mjs"],
    ],
    [
      6,
      "Media publication/purge jobs preserve private originals, current scope and held data",
      [s("media"), s("media-content"), d("139_media_cursor"), "tests/browser/security-release.spec.ts", "scripts/test-local-media-files.mjs"],
    ],
    [
      7,
      "Form export expiry, abandoned jobs and protected downloads preserve lease and access rules",
      [s("form-exports"), "scripts/test-local-form-exports.mjs"],
    ],
    [
      8,
      "Retention cleanup stops at batch/time budgets and reports unfinished or lost-lease work",
      [s("retention-worker"), s("jobs"), d("096_operational_retention")],
    ],
    [
      12,
      "Hosted monitors, alerts and scheduled dependencies are active under supervised operations",
      [s("telemetry"), d("097_operational_monitoring")],
      [
        "Hosted alert delivery, receiver ownership and missed-cadence observation",
      ],
    ],
    [
      13,
      "Hosted PITR plus object recovery meets the agreed RPO/RTO",
      ["scripts/test-backup-restore.mjs"],
      [
        "Actual hosted PITR/object restore and measured RPO/RTO; isolated local restore does not certify these",
      ],
    ],
    [
      14,
      "Migration rehearsal works with explicit API grants on fresh and legacy-default databases",
      ["scripts/test-database.mjs", "scripts/source-db-audit.mjs"],
      ["Staging migration rehearsal and exact artifact/rollback review"],
    ],
    [
      15,
      "Exact-artifact promotion, rollback and 48-hour observation are signed off",
      [],
      [
        "Authorized staging/production rollout, rollback drill and full 48-hour observation; deployment remains outside this local task",
      ],
    ],
  ],
);
export const normativeCases = cases;
