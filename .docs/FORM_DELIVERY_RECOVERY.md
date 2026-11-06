# Reviewed delivery and recipient recovery — November 6, 2026

Migration 124 adds current-session/expiry checks around the existing atomic delivery
review and a read-only original-outcome inspector. Current definition/delivery/
response authority is required. Outcome metadata includes only form/policy
revisions, edit/recipient/answer capabilities and a minimal revision receipt;
recipient identities, addresses, passwords and answers are excluded. Accepted
results can be acknowledged after later policy/draft/recipient changes without
reapplying them. Unaccepted retries check the original saved draft/policy revisions
and current recipient eligibility. Original POST still verifies a newly entered
password, definition hash, actor/recipient authority and provider configuration.
All new public/internal functions have explicit service-only grants.

A new server-paged literal recipient search replaces the UI's fetched 200-account
ceiling. Rows/counts are scoped to current eligible accounts for the selected form,
with stable name/ID ordering and no email/account-secret projection. The selected
recipient projection separately covers every configured ID, including recipients
outside the current page. Unavailable accounts use a generic label and remain in
the proposal until explicitly removed. The old client filter that silently dropped
configured recipients absent from the fetched candidate list is removed. Current
review validity checks authorization as well as schema matching.

Policy and candidate inventories recover independently. Matching snapshots and
local choices survive transient failure; dependent new-recipient approvals pause.
Query/page changes clear obsolete option snapshots while selected labels/IDs stay
in scope. First failure differs from empty results. A lazy recipient chooser keeps
an empty review compact; selected accounts remain visible across search/pages.
Current unavailable-recipient metadata overrides cached labels and blocks approval
until explicit removal. Denial clears the private policy, recipients and proof;
account/role/form/session changes cancel obsolete requests. Reconnect requires an
explicit policy read and never submits a review automatically.

The browser freezes only the original form/draft/policy/recipient choices,
confirmation and key. Password fields are excluded from frozen intent. Pending
submission is latched. Accepted loss reconciles without a second POST/proof;
unaccepted retries require fresh outcome inspection, current capabilities and a
newly entered password within 47 hours. A second lost retry needs another check.
Wrong password stays a known proof failure; other conflicts require an explicit
fresh review. Malformed/substituted results stay unconfirmed. Navigation guards
cover proposals and uncertainty, and stopping recovery requires review/fresh reads.
Unconfirmed controls appear above an expandable frozen-settings review on mobile.
Respondent-requested exact own-response copies remain separate from these chapter
notification and legacy receipt-compatibility approvals.

Verification so far:

- Both complete 124-migration SQL suites pass (223/224 checks), including both
  100-client capacity races. All six isolated restore checks pass; migration 124
  applied locally without a reset or historical migration change. SQL includes
  215 eligible recipients, selected references outside page one, unavailable
  accounts retained explicitly, current proof/authority/expiry and single audits.
- All 103 focused cases across five files pass: 28 new route and 37 new delivery
  client cases, plus existing privacy/settings/schema regressions. They cover
  both loss positions, disable/selected-recipient intent, search beyond 200,
  cross-page selection, read failures, current unavailable accounts, quota/schema/
  capability gates, fresh proof, second loss, cancellation, expiry and stopping.
- All 38 actual loopback API/DB/desktop-mobile Chromium checks pass:
  `phase0/local-form-delivery-recovery.json`. Real selection reaches recipient 215;
  candidate outages preserve proposals and pause approval; unavailable configured
  accounts remain visible until explicit removal. Both enabling/disabling and
  loss positions preserve original bodies/keys, fresh proof and one audit/result.
  Populated axe passes, mobile recovery inspected. No proof/key/body is retained
  in reports. Candidate reads are constrained to owned fixture names.
- Two fresh fictional private draft forms, eight intended policy mutations, 215
  fictional recipient accounts and separate officers per viewport. Zero
  publications/responses/delivery jobs/workers/provider sends/existing chapter or
  production changes. Forms archived/all owned accounts disabled/sessions revoked
  in bounded batches. Captures remain unapproved candidates, not visual sign-off.

Production-browser and full-tree results are recorded in the current tracker.
Collaborator/private-link lifecycle, permanent-deletion/integration/runtime recovery
and full coverage/physical-storage/device/manual/visual/hosted acceptance remain
open. This checkpoint does not certify complete Forms or website acceptance.

All 108 delivery/privacy/shared-workspace production-browser cases pass across
six profiles: `phase0/form-delivery-recovery-workspace-browser.json`. Build/types/
lint (zero errors/25 existing warnings), byte budgets, secrets and traceability
pass. All 2,078 tests/187 files pass. Global coverage remains red: 68.88% lines,
68.64% branches, 67.09% statements and 60.05% functions. All 17 critical branch
gates pass; no timeout/threshold changed. Catalog stays 159 unverified cases.
