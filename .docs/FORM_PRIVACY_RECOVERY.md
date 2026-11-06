# Retention and operational-hold recovery — November 6, 2026

Migration 123 adds read-only privacy outcome inspection and wraps the existing
atomic hold/release transaction with current session-generation and receipt-expiry
checks. Current account/form/response authority is checked before disclosure.
Receipts retain only their existing policy revision; the recovery projection adds
only current target identifiers, revision, hold/release capability and existence.
Reasons, answers, passwords and retention counters are excluded. Accepted
individual holds can still be acknowledged after a later separately reviewed
release and response erasure; inspection never reapplies the original hold.
Functions and the renamed internal transaction have explicit service-only grants.

The retention panel is keyed by account, role, form and response. Independent
private reads retain matching settings/proposals on outages and pause changes.
Changed form-wide/individual revisions require an explicit fresh review rather
than overwriting proposed values. Denial/session replacement clears private
settings, proof and proposals and requires explicit access rechecking. Reconnect
requires an explicit current read; it never submits a change. Pending mutations
are synchronously latched and obsolete account/context/offline transport cancelled.
Read feedback remains distinct from an empty policy and preserves explicit focus.

Hold/release intent freezes only original target, policy revision, chosen settings,
reason, confirmation and request key. Password properties are defensively excluded
from the serialized intent. Proof is cleared after each attempt and on offline/
session changes. Accepted outcome inspection needs no repeated password or write.
An unaccepted identical retry requires current matching revision/access/capability,
a newly entered password and explicit activation, bounded to 47 hours. The server
verifies current proof again. A second lost retry requires another inspection.
Wrong password remains a known unaccepted proof failure; it does not disclose or
silently discard settings as though data permission had changed. Other known
conflicts require reviewed reload/discard; denial clears private state. Malformed,
substituted or unexpected result revisions remain unconfirmed. Original and
uncertain reviews participate in navigation protection; stopping recovery requires
review and a fresh read. Original response retention deadlines are never rewritten.

Unconfirmed recovery is presented first, with the frozen original settings in an
expandable read-only review, so mobile users can reach outcome controls directly.
The UI keeps the existing restrained neutral/coral workspace controls and policy
consequence copy. No SSO/provider integration is enabled by this checkpoint.

Verification so far:

- Both complete 123-migration SQL suites pass (221/222 checks), including both
  100-client capacity races; all six isolated restore checks pass. Migration 123
  applied locally without a reset or historical migration rewrite. SQL covers
  original revision/password proof, current authority, expiry, single audits,
  unchanged deadlines and accepted metadata after subsequent release/erasure.
- All 55 focused cases across four files pass: 19 new route and 28 new client
  cases, plus existing settings-read/schema regressions. They cover both targets/
  loss positions, fresh proof, unchanged original body/key, second loss, changed
  form/individual revisions, denial/session/offline behaviour, proof failures,
  duplicate pending actions, expiry, malformed/substituted outcomes and stopping.
- All 58 actual loopback API/DB/desktop-mobile checks pass:
  `phase0/local-form-privacy-recovery.json`. Both form-wide and individual
  hold/release paths cover both loss positions, one revision/audit per action,
  newly entered retry proof, measured axe and unchanged original answer revision,
  response deadline and delivery jobs. Two fictional internal forms published
  once, one intended response each and sixteen reviewed privacy mutations total.
  One fresh fictional officer per viewport. Metadata jobs disabled/secrets
  cleared, forms archived/accounts disabled/sessions revoked. No workers,
  provider sends, existing chapter or production changes. Captures unapproved.
- The initial probe used one officer across both viewports and reached the
  existing ten-review/15-minute quota after 38 passing checks. The remaining
  change stayed unconfirmed without bypassing the limit. Its cleanup completed
  and report is preserved in `phase0/local-form-privacy-recovery-initial.json`.
  The corrected probe isolates each viewport's owned officer and changes no
  quota, cooldown or production data.

Production-browser and full-tree results are recorded in the current tracker.
Delivery, collaborator/private-link lifecycle, permanent-deletion/integration/
runtime recovery and complete coverage, physical-storage, device/manual, visual
and hosted acceptance remain open. This is not complete Forms or website approval.

All 96 privacy/response-read/action-denial/shared-workspace production-browser
cases pass across six profiles, followed by 24 final mobile/layout/recovery
checks: `phase0/form-privacy-recovery-workspace-browser.json` and
`phase0/form-privacy-recovery-final-browser.json`. Final mobile recovery was
inspected. Build/types/lint (zero errors/25 existing warnings), byte budgets,
secrets and traceability pass. All 2,013 tests/185 files pass. Global coverage
remains red: 68.39% lines, 68.14% branches, 66.60% statements and 59.52% functions.
All 17 critical branch gates pass; no timeout/threshold changed. Catalog remains
159 unverified cases.
