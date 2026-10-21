# Remaining PRD execution and acceptance

Reviewed against the complete v1.5 PRD on 2026-10-21, including normative sections
21–33, not just numbered feature bullets. The chronological implementation tracker
documents local evidence. Neither this checklist nor passing local tests closes
the PRD's staging, security, performance, accessibility or visual approval gates.

## Deferred by Tejas

Georgia Tech SSO and Bevy/Engage integration are deferred, not implementation
blockers for the remaining original v1.5 work. Existing disabled SSO placeholders
do not perform authentication or verification. No external integration is enabled.

## Feature implementation still required

1. Forms: reviewed response receipts and owner notifications, approved recipients,
   internal event/team/campaign form-reference contracts, comprehensive retention
   and operational-hold workflows, safe Super Admin permanent-deletion controls,
   remaining library/builder/runtime edge cases and complete accessibility tests.
   Background exports, response-history review and published-definition inspection
   are now implemented locally; their hosted acceptance remains open.
2. General private media library: folders, files, tags/star/usage, scanned uploads,
   metadata, scoped private previews, safe move/bulk/delete, size/quota checks,
   explicit approved public image delivery and gallery publication/event/lightbox
   behavior. Existing legacy screens are not proof of secure server parity.
3. Newsletter: subscribers, templates, campaign preview, immutable authorized
   recipient snapshot, confirmation, scheduling/cancellation, test sends,
   idempotent bounded delivery, callbacks, hard bounce/complaint suppression and
   cleanup. Public signup/confirmation/unsubscribe already work locally.
4. Remaining scoped mail and attachment contracts: event/team/communications
   fan-out, general private collaboration attachments, optional scanned contact
   attachments. Current contact text submission and restricted transactional mail
   do not complete the optional contact-file flow in section 22.9.
5. PWA installation/service-worker lifecycle, strict private-cache exclusions,
   update handling, IndexedDB event/newsletter queue, pending/failure/retry/discard,
   48-hour expiry, logout clearing and platform-specific instructions.
6. Push: server-bound verified ownership, encrypted endpoint/key retention,
   subscribe/unsubscribe, VAPID configuration, reminder scheduling/deduplication,
   provider failure cleanup and real supported-device delivery.
7. Cross-system privacy/operations: person-data export/redaction/deletion subject
   to holds, remaining scheduled retention/cleanup jobs, sanitized production
   telemetry/alerts, and user-facing operating guide accuracy throughout.

## Acceptance and infrastructure still required

- Close high/critical dependency findings through tested remediation, not forced
  downgrade or unreviewed overrides. Production-only audit on this review reports
  31 findings: 16 high, 14 moderate, 1 low; zero critical. Full dependency audit
  numbers differ because development dependencies are included.
- Strict application TypeScript (currently `strict:false`); lint warning
  remediation (full repository: zero errors, 276 warnings in this local worktree).
- Coverage measurement/thresholds and remaining test-ID traceability. The original
  machine-readable requirement inventory is not a completion percentage and its
  `unverified` statuses must not be bulk-promoted from local build success.
- Complete CI: the committed foundation runs lint/type/unit/canonical SQL/build
  plus a blocking production dependency audit. It has not run on GitHub here;
  the audit is expected to remain red while those findings are open. Full-stack
  browser/accessibility/integration, coverage and secret/bundle gates remain.
- Every public/protected route and negative role/team/resource/storage boundary,
  remaining stale-data/navigation states, outage/reconnect recovery, supported
  browsers, keyboard/zoom and manual screen-reader paths.
- Public route bundles, modern images/font budgets, 3D fallbacks, Lighthouse,
  LCP/INP/CLS and load tests. Oversized vendor chunks and old Browserslist data
  remain; a successful build is not a performance pass.
- Deterministic visual baselines at both PRD desktop sizes, full-page captures,
  reviewed masks, mobile/real-device review and Tejas's explicit visual sign-off.
- Real GT-owned staging/prod infrastructure, domains, credentials, approved assets
  and chapter copy, reviewed recipients/retention/privacy settings, storage CORS,
  scanner and supervised workers/scheduler. No real email, deployment or purchase
  is authorized by the local-only task.
- Hosted 404/SEO/security-header/CSP behavior, database migration rehearsal,
  backup/restore, monitoring, alerting, rollback and release observation.

## Next implementation checkpoint

Complete the remaining Forms notification/receipt and privacy controls, then the
general media/gallery migration and campaigns. Keep unrelated historical source
files and user edits intact. Track implementation separately from verified
acceptance; do not label the complete PRD finished until its launch gates pass.
