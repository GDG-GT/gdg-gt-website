# CMS read and operation recovery — October 27, 2026

Site content and composition state remount on account, role and session changes.
Permission, inventory and selected-record reads are independent and abortable.
Changed scopes hide old snapshots immediately; temporary failures retain a
timestamped authorized view. Denied/missing selected content clears the editor.
Current grants and original revisions block obsolete saves and publication
reviews while preserving input. Publication, unpublication, archive and restore
now each have a separate review. Visibility/paging/collection controls lock while
an editor or review is open. Errors, saved receipts and review headings receive
semantic focus. Offline drafts never auto-submit.

Private writes use synchronous pending guards, abort signals and ownership checks.
Accepted saves remain reported as saved if public content refresh fails. The CMS
server currently lacks mutation replay deduplication; UI uncertain failures
therefore preserve the draft and block blind retry until the operator inspects
the inventory and closes/reopens. This guard does not claim server idempotency.
Known validation errors remain correctable; server revision conflicts lock saves.
Server mutation replay remains an explicit PRD implementation gap.

Private composition reads now use keyed snapshots, ignore aborted responses,
retain timestamped previews on temporary failure and clear denied previews.
Twenty-two DOM cases include two axe structural audits. Composition lifecycle
tests use controlled page/shell/context adapters; complete real-page composition
and visual acceptance are not implied. Eleven real loopback checks use a fresh
fictional officer and new private navigation draft, without changing existing
managed copy or account roles. The draft is recoverably archived and the account
disabled/sessions revoked. No public publication, provider, mail or user file was
used; quotas/jobs were not reset. Evidence: `phase0/local-cms-recovery.json`.

All 1,142 tests in 139 files pass. Global coverage remains below 70%: 57.46% lines,
55.85% branches, 55.90% statements and 47.89% functions. All 17 critical-file branch
gates pass. Types, lint (zero errors/25 existing warnings), production build, entry
byte budgets and secret scan pass. No threshold/inclusion was relaxed. No new
live-browser CMS or visual acceptance is claimed by this checkpoint.

The catalog contains 135 unverified logical cases. Server replay, full browser
interruption, device/screen-reader, real composition, visual, hosted/cache and
global coverage acceptance remain open. This does not finish the complete PRD.
