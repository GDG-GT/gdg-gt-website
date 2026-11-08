# Private conversation request lifecycle (local)

Private conversations now remount on account/role replacement. Inbox, selected
thread/history and review reads are abortable; superseded reads, sign-out and
unmount cannot restore old private content. Filter changes invalidate earlier
reads. Every send/edit/remove/restore/read/archive/history/review operation uses
one immediate pending guard, account-session generation, selected-thread context
and transport signal. Completion/error/finally callbacks act only on the operation
that still owns that context. Denial and realtime revocation cancel pending work.
Background refresh defers while an operation owns the workspace.

Send/edit/review editors and committed/error feedback receive semantic focus.
Review passwords clear at request start. Failed messages retain their text and
same-body idempotency key for explicit retry. Offline writes are disabled, drafts
remain only in the open tab and reconnect does not submit them automatically.
Network cancellation does not imply that an already accepted server write rolled
back. Server participant/author/revision/review authority remains unchanged.

Inbox and thread errors are shown independently. Failed inbox reads no longer
display a first-use empty message, and failed thread reads no longer claim to be
loading indefinitely. Initial reads have named skeletons. Retained thread history
after a network failure carries its last-read timestamp; denied history is erased.

Fifteen added DOM cases exercise failure recovery, read cancellation, superseded
filters, stale history, duplicate sends, retry keys, account/session replacement,
edit/remove/read/archive/create/review outcomes, offline drafts and focus. Two
axe structural audits cover conversation and edit controls; only JSDOM's
non-rendering contrast rule is disabled. All 901 tests/127 files pass, strict types
pass and lint remains 0 errors/25 warnings. Coverage is below 70% at 40.76% lines/
38.80% branches; all 17 individual critical branch gates pass. Build, public/offline
byte budgets and the secret scan pass.

The actual local integration suite passes 40 HTTP/WebSocket/database/local-SMTP
checks, including browser-review follow-up. An earlier run failed a cross-clock
expiry assertion: its diagnostic showed a valid active review with 300,042 ms
remaining according to the host. The test now verifies exactly 300 seconds against
the audit timestamp from the same database transaction, and the short-lived JWT
against the database's returned expiry. The limits were not relaxed. Isolated
fictional Super Admin/participant sessions replace use of the existing bootstrap
account's review quota. Failed fixtures were cleaned; no quotas were reset.

Live Chrome uses a fictional Blog Editor's personal conversation view. An
independent session's follow-up arrived through Realtime without discarding its
unsent reply. At 375 px the document remains 375 px wide; the reply spans 18–357 px
and the Send button is 44 px high. A responsive raster was stale and discarded;
the inspected desktop screenshot after viewport reset was retained. The browser
never sent its draft. It cleared that fictional draft, signed out and closed the
temporary tab. The script archived its own threads/accounts, revoked its sessions,
removed its ignored mode-0600 credential ledger and retained history. Browser
credential bindings were cleared. Email stayed in local Mailpit; no real provider
or production change.

Evidence: `../phase0/local-direct-messages-integration.json`,
`../phase0/direct-message-browser-observations.json`,
`../ui-review/direct-message-draft-recovery.png`. Injected outage/sign-out races are
DOM tests; full browser fault injection, manual accessibility, visual/staging and
supported-device acceptance remain open. Catalog: 124 unverified logical cases.
