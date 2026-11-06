# Numbered PRD test mapping

All 146 explicit v1.5 requirements now map into 160 logical acceptance cases in
`phase0/prd-test-plan.json`. Each case identifies its concrete executable source
suites, applicable manual/hosted work and an unverified acceptance state. Cases
may cover several related requirements; this is not a count of tests executed or
features completed. Normative Sections 21–33 and phase exit gates also apply.

The mapping is reviewed in `scripts/lib/prd-test-plan.mjs`. Run
`npm run test:traceability` to validate IDs/ranges, file existence, complete
requirement coverage and consistency with the stored PRD hash/inventory. CI now
runs this structural check. After an intentional mapping review, regenerate the
two JSON artifacts with `node scripts/check-prd-traceability.mjs --write`.

The checker never changes requirement statuses or invents execution evidence.
All 146 remain `unverified` against the full acceptance definition, even when
their automated local suites pass. Device installation, manual accessibility,
provider delivery and staging/visual approval are explicitly still open. The
optional `--release` check refuses a release while any requirement is unverified.
The catalog also includes the normative isolated backup/restore case. The
remaining unused IDs in the mandatory ranges and normative test groups must
also be completed before phase/launch sign-off.

Three Forms rows retain the original PRD wording plus Tejas's overriding decision:
no anonymous forms, declared name/email now, SSO/Google deferred, and optional
exact own-response copies only to the entered address, excluding file bytes and
private links. A receipt/notification policy must not be confused with that
respondent-requested copy.

The inventory generator remains deliberately conservative and preserves reviewed
mappings/statuses when refreshing inventory. Its ordinary extraction tests still
assert that a newly generated inventory cannot auto-approve anything.

The existing Forms read/scope case also maps archived-status editor gating and
read-only preview/history inspection. Its local checks do not close remaining
Forms child/access/settings/deletion, response/integration/runtime or full
role/device/manual/visual/hosted acceptance. See `FORM_ARCHIVED_VIEW.md`.

The response-edit/history case now maps independent private revision inventory
and selected-snapshot recovery, denial clearing and sensitive/context fences.
Actual local and production-browser evidence is recorded in
`FORM_RESPONSE_HISTORY_RECOVERY.md`; remaining response workflows and complete
manual/hosted acceptance stay open.

The private file case now maps scoped expiring response attachment authorization
and its browser/client recovery checks. Storage/device/manual/hosted acceptance
remains open; see `FORM_RESPONSE_FILE_RECOVERY.md`.

The response-workspace case now maps independent private inventory, summary,
saved-view and hold-status reads, including explicit denial/filter recovery.
Response mutation/export/navigation and full device/manual/hosted acceptance
remain open; see `FORM_RESPONSE_READ_RECOVERY.md`.

The background-export case now maps current-session atomic creation/removal
receipts, read-only reconciliation, frozen original retries and private inventory/
download scope checks. Local recovery does not certify new physical storage,
real-device or hosted acceptance; see `FORM_EXPORT_RECOVERY.md`.

The response privacy case now maps revision/privacy-bound atomic deletion and
redaction receipts, metadata-only read reconciliation, exact explicit retries,
answer withholding and current hold/access checks. Local SQL/API/desktop-mobile
evidence is recorded in `FORM_RESPONSE_MUTATION_RECOVERY.md`. Availability, saved
views and remaining Forms/manual/device/hosted acceptance remain open.

The response-workspace case also maps reviewed close/reopen with original
revision/state intent, read-only library receipt recovery and explicit exact
retry. See `FORM_RESPONSE_AVAILABILITY_RECOVERY.md`; saved-view and remaining
Forms/device/manual/hosted acceptance remain open.

The response-workspace case now also maps owned saved-view create/replace/remove
revisions, atomic minimal receipts, read-only original-outcome recovery and
server-paged inventory search. See `FORM_SAVED_VIEW_RECOVERY.md`; remaining Forms
children and full manual/device/visual/hosted acceptance stay open.

The retention/privacy case now maps metadata-only original outcome inspection,
current-session/expiry guards, retained private reads, frozen settings and
newly entered proof for explicit identical retry. See `FORM_PRIVACY_RECOVERY.md`;
physical retention/storage and full manual/device/visual/hosted acceptance remain
open along with the remaining Forms child workflows.

The delivery case now maps current receipt/expiry inspection, frozen original
review and fresh-proof retry, independently recovered policy/recipient reads,
search/paging beyond 200 and explicit unavailable-recipient removal. See
`FORM_DELIVERY_RECOVERY.md`; provider/manual/device/hosted acceptance remains open
along with the remaining Forms child workflows.

The Forms access case now also maps current-session, generation/revision-bound
collaborator grant mutation receipts, read-only accepted reconciliation, exact
explicit retries, concurrent creation/removal and delete/recreate protection.
Inspector exits protect uncertain work. See `FORM_COLLABORATOR_RECOVERY.md`.
Private-link lifecycle and full manual/device/visual/hosted acceptance remain open.

The permanent-deletion case now also maps original-session read-only receipt
inspection after content erasure, short-lived snapshot/retention/hold gates,
frozen identical explicit retries with fresh password proof, denied-state clearing
and protected navigation. See `FORM_PERMANENT_DELETION_RECOVERY.md`. Private-link,
integration/runtime and complete storage/manual/device/visual/hosted acceptance
remain open.

The access case now also maps private invitation/link batch approval, resend and
revocation to current-session version/publication-bound atomic receipts, fixed
audience/expiry intent, read-only reconciliation, explicit identical retries and
protected inspector/navigation exits. The populated private-link table is a named
keyboard-focusable scrolling region. See `FORM_PRIVATE_LINK_RECOVERY.md`; complete
manual/device/storage/visual/hosted and remaining integration/runtime acceptance
remain open.

The first-party integration case now maps session-bound published-form candidates,
version/generation-bound link mutations, minimal read-only original-outcome
reconciliation, explicit identical retries and selected-target concealment after
an empty current read. SQL, client, route, actual local API and production-browser
sources are mapped in `FORM_INTEGRATION_RECOVERY.md`. This does not approve the
remaining respondent/runtime or full manual/device/visual/hosted acceptance.

The supported-field/image case also maps independent approved-image picker
loading, retained snapshots, paging/shrink/failure recovery, explicit reconnect
recheck and form/field/account/session cancellation. Local evidence is in
`FORM_IMAGE_PICKER_RECOVERY.md`; full storage/device/visual acceptance stays open.

The private-file case now also maps respondent upload preparation receipts,
current-access read-only inspection, exact original transfer/completion recovery,
attachment status/removal/context fences, real local storage/scanner checks and
scanner isolation/ownership guards. See `RESPONDENT_UPLOAD_RECOVERY.md`. Final
respondent submission/draft recovery and full device/storage/hosted acceptance
remain open.

The runtime case now also maps original submission/edit/versioned-draft receipts,
current-authority read-only inspection, exact explicit retries, known-conflict
reviewed reload, anonymous-bootstrap/session distinction and guarded same-form
private-fragment replacement. See `RESPONDENT_WRITE_RECOVERY.md`; local evidence
does not approve remaining directory/inbox/privacy recovery or full manual/
device/visual/hosted acceptance.

The private directory case now also maps independent member permission/inventory/
selected-record/activity recovery, current-denial clearing, keyed late-response
fences, retained proposals, offline explicit recheck and real local read-only
verification. See `MEMBER_READ_RECOVERY.md`; complete merge/write, destination
inventory, role/device/manual/visual/hosted acceptance remains open.

The directory case now also maps current-session source-bound merge candidate/
selected-target SQL, complete eligible paging, creation destinations beyond 100,
private picker failure/context/offline recovery and real local native comparison.
See `MEMBER_SELECTION_RECOVERY.md`; ordinary member/merge unknown-outcome recovery
and full role/manual/device/visual/hosted acceptance remain open.

The contact case now also maps private inbox/selected read recovery, retained
timestamped proposals, malformed-result refusal, current-denial/context fences,
reviewed stale reload, current redaction clearing and activated short-lived
attachment validation. `CONTACT_INBOX_READ_RECOVERY.md` records local evidence;
status/hold original-outcome mutation and full role/manual/device/visual/hosted
acceptance remain open.

A new normative operations case maps person-data privacy cleanup-read recovery,
retained scope/review, current-denial clearing, account/session cancellation,
explicit offline recheck and guarded private navigation. SQL/server/client/browser/
actual-local sources are linked in `PRIVACY_READ_RECOVERY.md`. The catalog now has
160 unverified logical cases; no full requirement or release status is promoted.

The directory case now also maps session-scoped ordinary member mutation receipts,
current-authority metadata-only inspection, exact explicit retries with fresh
lifecycle proof, unknown/offline cancellation and reviewed stopping. SQL/client/
route/browser/native evidence is in `MEMBER_WRITE_RECOVERY.md`; merge preview/
commit original-outcome and full manual/device/visual/hosted acceptance remain open.

The contact inbox case now also maps current-session original status/hold mutation
receipt inspection, atomic exact replay, fresh hold/release proof, current access/
redaction fences and reviewed stopping. See `CONTACT_WRITE_RECOVERY.md`; local
checks do not close manual/device/visual/hosted approval.

The community directory case now maps original merge preview/commit recovery:
minimal session-bound receipts, exact read-only reconciliation/explicit fresh-proof
retry, current source/target authority, null legacy fields, current parent private
clearing and accepted replay preserving later canonical edits. Local evidence in
`MEMBER_MERGE_WRITE_RECOVERY.md` does not certify full manual/hosted acceptance.

The normative person-data privacy case also maps current-session original review/
approval recovery, exact source/hold/proof fences, summary-only accepted export
reconciliation and explicit memory-only export handoff/clear. SQL/API/native and
production-browser evidence is in `PERSON_PRIVACY_WRITE_RECOVERY.md`; institutional
identity/retention, physical bytes and full manual/device/hosted approval remain.
