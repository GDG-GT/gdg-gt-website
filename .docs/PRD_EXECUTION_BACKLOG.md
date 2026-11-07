# Remaining PRD execution and acceptance

Reviewed against the complete v1.5 PRD on 2026-10-21, including normative sections
21–33, not just numbered feature bullets. The chronological implementation tracker
documents local evidence. Neither this checklist nor passing local tests closes
the PRD's staging, security, performance, accessibility or visual approval gates.

Current local verification update (2026-11-06): public-entry, populated-browser,
PWA, header/cache and mandatory-ID verification now extend the latest functional
module checkpoint, `PERSON_PRIVACY_WRITE_RECOVERY.md`. Completed recovery checkpoints include tasks,
announcements, whiteboards, finance, media, projects, editorial, newsletter and availability. Their dedicated recovery documents
and newest `IMPLEMENTATION_STATUS.md` entries supersede older test/coverage counts
below. All numbered requirements remain unverified against complete acceptance;
passing local interactions is not a PRD-completion percentage.

## Deferred by Tejas

Georgia Tech SSO and Bevy/Engage integration are deferred, not implementation
blockers for the remaining original v1.5 work. Existing disabled SSO placeholders
do not perform authentication or verification. No external integration is enabled.

## Local implementation checkpoints

Ordinary member create/update/archive/restore/profile-sync/unmerge now preserve
unknown original intent, inspect current-session receipts read-only and support
exact explicit retries with fresh lifecycle proof (`MEMBER_WRITE_RECOVERY.md`).
Contact status/hold original-outcome recovery is implemented locally
(`CONTACT_WRITE_RECOVERY.md`, migration 134). Merge review/commit original-outcome recovery is also implemented locally
(`MEMBER_MERGE_WRITE_RECOVERY.md`, migration 135). Privacy review/approval original-outcome recovery is now implemented locally
(`PERSON_PRIVACY_WRITE_RECOVERY.md`, migrations 136/137). A fresh final audit,
function coverage and complete acceptance remain. Parent directory, picker and privacy/inbox reads have separate
completed local evidence below.

Person-data privacy cleanup-status reads and retained review/scope recovery are
implemented locally (`PRIVACY_READ_RECOVERY.md`), including current-denial clearing,
explicit stuck-read restart and offline/account/session fences. Original review/
commit recovery also has local evidence (`PERSON_PRIVACY_WRITE_RECOVERY.md`);
complete manual/device/hosted acceptance remains separate.

Contact inbox independent private reads, retained proposals, current-denial and
redaction clearing, reviewed stale reload and expiring activated attachment links
are implemented locally (`CONTACT_INBOX_READ_RECOVERY.md`). Status/hold unknown-
outcome recovery is implemented locally (`CONTACT_WRITE_RECOVERY.md`); person-data
privacy mutation recovery also has local evidence (`PERSON_PRIVACY_WRITE_RECOVERY.md`).

Community-directory parent permission/inventory/selected-record/activity reads now
have local recovery (`MEMBER_READ_RECOVERY.md`), including denial clearing,
independent retries, retained timestamped proposals, offline action fencing and
account/session isolation. Complete eligible merge-candidate/selected-target recovery and creation
destinations beyond 100 are also implemented locally (`MEMBER_SELECTION_RECOVERY.md`).
The latest remaining gates are in `LOCAL_ACCEPTANCE_AUDIT.md`.

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

The dated audit/checkpoint entries above are historical. Current evidence is in
`LOCAL_ACCEPTANCE_AUDIT.md`, `CURRENT_CHECKPOINT.md` and the newest
`IMPLEMENTATION_STATUS.md` entry.

- All 307 mandatory test IDs now map to reviewed source suites and/or explicit
  manual/hosted steps. All 146 numbered requirements remain unverified against
  complete acceptance. A missing mandatory ID now fails the structural checker.
- The last complete coverage invocation passes all unchanged global 70% and all
  21 individual critical 90%-branch gates: 2,672 tests/214 files. Lines 78.09%,
  branches 75.59%, statements 76.10%, functions 70.75%. Cache-policy and all nine
  drawer/search/composition checks are included in that final run.
- Production-browser coverage expanded to all six configured profiles, with
  138 populated composition cases and 162 review screenshots for the 22 primary
  prompt groups. Complete approved pixel comparisons, secondary surfaces,
  negative-role/dialog/manual/device acceptance remain separate. Full navigation
  testing exposed mobile drawer/command focus defects; the corrections pass nine
  unit cases and the separate final 90-case scope across all six profiles. Native
  zoom review was deferred while shared Chrome was in use.
- PWA local production probes pass 15 real CacheStorage/IndexedDB boundary checks
  and nine changed-offline-asset/two-tab activation checks. Physical installs,
  actual push permissions/delivery/clicks and hosted hashed-asset rollout/rollback
  remain open.
- Local HTTPS enforcement passes 45 configured security/header/cache checks.
  Stable artwork/fonts now revalidate; only hashed JS/CSS are immutable. Current
  source/history secret scanning passes with exact non-secret fixture/digest
  reviews. Production dependency audit has zero high/critical findings; two
  moderate/four low advisories remain. Actual hosted CSP/headers and dependency
  re-audit at launch remain required.
- Isolated Lighthouse public mobile scores are 94/94/95, accessibility 100 and
  CLS zero; desktop scores 100. Mobile lab LCP is about 3.0 seconds and misses
  2.5 seconds. Field p75 LCP/INP/CLS and representative 3D hardware/load testing
  remain open. Source-byte budgets pass; initial gzip JavaScript is about 126 kB.
- Strict types/build pass; lint has zero errors/10 existing warnings. CI now
  defines balanced browser shards, full-history secret scanning and a blocking
  high/critical production dependency audit. No GitHub run is claimed.
- Real GT-owned staging/production infrastructure, controlled domains, provider
  credentials, mail DNS/VAPID, approved chapter assets/copy, reviewed recipients,
  storage CORS, supervised scanners/workers/scheduler and operational alerts are
  still required. Local-only authorization excludes deployment, production
  changes, purchases and real provider sends.
- Manual assistive technology, actual 200% browser zoom, forced colors, physical
  Safari/devices, complete keyboard paths, institutional brand/privacy/retention/
  finance approvals and Tejas's blocking visual sign-off remain open. Hosted
  migration rehearsal, PITR/object restore, measured RPO/RTO, rollback and
  48-hour release observation cannot be inferred from local checks.

## Next implementation checkpoint

React Router 7.18.5 migration is locally verified: final 2,684-test full coverage,
all 108 rebuilt navigation cases and 15 PWA/nine update/46 header checks pass.
The original complete browser invocation found the corrected drawer failure;
it is retained, not relabeled as passing. Audit now has only four low KaTeX-chain
package entries. Current mobile LCP remains about 3.1 seconds. Continue public
schema/startup optimization, compatible KaTeX/Mermaid/whiteboard review and
remaining secondary/confirmation/manual/device/hosted acceptance. Preserve the
existing prototypes and all local-only boundaries; do not repeat migrations or
owned completed writes.

Latest route-aware preloads pass 76 public browser cases/eight expected skips,
46 HTTPS/header checks and 13 targeted helper/traceability cases. The copied
362-byte gzip helper is counted in the 114,943-byte initial JS total. All three
mobile LCP gates remain failing at about 3.0 seconds. Next local review includes
the v6 router security patch and remaining rendering/secondary/acceptance work.
Current browser inventory is 1,320 cases, 440 per shard. Earlier checkpoints below
retain their historical counts.

The guarded-navigation continuation now passes full coverage (2,673 tests/215
files with unchanged gates), all 162 focused six-profile browser cases and nine
real PWA update checks. Startup JavaScript is 114,581 gzip bytes. Mobile LCP still
fails; investigate route-inappropriate hero preloads and high-priority font
contention next. Current browser inventory is 1,314 cases, 438 per shard. The
following paragraph describes the preceding secondary review checkpoint.

Checkpoint 422970e saved the verified public-entry/navigation baseline. The next
continuation corrected response chart layout and added nine secondary states:
54 passing six-profile cases and 72 unapproved captures. Twenty-four targeted
unit cases and the preceding 60-case browser scope pass. Current inventory is
1,296 cases, three shards of 432. Continue mobile LCP and the remaining secondary
and confirmation review states listed in `POPULATED_VISUAL_REVIEW.md`.
Manual/device/approved-
visual and hosted acceptance remain explicitly open; no percentage or full PRD
completion claim follows from these local checks. `CURRENT_CHECKPOINT.md` records
the exact final evidence and authorization boundaries. Preserve unrelated user
edits and immutable applied migrations; do not deploy or send through real providers.
