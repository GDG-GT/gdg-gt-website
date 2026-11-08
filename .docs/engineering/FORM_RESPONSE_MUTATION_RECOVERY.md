# Response deletion and redaction recovery — November 6, 2026

Migration 121 binds each destructive response action to its reviewed respondent-
edit revision, privacy status and redaction state. Current account/session, form
and response authority and operational holds are rechecked under transaction
locks. The existing erasure path removes or redacts current answers, historical
answers and declared respondent identity. The original action, target, session,
key and body fingerprint identify one atomic receipt and one audit entry.
Receipts contain only identifiers/action, never answers or respondent identity.
Both new functions have explicit service-only grants.

The API requires the reviewed metadata and exact DELETE/REDACT confirmation.
The read-only recovery endpoint projects only current metadata and the minimal
receipt. Accepted requests reconcile without another mutation, including after
soft deletion. An unaccepted action requires a fresh current-access inspection,
matching revision/privacy state, no hold and an explicit identical retry. Expired,
changed, substituted or malformed results cannot authorize a replacement action.
The browser retries within 47 hours; database receipts expire after 48 hours.

The response inspector presents the consequences and typed confirmation before
writing. It synchronously clears cached response/summary answers and conceals
identity, history and attachment controls before the irreversible request.
Only metadata remains to support recovery. Offline/session/context changes abort
obsolete work; reconnect never resubmits. Known validation/conflict failures
require an explicit fresh response review. Unconfirmed actions preserve their
original body/key and participate in navigation protection; stopping recovery
requires review and a fresh read. Pending actions have a synchronous duplicate-
submission latch. Holds and unavailable reads keep actions visible but disabled,
preserving an already-open review without authorizing a change.

Verification:

- Both complete 121-migration SQL suites pass (217/218 checks), including both
  100-client capacity races; all six isolated backup/restore checks pass.
  Migration 121 is confirmed applied on the dedicated local database without
  resetting it. The first isolated SQL run exposed an incorrect test/grant
  function signature; it was corrected before application, its own stopped
  scratch container/volume removed, and both complete suites rerun successfully.
- All 189 focused cases across seven files pass, including 30 new client and
  27 new route cases. They cover before/after acceptance loss, exact retries,
  changed revision/privacy/hold, denial, offline/session/context cancellation,
  expiry, malformed results, reviewed abandonment and parent answer withholding.
- All 40 actual loopback API/DB/desktop-mobile Chromium checks pass:
  `../phase0/local-form-response-write-recovery.json`. Ten concurrent identical
  requests for each action return one receipt/audit. Both loss positions for
  both actions retain the original request key/body, erase only intended owned
  fictional values, withhold private details and pass measured populated axe.
  Recovery creates no additional delivery jobs. Mobile recovery was inspected.
- Three fresh fictional internal forms were published, with ten intended
  responses and ten respondent edits in total. Metadata notification jobs from
  those submissions were disabled and secret payloads cleared without running
  workers. Forms archived, accounts disabled and sessions revoked. No provider
  sends, existing chapter data, deployment or production changes. Captures are
  unapproved candidates rather than visual sign-off.

Production-browser/full-tree verification is recorded in the current tracker.
Availability and saved-view writes still need complete recovery. Forms access,
delivery/privacy/deletion/integrations/runtime and complete coverage, manual,
real-device, storage, visual and hosted acceptance remain open. This checkpoint
does not certify the complete Forms or website PRD.

All 126 production-browser checks across six profiles pass, including response
actions, reads, history, attachments, exports and shared workspace surfaces:
`../phase0/form-response-write-workspace-browser.json`. Build/types/lint (zero errors/
25 existing warnings), byte budgets, secrets and traceability pass. All 1,877
tests/180 files pass. Global coverage remains red: 67.49% lines, 67.20% branches,
65.77% statements and 58.77% functions. All 17 critical branch gates pass; no
timeout or threshold changed. Catalog remains 159 unverified cases.
