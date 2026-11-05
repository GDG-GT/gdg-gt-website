# Form availability reviews and settings read recovery — November 4, 2026

Form library archive, restore, close and reopen now require a separate review
that names the selected form and states the consequences. Starting a review
refreshes the authorized inventory; confirmation waits for current data and is
blocked when the form, revision, status or grant changes. Archiving retains
responses/history; restoring creates a private draft rather than reopening it.
Closing stops new submissions, while reopening retains published access rules,
schedule and limits. Archived forms cannot use the close/reopen shortcut.

The synchronous operation guard prevents duplicate confirmation and holds the
review open while the write is pending. Failures keep the review and show an
error. Offline confirmation is disabled; reconnect does not submit. Account,
role and cleared-session changes remount private library state. Pending reviews
participate in the existing navigation guard. Existing revision-bound server
contracts remain unchanged; broader Forms mutation cancellation, uncertain-result
recovery and access-management reviews are separate work.

Delivery and retention panels now expose named initial loading states and an
explicit in-place retry after a failed read. Retry performs only the read and
focuses the persistent workspace landmark. Obsolete reads abort on unmount;
delivery, retention, publication and policy settings are not changed by retry.

Fresh local verification:

- 53 focused tests across five files pass, including 11 availability-review
  cases and six settings-read recovery cases. Tests exercise all four review
  actions, cancel, failure, duplicate confirmation, pending escape, offline,
  session clearing, changed revisions and revoked grants.
- All 1,197 tests/145 files pass in the sequential full coverage run. Coverage
  remains below the required 70%: lines 58.91%, branches 57.78%, statements
  57.45%, functions 49.44%. All 17 critical-file branch gates pass. No threshold
  or timeout was raised. Types and lint pass (zero errors/25 existing warnings).
  Build, public/offline bundle budgets and the current-file/local-history secret
  scan pass (zero unreviewed findings).
- All 18 existing actual local form-library checks pass. Seven additional
  actual HTTP/DB checks confirm delivery/retention anonymous denial, safe private
  no-store projections, and unchanged draft revision/availability. Owned probe
  drafts are archived; fictional accounts are disabled and sessions revoked.
  See `phase0/local-form-library.json` and
  `phase0/local-form-settings-reads.json`. No existing account/content, policy
  approval, publication, mail, provider or production setting was changed.

The unchanged 110-migration SQL chain retains the October 27 clean/legacy-grant
and isolated restore evidence; these client-only changes do not claim a fresh
SQL run. The traceability catalog has 140 unverified logical cases. Live browser,
contrast, device, screen-reader, visual and hosted acceptance remain open.
