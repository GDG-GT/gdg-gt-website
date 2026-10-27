# Announcement interaction recovery — October 27, 2026

Announcement work is now isolated by officer/account role/session epoch and by
selected announcement. Ordered abortable reads and synchronously guarded writes
prevent duplicate submits and late private results. Audience preview, publication,
read acknowledgement, pin and retained-state transitions use current permissions
and read state. A denied read or realtime scope clears private records, audience
details, drafts and confirmations and cancels in-flight work.

Draft and publication retries retain an unchanged request key. Passwords clear at
request start and are excluded from the retained intent signature. Publication
checks the exact title and preview expiry at submit time as well as in the button
state; a ticking expiry indicator does not depend on another user input. Remote
versions preserve fields and block stale writes. Current grants replace cached
actions. Offline text remains in the open tab and never auto-submits on reconnect.

Inventory, selected record and creation-permission errors are independent, with
skeletons, semantic retry focus and timestamped retained snapshots. Failed reads
do not look empty. Filter reset and named record actions improve navigation. Error,
committed receipt and audience-confirmation headings receive keyboard focus.

Twenty DOM interaction cases include three axe structural audits for record,
preview and editing states. Actual loopback API, private WebSocket, audience,
publication, secret-authenticated schedule and Mailpit checks use fictional officer
and recipient accounts. Thirty checks pass, including the browser-review remote
edit. Evidence records cleanup completed; no external email or provider send,
scheduler reset or permanent deletion occurred.

Browser verification preserves an unsaved fictional title after a remote revision
and disables Save. At 375 px the document and controls stay in bounds; buttons
have 44-pixel height and checkbox labels have 44-pixel height. Screenshot:
`ui-review/announcement-conflict-recovery.png`. Browser preview activation timed
out and is not counted as browser preview acceptance; confirmation interactions
are separately covered by the DOM suite. No browser publication or save occurred.
The owned draft was discarded, browser signed out/tab closed, viewport reset and
private ledger removed. See `phase0/announcement-recovery-browser-observations.json`
and `phase0/local-announcements-integration.json`.

Full visual/device/screen-reader, interruption/expiry, hosted-provider and release
acceptance remain open. The catalog has 127 unverified logical cases; the complete
PRD is still open.
