# Form draft/publication recovery — November 5, 2026

Migration 118 adds service-only atomic authoring receipts bound to actor, original
validated request, form and action. Transactions lock current account/session,
form and media context, enforce current view/edit/publication authority and retain
only IDs/revisions in receipts. Identical requests do not repeat draft revisions,
immutable versions or audit entries. Changed intent, revoked/locked sessions,
lost scope and expired receipts fail closed. Replay projects current saved data.

Publication receipt lookup precedes validation of the current draft: an already
accepted publication can be reconciled after a subsequent draft becomes invalid,
without attempting another publication. New publications retain all existing
image, scanner, delivery-review, schema and optimistic-revision checks.

The builder freezes a normalized original definition/revision/key for uncertain
draft saves and publication. Autosave pauses while retaining newer proposed edits.
Read-only outcome checks reconcile accepted writes without another mutation.
Unaccepted writes require an explicit identical retry after current revision and
action checks, bounded to 47 hours. Offline/pending/scope changes cancel and fence
late transport; denial clears private state. Loading saved values names discarded
local edits and unconfirmed consequences. After confirmation, a separate reviewed
choice can retain the proposed draft and resume autosave over the current saved
draft. Published versions/responses remain immutable.

Verification so far:

- 64 focused client/server cases pass, including 32 new receipt/recovery cases.
  These include publish-only permission, unconfirmed-publication navigation and
  browser-reload warnings even with no unsaved draft, and preserving newer
  proposed edits until explicit reviewed autosave resumption.
- Both complete 118-migration SQL chains pass, with and without legacy automatic
  grants, including both 100-client races. Six isolated backup/restore checks pass.
- All 18 actual loopback API/DB and Chromium desktop/mobile checks pass:
  ten concurrent identical drafts/publications, accepted-but-lost and unaccepted
  saves/publications, exact key/body retry, audit/version deduplication, measured
  populated axe, no overflow/external requests or unexpected writes. Evidence:
  `phase0/local-form-authoring-recovery.json`. Fresh fictional forms use internal
  access and are archived afterward; accounts disabled and sessions revoked.
  No responses, workers/provider sends, existing chapter or production changes.

All 1,609 tests/170 files pass. Coverage remains below the global 70% gate:
65.35% lines, 65.13% branches, 63.57% statements and 56.49% functions. All 17
critical branch gates pass. Catalog: 158 unverified logical acceptance cases.

Build, type checks, lint (zero errors/25 existing warnings), entry byte budgets,
secret scan and traceability pass. All 78 authoring/builder/shared-workspace
production-browser cases pass across six profiles
(`phase0/form-authoring-workspace-browser.json`). After final success/error copy
refinement, all 24 authoring cases pass again on the final build
(`phase0/form-authoring-final-browser.json`); confirmed recovery clears the prior
network error. Screenshots were inspected and spacing refined, but remain
unapproved review captures. Emulated WebKit does not certify real Safari/devices.

Library creation/duplication/availability replay, full response/integration/runtime
recovery and the complete role/device/manual/visual/hosted acceptance matrix remain
open. This checkpoint does not certify the complete Forms or website PRD.
