# Newsletter recovery — October 27, 2026

The newsletter workspace now remounts on account, role and session changes.
Permissions, filtered inventory and current record reads recover independently.
Keyed abortable reads retain timestamped authorized snapshots after temporary
failures and clear denied data. Current record access can refresh without
replacing unsaved fields. New revisions and server conflicts preserve drafts and
block obsolete saves; refreshed grants apply. Recipient and delivery-result reads
have explicit unavailable/retry states, and recipient paging uses the returned
page size.

Private work uses synchronous pending guards, scoped cancellation and unchanged
retry keys. Offline actions stay unsent. Send approval rechecks exact text,
password, current status/grants and actual review expiry at action time, including
malformed expiry. Changed campaign revisions revoke the old review. Bulk review
rechecks current records/grants and locks obsolete selections. Passwords clear at
request start and are absent from retry identities. Errors, review headings and
receipts receive focus.

Delivery review locks conflicting editor controls. Browser review caught and
fixed a navigation bug where this editor lock was mistaken for a running request,
preventing review closure. Real NavigationSafety regression cases now distinguish
an idle review from pending API work; idle review can be deliberately discarded.

Thirty-two interaction cases in two files include two axe structural audits.
All 1,103 tests in 137 files pass. Global coverage still fails 70%: 56.04% lines,
54.39% branches, 54.52% statements and 46.41% functions. All 17 critical-file
branch gates pass. Types and lint (zero errors/25 existing warnings) pass. No
thresholds/inclusions were relaxed. Production build, entry byte budgets and
secret scan pass.

Thirty-six actual loopback checks pass, including local SMTP double opt-in,
frozen-audience invalidation/deduplication, unsubscribe recheck, cancellation,
verified callbacks, suppression, scoped export and recoverable bulk cleanup.
The extra browser fixture stayed unsent. Exact generated team/records archived,
account disabled/sessions revoked and private ledger removed; quotas/jobs were
not reset. Evidence: `phase0/local-newsletter.json`.

Browser confirms remote revision input preservation, locked stale Save, bounded
375 px layout and deliberate draft discard. A generated audience review freezes
the editor, focuses its heading and keeps approval disabled without proof. The
fixed close flow was retested and deliberately discarded. No browser send,
self-test, cancellation, save, download or external link occurred. Final UI
sign-out/explicit tab close could not be verified after the tab attachment became
unavailable; independent fixture cleanup revokes its sessions. Viewport reset
issued. Screenshot: `ui-review/newsletter-conflict-recovery.png`; observations:
`phase0/newsletter-recovery-browser-observations.json`.

The catalog contains 133 unverified logical cases. Full browser interruption,
device/screen-reader, visual, hosted provider/worker and global coverage acceptance
remain open. This checkpoint does not finish the complete PRD.
