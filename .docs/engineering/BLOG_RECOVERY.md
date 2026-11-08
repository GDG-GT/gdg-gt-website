# Private editorial recovery — October 27, 2026

Blog state remounts on account, role and session changes. Permissions, inventory,
category choices, selected details and personal overview reads recover
independently. Keyed abortable reads hide old scopes, retain timestamped snapshots
on temporary failures and clear denied data. Skeletons, retry controls, filtered
empty-state reset and semantic editor/error/receipt focus are implemented. Category
choices now have pagination beyond the first 30 records without losing the
retained selected value.

Editorial writes use synchronous pending guards and context-owned abort signals.
Current grants/revision/scope and exact confirmation are checked by the handler.
Passwords clear at request start and are excluded from retry signatures. An
unchanged request retains its key after uncertain failure, including password
reentry. New revisions preserve drafts while blocking obsolete saves. Offline
input stays in the tab and never auto-submits.

Private file intent, PUT, completion and download authorization use cancellation
and ownership checks. Upload stages retain unchanged retry keys; fields freeze
during pending operations and revoked owning scope clears the selected file.
Unavailable detail reads hide signed links and cancel authorization. Overview
responses cannot restore state after abort; denied counts clear independently.

Twenty-six DOM cases include three axe structural audits. All 1,071 tests in 135
files pass. Global coverage remains below 70%: 54.48% lines, 52.55% branches,
53.03% statements and 44.75% functions. All 17 critical-file branch gates pass.
Types, lint (zero errors/25 existing warnings), build, entry budgets and secret
scan pass. No coverage threshold or inclusion was relaxed.

Thirty-five actual loopback editorial checks and 23 real quarantine/scanner/
download checks pass. Fictional accounts/team/records are recoverably archived
and sessions revoked; the private browser-review ledger is removed. No real
person/file, public Blog, external provider or email was introduced. Quotas/jobs
were not reset. Evidence: `../phase0/local-blog-integration.json` and
`../phase0/local-blog-uploads-integration.json`.

Browser review confirms unsaved title preservation and locked Save following an
independent revision. The 375 px document remains bounded, title input fits and
table viewport is 339 px. The fictional draft was discarded via the navigation
confirmation. Sign-out/close was attempted; the final browser check lost its tab
attachment, so successful UI sign-out/explicit tab closure are not claimed.
Fixture cleanup independently revoked its sessions. Viewport reset was issued;
only the earlier public-home tab remained in the browser inventory. Screenshot:
`../ui-review/blog-conflict-recovery.png`; observations:
`../phase0/blog-recovery-browser-observations.json`.

The catalog has 132 unverified logical cases. Browser interruption/download,
screen-reader/device, visual, hosted storage/security/operations and complete
coverage acceptance remain open. This checkpoint does not finish the full PRD.
