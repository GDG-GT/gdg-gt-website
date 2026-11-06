# Response-workspace availability recovery — November 6, 2026

Close/reopen in the response workspace now has an explicit consequence review.
It captures the current saved form revision and availability. Changed revision,
state, publication history, archived status, permission, offline or failed private
reads prevent confirmation. Archived forms explain that restoration creates a
private draft before another publication/reopening can be reviewed.

The component uses migration 119's existing atomic current-session form-library
write and read-only inspection API. It freezes the original revision/state/body/
key, latches dispatch, cancels obsolete account/role/form/session work, rejects
substituted result targets and preserves unconfirmed intent across offline
interruption. Reconnection never sends a write. Accepted outcome inspection
acknowledges the original result; unaccepted changes require fresh access/source
checks and explicit identical retry within 47 hours. Known conflicts require an
explicit fresh review. A second failed retry now clears the shared library
recovery inspection before dispatch, requiring another outcome check rather than
leaving stale retry readiness available. Navigation guards cover review and
uncertainty. Stopping recovery requires a consequence review and fresh reads.

Current capability revocation clears the private review and blocks the response
workspace until access is explicitly rechecked. Source-read outages pause the
current review without silently discarding it. Pending work blocks modal dismissal;
uncertain work remains open for inspection or reviewed abandonment. The recovery
view uses existing restrained tokens and removes redundant review copy on mobile.

Verification so far:

- All 114 focused cases across five files pass, including 23 new availability
  cases and existing library mutation/availability/response-read/privacy checks.
  They cover both states/loss positions, exact intent, pending duplicates,
  changed state/revision/permission, offline/session/account changes, known
  failures, denial, second response loss, reviewed stopping and invalid targets.
- All 38 actual loopback API/DB/desktop-mobile Chromium checks pass:
  `phase0/local-form-response-availability.json`. Both loss positions for closing
  and reopening produce exactly one saved state revision and audit entry per
  action, preserve the published version and pass measured populated axe.
- Two fresh fictional internal forms were published once each; four intended
  availability changes per form. Zero responses/delivery jobs/workers/provider
  sends/existing chapter or production changes. Forms archived/accounts disabled/
  sessions revoked. Captures remain unapproved visual candidates. No new SQL
  migration or historical migration change is needed for this checkpoint.

Production-browser and full-tree results are recorded in the current tracker.
Saved-view writes, Forms access/settings/deletion/integrations/runtime and full
coverage, manual, real-device, physical-storage, visual and hosted acceptance
remain open. This does not certify complete PRD acceptance.

All 162 production-browser cases across six profiles pass, followed by 24 final
layout checks: `phase0/form-response-availability-workspace-browser.json` and
`phase0/form-response-availability-final-browser.json`. Build/types/lint (zero
errors/25 existing warnings), byte budgets, secrets and traceability pass. All
1,900 tests/181 files pass. Global coverage remains red: 67.59% lines, 67.31%
branches, 65.86% statements and 58.81% functions. All 17 critical branch gates
pass; no timeout/threshold changed. Catalog stays 159 unverified cases.
