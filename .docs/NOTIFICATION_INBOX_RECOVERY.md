# Notification inbox recovery (local)

The requested Mark all read → Dismiss all flow remains. It changes only after a
server-confirmed refreshed count. Dismiss all still sends `readOnly: true`, so
new unread notifications are kept. The UI now explains that consequence beside
the action. Individual actions have distinct accessible names.

Reads abort and supersede earlier refreshes. Realtime updates do not start reads
during a write, and a synchronous write guard prevents duplicate clicks before
React commits. New page context hides the old page; a shrunken inventory returns
to a valid page. Account/role changes remount the bell/inbox state. Unmount aborts
pending reads/writes and ignores late results, including unread-count callbacks.
An already received server mutation cannot be recalled by aborting a request.

Initial loading has a named skeleton and failed reads have explicit retry.
Network refresh failure labels the last-read snapshot/time and disables its row
actions. Permission/not-found failures clear private rows instead of keeping
them as a stale snapshot. Mutation errors remain visible through ordinary read
refreshes until explicit recovery. Success/error and removed-row feedback get
semantic focus without animation frames. Stored update links are actionable only
as safe internal paths. The inbox has consistent spacing and wraps long text.

Thirteen DOM cases cover loading, full bulk flow/new unread updates, duplicate
writes, stale reads, refresh failure, permission loss, error/focus recovery,
unsafe links, pagination and unmount/account changes. A nineteenth axe structural
case checks the real notification dialog. All 839 tests/123 files pass; strict
types pass and lint is 0 errors/25 warnings. Global coverage is still below 70%:
35.86% lines/33.94% branches; all 17 critical-file branch gates pass. The same
JSDOM contrast/incomplete-rule limitations remain (`ACCESSIBILITY_STRUCTURE_CHECKS.md`).

`test:local-notification-bulk -- --hold-for-browser` passes eight real HTTP/
database checks. Its optional browser phase writes a new private mode-0600,
ignored sign-in ledger and removes it in cleanup. Actual Chrome signs into that
isolated fictional account, marks its one notification read, dismisses read
notifications, sees the empty inbox and focuses the committed success message.
A direct server read confirms zero remaining notifications for that account.
The suite also proves new unread and foreign-account notifications survive.
At 375 px the dialog fits within 375 px page width; viewport override reset.

The fictional browser session was signed out; the script logged out its separate
HTTP session, removed only invocation-owned fictional notification rows, disabled
its two fixture accounts and removed the private ledger. The normal sign-out
also cleared the earlier identifier-only fictional public queue record on that
browser, as designed. No real notification inbox, recipient, email or deployment
was changed.

Evidence: `phase0/local-notification-bulk.json`,
`phase0/notification-inbox-browser-observations.json`,
`ui-review/notification-inbox-recovery.png`. Complete real realtime outage,
supported-browser/screen-reader and operational acceptance remain open. This
checkpoint does not complete the PRD.
