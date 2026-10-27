# Site availability recovery — October 27, 2026

Availability state remounts on account, role and session changes. Abortable private
reads now show initial skeleton/unavailable/retry states, retain timestamped
snapshots on temporary failures and clear denied state. Refresh failures preserve
draft fields while blocking writes until current access is known. Remote revisions
and server conflicts preserve input and block obsolete saves. Current update
grants apply at unchanged revisions.

Writes use synchronous pending guards, abort signals and context ownership.
Passwords clear at request start. Retry identity excludes the password and remains
stable after unchanged password reentry; changed intended settings get a new key.
Exact selected-mode confirmation, approved destination and current grants are
rechecked in the handler. Offline drafts never auto-submit. Errors, editor
headings and accepted receipts receive focus. Accepted status is shown while a
subsequent read refreshes.

Seventeen interaction cases include two axe structural audits. All 1,120 tests in
138 files pass. Global coverage remains below 70%: 56.61% lines, 54.79% branches,
55.09% statements and 46.99% functions. All 17 critical-file branch gates pass.
Types, lint (zero errors/25 existing warnings), production build, entry byte
budgets and secret scan pass. No thresholds/inclusions were relaxed.

Twenty-one actual loopback checks pass, including authorization, revision replay,
destination restrictions, maintenance exemptions, active/inactive Linktree routing
and team grant revocation. The exact original local availability was restored
with a revision/message fence. Generated accounts/team/profile were recoverably
archived, sessions revoked and private review ledger removed. No external
destination/provider/mail was used and quotas/jobs were not reset. Evidence:
`phase0/local-site-status-integration.json`.

Browser confirms maintenance copy and bounded 375 px public layout. Private
operator browser review could not complete because browser input repeatedly
timed out; it is not counted. Screenshot capture also timed out and no visual
acceptance is claimed. Tab close/viewport reset were attempted, final attachment
unavailable; fixture cleanup independently revokes sessions.

Tejas's correction removes hidden-entry disclosure from public maintenance copy,
the fallback information page, unreachable footer feedback and offline signup
help. Public source scan finds no remaining access-code/footer instructions. The
browser confirms those instructions absent from maintenance; the underlying entry
flow is unchanged. `PRODUCT.md` records the public-copy restriction.

The catalog contains 134 unverified logical cases. Supported-device/screen-reader,
full browser interruption, visual, hosted routing/security and global coverage
acceptance remain open. This checkpoint does not finish the complete PRD.
