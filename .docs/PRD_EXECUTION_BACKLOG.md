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

Additional requests on 2026-10-21 are implemented locally: community directory
(`/admin/members`) CSV import/export and notification Mark all read → Dismiss all.
See `MEMBER_TRANSFER_OPERATIONS.md` for scope, limits and real test evidence.

Latest Forms decisions are implemented locally: mandatory name/email (no new
anonymous responses), truthful declared/verified provenance and opt-in copies of
the exact own questions/answers sent only to the entered address, with no separate
email confirmation. File bytes/private links are excluded. See
`FORM_RESPONDENT_OPERATIONS.md`. Georgia Tech SSO and Google sign-in stay deferred.

### Concrete gaps confirmed by the 2026-10-22 audit

Closed locally on 2026-10-26: independent public event status/type URL filters,
timezone/year display, derived capacity/availability order before pagination,
registration pending/error/focus/route isolation and service-only view restore
verification. See `PUBLIC_EVENT_INVENTORY.md`. Rescheduling history/metadata,
calendar status, canonical sharing and dual registration routes are also closed
locally (`EVENT_RESCHEDULING_OPERATIONS.md`); cancellation remains private under
the PRD's published-only rule. Remaining detail-state/visual/manual acceptance
and the global 70% coverage gate remain open; this does not close the full event PRD.

Closed locally on 2026-10-24: dashboard chart panels/four-metric administrator
composition/own unread-message overview; safe audit details/aggregate statistics/
retention inventory and cursors; CMS private saved-draft composition; invitation
decline/inviter display; Blog Editor personal tasks/messages and scoped editorial
revision analytics. Raw HTML/404/social document serving is implemented locally.
See `WORKSPACE_COMPLETION_OPERATIONS.md` and `PUBLIC_DOCUMENT_OPERATIONS.md`.
Mutable CMS projections now require edge revalidation on every read; provider-
specific cache purge is not implemented and hosted freshness/latency acceptance
remains open. Remaining image/state/accessibility details and hosted routing/
canonical-domain/crawler/social contracts still require review. Do not convert
these local implementations into staging, visual or launch sign-off.

Closed locally on 2026-10-24: missing Forms file-policy/pattern controls; public
resource status/tag/view controls; team/resource/sponsor pagination beyond 100;
pre-pagination sponsor tier order and complete impact paging; root sitemap,
configured-origin robots, served PSU text and basic route canonical/social data.
See `FORM_VALIDATION_SETTINGS_OPERATIONS.md` and `PUBLIC_DISCOVERY_OPERATIONS.md`.
Their manual/hosted/visual acceptance remains open.

1. Forms: remaining library/builder/runtime edge cases and complete accessibility tests.
   Owner/team/date/template-origin library filters and scoped paginated options
   now work (`FORM_LIBRARY_OPERATIONS.md`).
   Strict typed date-time/score/number runtime validation, native rating keyboard
   controls, associated errors/focus and pending-operation freezing are verified
   locally (`FORM_RUNTIME_OPERATIONS.md`), not full manual accessibility acceptance.
   Image blocks/header media now use real approved media with alt text and
   transactional publication/usage safeguards (`FORM_IMAGE_OPERATIONS.md`).
   Theme/progress/safe shuffling and distinct immutable/draft preview now work
   (`FORM_PRESENTATION_OPERATIONS.md`). Private-link context replacement,
   render-pure capture and router-safe cleanup are implemented and verified
   locally (`CAPABILITY_NAVIGATION_OPERATIONS.md`); remaining field/runtime/accessibility
   edge cases and broader acceptance remain open.
   Safe Super Admin permanent-deletion review and erasure are implemented locally
   (`FORM_PERMANENT_DELETION_OPERATIONS.md`); hosted retention/security acceptance
   remains open.
   Background exports, response-history review and published-definition inspection
   are now implemented locally; reviewed receipts and explicit recipient delivery
   are also implemented (`FORM_DELIVERY_OPERATIONS.md`). Their hosted acceptance
   remains open. Response/draft expiry and independent form/response holds are
   implemented locally (`FORM_PRIVACY_OPERATIONS.md`); cross-system privacy and
   full retention/operational acceptance remain open.
   Internal event/team/campaign references, event/team controls and safe public
   event CTAs are implemented locally (`FORM_INTEGRATION_OPERATIONS.md`).
2. Media/gallery full supported-device, manual accessibility, hosted scanner/
   storage/CORS/header/retention/load and visual acceptance. The local folder/
   file/tag/star/usage/upload/metadata/private-preview/bulk/quota/publication/
   cleanup and public gallery workflows are implemented and tested; legacy media
   routes have been replaced. See `MEDIA_OPERATIONS.md` for boundaries/evidence.
3. Newsletter supported-device/accessibility, hosted sender/domain/provider/raw
   callback/worker/retry/load and visual acceptance. Local scoped subscriber/
   template/campaign UI/APIs, safe previews, immutable send review/audience,
   schedule/cancel/self-test, bounded delivery, verified callbacks/suppression,
   export, recoverable bulk cleanup and retention are implemented and tested.
   See `NEWSLETTER_OPERATIONS.md`. No real provider sends were enabled.
4. Remaining mail acceptance. Source collaboration attachment-contract review is
   complete (`COLLABORATION_ATTACHMENT_REVIEW.md`): latent columns/types did not
   provide an operational source uploader, and the target remains explicitly
   text-only with strict attachment-property rejection. No new public-file shortcut
   was introduced. Event mail now has exact audience/content
   review and current authorization/registration checks at delivery; existing
   chapter/team/DM notices use their scoped preparation paths. See
   `EVENT_MAIL_OPERATIONS.md`; hosted fan-out/retry/load acceptance remains open.
   Optional scanned contact attachments and the restricted chapter inbox are now
   implemented locally, including resolution retention/holds/physical cleanup.
   See `CONTACT_OPERATIONS.md`; full hosted/browser acceptance remains open.
5. PWA full supported-device/upgrade/cache-inspection and queue edge-case
   acceptance. Production worker/manifest/icons, public-only cache rules,
   draft-guarded updates, install guidance and IndexedDB event/newsletter queue
   (pending/failure/retry/discard, 48-hour expiry and logout epoch clearing) are
   implemented locally. Interrupted-final-attempt and storage-read/focus recovery
   are implemented (`QUEUE_RECOVERY_OPERATIONS.md`). Actual browser verifies public offline fallback, private
   route refusal and a real fictional queued signup; see `PWA_OPERATIONS.md`.
6. Push actual supported-device enrollment/permission/delivery/click/expiry,
   hosted VAPID/provider/scheduler/load/privacy/accessibility acceptance. Verified
   account/registration ownership, encrypted endpoints/keys, per-event device
   controls, bounded reminders/retries/deduplication/provider cleanup and generic
   safe click handlers are implemented/tested locally. See `PUSH_OPERATIONS.md`.
   Real sending is disabled; browser notification permission was not requested.
7. Cross-system privacy/operations: reviewed person-data export/redaction/deletion
   subject to holds is implemented locally (`PERSON_PRIVACY_OPERATIONS.md`).
   Daily operational retention, sanitized telemetry, local threshold alerts and
   read-only status are now implemented (`OPERATIONS_RETENTION_MONITORING.md`).
   Hosted watchdog/log/alert delivery, backlog recovery, load and institutional
   policy acceptance remain open. Continue checking operating-guide accuracy.

## Acceptance and infrastructure still required

- Fresh October 26 audits report zero high/critical findings: production has two
  moderate/four low; the complete tree has six moderate/five low. The earlier
  five development high findings are absent from the current full audit. The
  patched Zod migration is documented in `ZOD_VALIDATION_UPGRADE.md`; keep the
  dependency gate and recheck before launch.
- Strict application/build TypeScript now passes. Lint remediation remains:
  zero errors/25 warnings after reviewed unused-client retirement and typed CMS recovery;
  conditional-hook violations in active code were fixed. An existing untracked
  user file still has its separate hook warning and is preserved.
- All 17 individual critical-file 90%-branch gates now pass. Overall unit
  coverage is still 34.79% lines/33.03% branches, below the global
  70% gate; 807 tests pass, not a percentage of completed PRD features.
  See `CRITICAL_TRANSPORT_TESTING.md` for the scoped measurements.
  All 146 numbered requirements now map into 118 reviewed logical test cases with
  real source references (`phase0/prd-test-plan.json`). Normative sections and
  manual/hosted acceptance remain; the inventory is not a completion percentage
  and its `unverified` statuses are not promoted from local build success.
- Complete CI: the committed foundation runs lint/type/unit/canonical SQL/build
  plus a blocking production dependency audit. It has not run on GitHub here;
  the dependency gate passes locally; the independent coverage gate remains red.
  Full-stack browser/accessibility/integration and remaining coverage are open.
  Redacted all-local-ref history/current-file secret scanning passes locally
  (`SECRET_SCAN_OPERATIONS.md`), with two exact reviewed fictional test inputs;
  hosted credential inventory/rotation remains separate. Public byte/artifact
  gates are implemented and pass locally.
- Every public/protected route and negative role/team/resource/storage boundary,
  remaining stale-data/navigation states, outage/reconnect recovery, supported
  browsers, keyboard/zoom and manual screen-reader paths.
- Public route bundles, modern images/font budgets, 3D fallbacks, Lighthouse,
  LCP/INP/CLS and load tests. Public byte budgets and bounded offline install now
  pass; runtime profiles and complete lazy-route inspection remain open.
- Deterministic visual baselines at both PRD desktop sizes, full-page captures,
  reviewed masks, mobile/real-device review and Tejas's explicit visual sign-off.
- Real GT-owned staging/prod infrastructure, domains, credentials, approved assets
  and chapter copy, reviewed recipients/retention/privacy settings, storage CORS,
  scanner and supervised workers/scheduler. No real email, deployment or purchase
  is authorized by the local-only task.
- Hosted 404/SEO/security-header/CSP behavior, database migration rehearsal,
  backup/restore, monitoring, alerting, rollback and release observation.

## Next implementation checkpoint

Complete remaining Forms/runtime/navigation and quality/coverage/device
acceptance and overall coverage beyond the now-passing 17 critical-file gates.
Preserve the read-only Git reference and historical SQL for retired clients
(`LEGACY_CLIENT_RETIREMENT.md`), and keep user edits intact. Track implementation separately from verified
acceptance; do not label the complete PRD finished until its launch gates pass.
