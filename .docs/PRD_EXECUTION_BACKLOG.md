# Remaining PRD execution and acceptance

Reviewed against the complete v1.5 PRD on 2026-10-21, including normative sections
21–33, not just numbered feature bullets. The chronological implementation tracker
documents local evidence. Neither this checklist nor passing local tests closes
the PRD's staging, security, performance, accessibility or visual approval gates.

Current local verification update (2026-11-06): the latest module checkpoint is
`CONTACT_WRITE_RECOVERY.md`; completed recovery checkpoints include tasks,
announcements, whiteboards, finance, media, projects, editorial, newsletter and availability. Their dedicated recovery documents
and newest `IMPLEMENTATION_STATUS.md` entries supersede older test/coverage counts
below. All numbered requirements remain unverified against complete acceptance;
passing local interactions is not a PRD-completion percentage.

## Deferred by Tejas

Georgia Tech SSO and Bevy/Engage integration are deferred, not implementation
blockers for the remaining original v1.5 work. Existing disabled SSO placeholders
do not perform authentication or verification. No external integration is enabled.

## Feature implementation still required

Ordinary member create/update/archive/restore/profile-sync/unmerge now preserve
unknown original intent, inspect current-session receipts read-only and support
exact explicit retries with fresh lifecycle proof (`MEMBER_WRITE_RECOVERY.md`).
Contact status/hold original-outcome recovery is implemented locally
(`CONTACT_WRITE_RECOVERY.md`, migration 134). Merge review/commit and privacy
review/approval unknown outcomes remain. Parent directory, picker and privacy/inbox reads have separate
completed local evidence below.

Person-data privacy cleanup-status reads and retained review/scope recovery are
implemented locally (`PRIVACY_READ_RECOVERY.md`), including current-denial clearing,
explicit stuck-read restart and offline/account/session fences. Original review/
commit unknown outcomes remain, along with merge mutations.

Contact inbox independent private reads, retained proposals, current-denial and
redaction clearing, reviewed stale reload and expiring activated attachment links
are implemented locally (`CONTACT_INBOX_READ_RECOVERY.md`). Status/hold unknown-
outcome recovery is implemented locally (`CONTACT_WRITE_RECOVERY.md`); person-data
privacy mutation recovery remains confirmed work.

Community-directory parent permission/inventory/selected-record/activity reads now
have local recovery (`MEMBER_READ_RECOVERY.md`), including denial clearing,
independent retries, retained timestamped proposals, offline action fencing and
account/session isolation. Complete eligible merge-candidate/selected-target recovery and creation
destinations beyond 100 are also implemented locally (`MEMBER_SELECTION_RECOVERY.md`).
Merge unknown outcomes and privacy mutations remain confirmed work in `LOCAL_ACCEPTANCE_AUDIT.md`.

CMS and public-content collection mutation replay is now implemented locally
(`CURATED_CONTENT_RETRIES.md`). Collection-editor independent reads,
account/session cancellation and selected-row recovery are also implemented
locally (`COLLECTION_RECOVERY.md`); supported-device, visual and hosted acceptance
remain open.

The November 4 source-audit gaps for Forms access consequence reviews and
candidate/collaborator search/paging are now closed locally
(`FORM_ACCESS_RECOVERY.md`), including removal of the fetched-membership ceiling.
That original access checkpoint covers reads/consequence reviews. Collaborator grant
lifecycle atomic replay, current-session outcome recovery and generation/revision
protection are now implemented locally (`FORM_COLLABORATOR_RECOVERY.md`). Private
invitation/link issuance, resend and revocation now also have versioned atomic
receipts, current-session read-only reconciliation, fixed audience/publication/
expiry intent and explicit identical retries locally (`FORM_PRIVATE_LINK_RECOVERY.md`). Permanent
form-deletion private-denial, original-outcome and fresh-proof explicit retry
recovery are now implemented locally (`FORM_PERMANENT_DELETION_RECOVERY.md`),
including concealment after purge and the unchanged five-minute review. Delivery now has original-outcome/fresh-proof
recovery, complete eligible-recipient search/paging and explicit unavailable-account
removal locally (`FORM_DELIVERY_RECOVERY.md`). Retention/hold
private reads, original-intent reconciliation and fresh-proof explicit retries
are now implemented locally (`FORM_PRIVACY_RECOVERY.md`); complete acceptance
still requires the remaining manual/device/hosted gates.
Form library availability reviews and delivery/retention initial
read retry are also closed locally (`FORM_AVAILABILITY_RECOVERY.md`);
profile session/activity read recovery is also closed locally
(`PROFILE_READ_RECOVERY.md`). Own-profile mutation and reviewed session recovery
are now closed locally (`PROFILE_MUTATION_RECOVERY.md`), including actual
accepted-but-dropped save reconciliation. Independent Events reads are now
closed locally (`EVENT_READ_RECOVERY.md`), including real desktop/mobile outage
recovery. Core Events/attendee writes, current action capabilities, consequence
reviews and draft navigation now have local recovery (`EVENT_MUTATION_RECOVERY.md`).
First-party event/team/campaign linked-form inventories, consequence reviews,
version/generation-bound replay and current-session outcome recovery are also
implemented locally (`FORM_INTEGRATION_RECOVERY.md`). Respondent final-submission/edit/save-and-resume original-outcome recovery is
also implemented locally (`RESPONDENT_WRITE_RECOVERY.md`), including fixed-token
versioned draft saves, current-authority read-only inspection and guarded native
private-link replacement. Newly confirmed directory/inbox/privacy recovery gaps
are recorded in `LOCAL_ACCEPTANCE_AUDIT.md` and remain open. Respondent-file preparation/transfer/completion/removal and current-status
recovery are implemented locally (`RESPONDENT_UPLOAD_RECOVERY.md`), including
real loopback private-storage/local scanner verification. Image-picker
independent read/selection/context recovery is implemented locally
(`FORM_IMAGE_PICKER_RECOVERY.md`),
as do the remaining browser/device/manual acceptance matrices.
These are implementation gaps, separate from external launch inputs.
Audit history/detail read recovery is now closed locally (`AUDIT_READ_RECOVERY.md`);
complete browser/device/manual/export/hosted acceptance remains open.
Overview read/widget recovery is also closed locally (`OVERVIEW_READ_RECOVERY.md`);
its complete supported-browser/role/manual/performance/hosted acceptance remains open.
Account-directory and selected-session read recovery is also closed locally
(`USER_READ_RECOVERY.md`); full acceptance work remains open.
Account-write/selected-record revision recovery is now also closed locally
(`USER_MUTATION_RECOVERY.md`), including atomic setup-link replay and actual
accepted-but-lost browser saves. Full account-action/role/device/manual/hosted
acceptance remains open.
Team inventory/detail/history/destination reads, team/member/grant reviews and
atomic mutation replay are closed locally (`TEAM_READ_RECOVERY.md`,
`TEAM_MUTATION_RECOVERY.md`). Invitation/announcement private reads, stale-state
navigation and atomic write recovery are also closed locally
(`TEAM_CHILD_READ_RECOVERY.md`, `INVITATION_MUTATION_RECOVERY.md`,
`TEAM_ANNOUNCEMENT_MUTATION_RECOVERY.md`). These include bounded immutable retries,
typed lifecycle/published-edit reviews, exact private reconciliation and prevention
of duplicate invitation mail or publication notification jobs. Full supported-role/
device/manual/visual/provider/hosted acceptance remains open.
Event-mail approval reconciliation and private current-sender history are now
closed locally (`EVENT_MAIL_RECOVERY.md`): accepted receipt reads do not resend,
unaccepted approvals require exact recheck/fresh-proof explicit retry, and denial
clears private state. Full role/device/manual/visual/provider/hosted acceptance
remains open.
Saved-definition denial/timestamp recovery and builder/response account-session-
form scope isolation are also closed locally (`FORM_BUILDER_READ_SCOPE.md`).
Queued autosave/publication cancellation, paused-read/stale draft review and
validation correction are covered. Atomic builder draft/publication replay is
also implemented locally (`FORM_AUTHORING_RECOVERY.md`), with read-only accepted-
write reconciliation, exact explicit retries and reviewed draft resumption.
Library private read/proposed-title/denial recovery is also implemented locally
(`FORM_LIBRARY_READ_RECOVERY.md`), including explicit access recheck across cleared
filters. Library creation/duplication/availability replay is also implemented
locally (`FORM_LIBRARY_MUTATION_RECOVERY.md`), with source-revision-bound copies,
exact original-request recovery and reviewed abandonment. Archived builder views
now enforce read-only draft/publication presentation while preserving saved preview
and immutable published history (`FORM_ARCHIVED_VIEW.md`). This also guards an
archive discovered during a retained local proposal. The newer access, deletion,
integration and response checkpoints above/below supersede that original scope.
Respondent submission/edit/save-and-resume recovery now has local evidence in
`RESPONDENT_WRITE_RECOVERY.md`; complete acceptance stays open. Independent response inventory/summary/saved-view/hold reads are
implemented locally (`FORM_RESPONSE_READ_RECOVERY.md`). Background export
creation/removal receipts, private inventory, exact explicit retry and scoped
short-lived downloads are also implemented locally (`FORM_EXPORT_RECOVERY.md`);
complete physical storage/device/manual/hosted acceptance remains open.
Response deletion/redaction now has atomic reviewed revision/privacy receipts,
metadata-only reconciliation, identical explicit retry and synchronous answer
withholding (`FORM_RESPONSE_MUTATION_RECOVERY.md`). Response-workspace close/
reopen reviews and original-intent recovery are implemented locally
(`FORM_RESPONSE_AVAILABILITY_RECOVERY.md`). Saved-view create/replace/remove now
has revision-bound atomic receipts, original-request recovery and complete owned
inventory search/paging locally (`FORM_SAVED_VIEW_RECOVERY.md`). Other Forms
recovery and complete acceptance gaps remain open.
Private response history now has independent inventory/snapshot recovery, denial
clearing and account/role/sensitive-context cancellation locally
(`FORM_RESPONSE_HISTORY_RECOVERY.md`). Private response attachment authorization
now cancels/clears across context changes and exposes only explicitly activated,
bounded links (`FORM_RESPONSE_FILE_RECOVERY.md`); complete storage/device/hosted
acceptance remains open.

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

- Fresh November 4 audits report zero high/critical findings: production has two
  moderate/four low; the complete tree has fifteen moderate/seven low. The earlier
  five development high findings are absent from the current full audit. The
  patched Zod migration is documented in `ZOD_VALIDATION_UPGRADE.md`; keep the
  dependency gate and recheck before launch.
- Strict application/build TypeScript now passes. Lint remediation remains:
  zero errors/25 warnings after reviewed unused-client retirement and typed CMS recovery;
  conditional-hook violations in active code were fixed. An existing untracked
  user file still has its separate hook warning and is preserved.
- All 17 individual critical-file 90%-branch gates now pass. Overall unit
  coverage is 67.17% lines/66.87% branches at the export checkpoint,
  below the global 70% gate; 1,820 tests pass, not a
  percentage of completed PRD features.
  See `CRITICAL_TRANSPORT_TESTING.md` for the scoped measurements.
  All 146 numbered requirements now map into 159 reviewed logical test cases with
  real source references (`phase0/prd-test-plan.json`). Normative sections and
  manual/hosted acceptance remain; the inventory is not a completion percentage
  and its `unverified` statuses are not promoted from local build success.
- Complete CI: the committed foundation runs lint/type/unit/canonical SQL/build
  plus a blocking production dependency audit and a digest-pinned Playwright
  browser job. It has not run on GitHub here;
  the dependency gate passes locally; the independent coverage gate remains red.
  All 112 applicable public/shared-workspace production-build browser checks pass locally across
  six profiles (eight explicit profile skips), plus 21 actual local public
  UI/API and six moving-hero/fallback checks (`BROWSER_VERIFICATION.md`). Full
  private/populated/Forms/PWA browser acceptance and remaining coverage are open.
  Redacted all-local-ref history/current-file secret scanning passes locally
  (`SECRET_SCAN_OPERATIONS.md`), with two exact reviewed fictional test inputs;
  hosted credential inventory/rotation remains separate. Public byte/artifact
  gates are implemented and pass locally.
- Every public/protected route and negative role/team/resource/storage boundary,
  remaining stale-data/navigation states, outage/reconnect recovery, supported
  browsers, keyboard/zoom and manual screen-reader paths.
  Local axe structural cases and module-specific interaction audits run in the normal unit suite
  (`ACCESSIBILITY_STRUCTURE_CHECKS.md`); JSDOM contrast and incomplete axe checks
  are not certified by that result.
  Public empty-inventory browser checks now include actual contrast-enabled axe;
  this does not certify all populated, error, dialog or private states.
  All 93 actual authenticated loopback checks pass across 31 default workspace
  routes/states at both desktop sizes and mobile. Measured contrast and
  keyboard-table issues are corrected (`WORKSPACE_BROWSER_ACCESSIBILITY.md`).
  This is not full mutation/role/dialog/manual accessibility acceptance.
- Public route bundles, modern images/font budgets, 3D fallbacks, Lighthouse,
  LCP/INP/CLS and load tests. Public byte budgets and bounded offline install now
  pass; runtime profiles and complete lazy-route inspection remain open.
- Deterministic visual baselines at both PRD desktop sizes, full-page captures,
  reviewed masks, mobile/real-device review and Tejas's explicit visual sign-off.
  Public review candidates are captured at both desktop sizes and emulated
  mobile; all 22 populated prompt surfaces and approved pixel comparison remain.
- Real GT-owned staging/prod infrastructure, domains, credentials, approved assets
  and chapter copy, reviewed recipients/retention/privacy settings, storage CORS,
  scanner and supervised workers/scheduler. No real email, deployment or purchase
  is authorized by the local-only task.
- Hosted 404/SEO/security-header/CSP behavior, database migration rehearsal,
  backup/restore, monitoring, alerting, rollback and release observation.

## Next implementation checkpoint

Complete the confirmed community-directory, contact-inbox and person-data
privacy recovery in `LOCAL_ACCEPTANCE_AUDIT.md`, then the remaining quality/
coverage/device acceptance beyond the now-passing 21 critical-file gates.
Latest full coverage passes lines/branches/statements at 73.53%/73.32%/71.87%;
functions at 65.04% still fail the unchanged 70% global gate.
Preserve the read-only Git reference and historical SQL for retired clients
(`LEGACY_CLIENT_RETIREMENT.md`), and keep user edits intact. Track implementation separately from verified
acceptance; do not label the complete PRD finished until its launch gates pass.
