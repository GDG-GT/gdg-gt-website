# Private project recovery — October 27, 2026

Project state now remounts on account, role and session changes. Permissions,
inventory and selected details load independently with abortable keyed reads.
Initial reads show skeletons or a retryable unavailable state. Temporary refresh
failure keeps a timestamped authorized snapshot; changed filters hide the former
scope. Permission denial clears private fields and cancels pending work.

Saves and participant removal use synchronous pending guards, request cancellation
and context ownership. Unchanged retries keep their key without retaining password
signatures. Archive/restore recheck exact title, password, grants and revision at
submit time; passwords clear at request start. Remote revisions preserve input and
block obsolete saves. Selecting a different project at the same revision now
clears the previous editor. Offline drafts never auto-submit. Error/receipt/editor
focus and filtered empty-state recovery are covered.

Eighteen DOM cases include three axe structural audits. The full suite passes
1,045 tests in 134 files; coverage is still below 70% at 52.72% lines/50.72%
branches. All 17 critical-file branch gates pass. Types, lint (zero errors/25
existing warnings), production build, entry budgets and secret scan pass. No
coverage inclusion or threshold was relaxed.

Twenty-eight actual loopback API checks pass, including an independent project
update during browser review. Owned fixtures were recoverably archived, the
community participant deactivated, fictional accounts disabled/sessions revoked
and the private review ledger removed. No external provider, mail, invitation or
public project was created; quotas/jobs were not reset.

Browser review confirms the unsaved title survives the remote revision and Save
stays locked. At 375 px the document remains 375 px, the title control fits and the
table viewport is 339 px. The fictional draft was discarded through the navigation
confirmation, then the browser signed out, tab closed and viewport reset. No
browser save/archive/participant operation occurred. Screenshot:
`../ui-review/project-conflict-recovery.png`; observations:
`../phase0/project-recovery-browser-observations.json`; API evidence:
`../phase0/local-projects-integration.json`.

The catalog contains 131 unverified logical acceptance cases. Complete device,
screen-reader, visual, hosted security/operations and global coverage acceptance
remain open. This checkpoint does not finish the full PRD.
