# Private form invitation/link recovery — November 6, 2026

Migration 128 adds monotonic link revisions, current-session inventory reads and
atomic original-request receipts for approved batches, resend and revocation.
Both current view/manage-access authority and a nonpurged form are required.
Writes lock account/session/form/selected link, then compare the originally
reviewed draft revision, immutable publication identifier and selected-link
revision. Recipient consumption, delivery changes, erasure and revocation advance
the selected record's revision. Changed versions cannot be silently overwritten.

Batch approval freezes normalized exact addresses and absolute expiry. Existing
active links are retained rather than silently resent; receipts distinguish new
queued links from existing references. The existing atomic batch implementation
uses a derived actor/session-specific key beneath the new receipt transaction.
Resend rotates once and preserves the approved absolute expiry rather than
extending it on retries. Current unused/unrevoked/matching-publication and
one-minute cooldown checks remain. Revocation retains responses and records one
lifecycle audit. Queued messages remain protected by the worker's existing current
revocation/hash/expiry checks. No worker or provider send runs in this checkpoint.

Receipt inspection is read-only and exposes only form/publication/selected-link
metadata and minimal operation/count receipts. Addresses, raw tokens, ciphertext,
request bodies and keys are excluded. Current session/authority and receipt expiry
are checked before accepted reconciliation. Accepted requests can reconcile after
later legitimate delivery, revocation or archive without another rotation/job.
POST also checks an accepted receipt before decrypting a subsequently erased
recipient. Inventories expose masked hints and explicit revisions; erased
recipients retain generic references. Verified-email tokens remain read-only in
this lifecycle, with respondent verification preserved separately. All new
functions have explicit service-only privileges. The legacy invitation HTTP write
paths are removed; public verification and collaborator candidate lookup retain
their separate boundaries.

A dedicated private-link component now owns independent paged reads, approved
recipient/CSV proposals, consequence review and original-intent recovery. It
preserves authorized snapshots/proposals on temporary failure while pausing
confirmation. Reviewed publication and selected-record changes require a new
explicit review. Unknown outcomes freeze new changes and retain the original
body/key; accepted reconciliation never sends another POST. Unaccepted retries
require current metadata inspection and matching versions/expiry within 47 hours.
A second loss requires another inspection. Reconnect never submits automatically.
Known failures require refreshed current state. Current denial clears the private
audience/rows/intent and parent collaborator context. Account/form/session changes
cancel obsolete work. Pending/uncertain state participates in the builder's
protected tab/mobile dismissal and navigation guards. Stopping recovery requires
review and fresh reads; CSV reads cannot overwrite newer typed input.

Scrolling private-link delivery tables are named keyboard-focusable regions,
including when every row action is disabled during uncertainty. This fixes a real
contrast-enabled axe failure found by the populated production-browser matrix.
Purely empty initial tables had not exposed it in the first live axe probe.

Verified locally so far:

- Both complete 128-migration SQL suites pass: 230/231 checks including both
  100-client capacity races. Six isolated restore checks pass. Migration 128
  applied locally without reset or historical rewrite. Receipt scope/hash/expiry,
  stale selected revisions, single job/rotation/revocation/audit, current-session
  privacy, fixed expiry and service-only privileges are checked. One SQL fixture
  variable-name ambiguity was corrected and verified against its owned scratch;
  that scratch was removed. No migration or product guard was weakened.
- All 108 focused access/link client/route regressions pass: 56 new lifecycle API/
  client cases, existing access/verification checks and an additional substituted
  form-payload fence. They include before/after loss for all three operations,
  exact audience/body/key/expiry, stale context/revisions, malformed outcomes,
  denial clearing, read failure, cooldown, verified-token controls and stopping.
- All 58 actual API/DB/desktop-mobile checks pass. Each viewport uses a fresh
  private publication and officer. All three operations recover both loss
  positions with original bytes/keys and one intended lifecycle audit. Ten
  simultaneous identical batches queue one new link/job. Draft revision and
  publication remain unchanged and no responses are created. The successful
  probe creates two private publications, six fictional recipient links and ten
  metadata-only disabled delivery jobs; no worker/provider send runs. Recipient
  ciphertext is cleared/tokens revoked, forms archived/accounts disabled/sessions
  revoked. No existing chapter or production changes. Reports retain no original
  body/key/address/proof/capability.
- An initial probe hit the local dev API's restart window before creating any
  form; readiness was verified before a fresh run. A later probe completed the
  first batch then used an invalid nested row locator; corrected owned-fixture
  execution passes. Both failed probe/cleanup reports are retained. The first
  production-browser matrix was stopped after the real scrolling-region defect;
  its unexecuted interrupted cases are explicitly distinguished from approved
  skips. No timeout, quota or test threshold changed. Captures are unapproved
  review candidates. Complete browser/full-tree results are in the current tracker.

First-party form integrations and respondent/runtime recovery, global coverage
and complete storage/device/manual/visual/hosted acceptance remain open. SSO/Google
and Bevy/Engage remain deferred. This is local implementation evidence, not a full
Forms or PRD completion claim.

All 144 private-link/collaborator/builder/shared-workspace production-browser cases
pass across six profiles after the scrolling-region correction. Build/types/lint
(zero errors/25 existing warnings), byte budgets, secrets and traceability pass.
All 2,244 tests/193 files pass; all 20 critical 90% branch gates pass. Global
coverage remains below 70%: 69.86% lines, 69.61% branches, 68.15% statements and
60.84% functions. No threshold/timeout changed. Catalog stays 159 unverified cases.
