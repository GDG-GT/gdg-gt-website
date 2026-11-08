# Collaborator grant recovery — November 6, 2026

Migration 125 gives every explicit collaborator grant a stable generation UUID and
monotonic revision. A deleted/recreated grant receives a different generation even
when its revision starts at one. Candidate and collaborator inventories include
these expected versions, remain server-paged and expose no account emails or
secrets. Reads are bound to the current session and view/manage-access authority.
Existing team/owner/action eligibility rules remain in force. Inactive or departed
recipients cannot receive new grants but their stored grants remain removable.

Reviewed creation, replacement and removal are now atomic and bound to actor,
session, form, recipient, original body and explicit request key. Form revision
and grant generation/revision comparisons happen under mutation locks. Receipts
contain only identifiers/action. Current authority and expiry are checked before
reading an accepted receipt. Accepted old deletions acknowledge their original
outcome while preserving later legitimate replacement grants; new stale deletions
conflict. Legacy direct functions remain service-only; the HTTP legacy write path
was removed rather than left as a bypass.

The UI freezes the reviewed original target, versions, actions and request key.
Unknown outcomes pause new mutations. Checking is read-only; only an explicitly
inspected unaccepted request can be retried, identically, within 47 hours and with
current action/target/version checks. A second loss requires another inspection.
Malformed acknowledgements stay unconfirmed. Offline/session/account/form changes
cancel obsolete requests; reconnect never submits. Denial clears private inventory
and proposals and refreshes the parent builder's current permissions. Stopping
recovery requires reviewing the uncertainty and fresh inventory reads.

Access proposals register with navigation safety. Pending/uncertain collaborator
changes also protect inspector tab switches, Escape/outside dismissal and mobile
close. The close button is disabled while protected. Only one access workspace is
mounted when the mobile inspector is open, so hidden desktop instances cannot
replace its state. Ordinary unsent proposals require a discard review before
leaving the inspector. Mobile recovery appears before the inventory, with an
expandable original-request review.

Verified locally:

- Both complete 125-migration SQL suites pass: 225/226 checks, including both
  100-client capacity races. Six isolated backup/restore checks pass. Migration
  125 applied to the dedicated local stack without a reset or historical change.
- Route/client checks cover current-session scopes, safe metadata projections,
  malformed/versionless requests, immutable original bodies, before/after loss,
  second loss, changed form/actions/grant generation, denial, offline cancellation,
  expiry, reviewed stopping and independent private read regressions.
- Forty actual loopback API/DB/desktop-mobile checks pass, including measured axe,
  original-request retries, one mutation/audit and ten simultaneous identical
  creations/removals per viewport. Accepted old deletion preserves a recreated
  grant; a new stale request conflicts. Existing 105-account inventory and
  view-only definition scripts also pass with explicit versioned request bodies.
- The first live probe completed desktop then used the wrong mobile dialog title;
  the corrected probe passed. A subsequent guard probe scoped desktop tabs inside
  a tabpanel incorrectly; corrected guarded execution passed. Failed probe reports
  are retained. A later presentation-only rerun reached the unchanged sign-in IP
  quota before any form write; its report is separate. No quotas/timeouts were
  changed. The successful execution report is restored from its exact retained
  command output, with provenance recorded.
- Fixtures use new fictional accounts and private drafts only; no publications,
  responses, delivery jobs/workers, provider sends, existing chapter or production
  changes. Owned forms are archived/accounts disabled/sessions revoked. Captures
  remain unapproved candidates. Production-browser/full-tree results are in the
  current implementation tracker.

Private invitation/link issuance, resend and revocation still need their own
atomic original-outcome lifecycle recovery. Permanent-deletion, integration and
respondent/runtime work, global coverage and complete storage/device/manual/
visual/hosted acceptance remain open. SSO/Google and Bevy/Engage remain deferred.
This checkpoint does not certify complete Forms or PRD acceptance.

All 2,141 tests/189 files pass. Global coverage remains below 70%: 69.11% lines,
68.77% branches, 67.27% statements and 60.19% functions. All 18 critical 90%
branch gates pass; new collaborator route branches are 100% covered. All 90
collaborator/builder/workspace production-browser cases and 36 final collaborator
cases pass across six profiles. Build/types/lint (zero errors/25 existing warnings),
budgets, secrets and traceability pass. No threshold/timeout changed. Catalog
remains 159 unverified cases.
