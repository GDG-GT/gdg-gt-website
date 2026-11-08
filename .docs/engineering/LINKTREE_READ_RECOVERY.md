# Linktree workspace read and mutation recovery (local)

Creation permissions, profile inventory, selected profile/link pages and analytics
now have independent loading, error, retry and snapshot state. A successful list
read cannot hide a failed capability read. Initial reads display named skeletons;
background failures retain only their matching snapshot with a last-loaded time.
Changed search, state, page, selected profile or analytics period hides the prior
result during render, and superseded/unmounted requests abort and ignore late
results. Analytics failures are actionable rather than silently disappearing.

Denied reads erase their private snapshots. A denied capability/inventory read
also erases and aborts other private views, including in-flight ones, so retrying
cannot redisplay an older detail/analytics snapshot while access is rechecked.
Account/role changes and session clearing remount the workspace, erase draft
credentials and abort mutations. Network cancellation is not a server rollback.

Writes freeze synchronously before a second submit can enter. Pending callbacks
cannot navigate or announce success after unmount. Error/success feedback receives
semantic focus. Current create-team grants, exact live-target confirmation and
password presence gate saves; server authorization, revision/idempotency checks
and confirmation remain authoritative. Offline input stays only in the open tab;
saving requires reconnect plus explicit permission/revision refresh. Reconnection
does not automatically submit. Inventory filters have reset and truthful filtered/
out-of-range/first-use states, with creation suggested only when permitted.

Seventeen added DOM cases cover independent failures, skeletons, ordered/aborted
reads, hidden old filters/analytics, timestamped stale views, denied-read retry,
scoped private creation, conflict preservation, confirmation, duplicate writes,
account replacement, feedback focus and reconnect. One case runs three axe
structural audits on management, profile editing and decision controls. The sole
disabled rule is JSDOM's non-rendering color contrast check; real browser contrast,
screen readers, geometry and supported-device acceptance remain separate.

All 869 tests/125 files pass. Strict types pass; lint remains 0 errors/25 warnings.
Global coverage is below the required 70% at 38.18% lines/36.65% branches; all 17
individual critical branch gates pass. Build and byte-budget checks pass. No SQL
change beyond the already tested migration 109 was needed for this checkpoint.

The actual loopback Linktree suite passes 37 checks, including an independent
session revision change during browser review. Chrome verifies filter reset,
editor heading focus, preserved unsaved input and disabled Save after refresh of
the newer revision, even with confirmation fields entered. At 375 px the document
remains 375 px wide; all editor inputs/selects/textareas fit and are at least 44 px
high. The browser did not save/publish its draft or load any third-party iframe.
The fictional browser draft was explicitly discarded, viewport reset, account
signed out and temporary tab closed. The script archives only its own profile/
team/accounts and preserves history. Its optional browser credentials use an
ignored mode-0600 ledger, removed on cleanup, and browser bindings were cleared.

Evidence: `../phase0/local-linktree-integration.json`,
`../phase0/linktree-recovery-browser-observations.json`,
`../ui-review/linktree-conflict-recovery.png`. Controlled outage/reconnect races are
DOM tests, not browser network fault injection. Catalog: 122 unverified logical
cases. Hosted/visual/provider/manual acceptance and the complete PRD remain open.
