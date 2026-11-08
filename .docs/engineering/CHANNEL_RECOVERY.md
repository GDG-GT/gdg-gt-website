# Channel and team-chat interaction recovery (local)

Channel state remounts on account/role replacement and session clearing. One
immediate pending guard owns each room change, message action, send and older-
history request. Transport cancellation, mounted/controller identity and selected
room checks fence late success/error/finally callbacks. Access denial immediately
invalidates the room generation and cancels writes/member reads. Member reads
are ordered, abortable and scoped to the selected room. Background refresh avoids
competing with a pending operation. Server authority remains unchanged.

Creation permissions, directory, history and membership failures are independent.
Retry now reloads failed creation permissions; membership Retry reloads membership
data rather than only refreshing unrelated history. Initial reads have named
skeletons. Failed initial room/list reads no longer claim empty/loading results;
retained failed snapshots have timestamps. Filters expose reset. A pinned-only
read hides the previous unpinned history while loading, and the existing bounded
delta loop still applies every catch-up page in order.

Passwords clear at room-request start; exact archive/restore names and current
create scope gate saving. Failed sends preserve their idempotency key/draft.
Offline writes remain disabled and reconnect does not automatically submit.
Editor/error/committed feedback focuses semantically. Message receipts sit beside
the conversation composer so send scrolling does not leave focus at an offscreen
page-top status. The live log now wraps a native ordered list: assigning log
directly to the ordered list had produced real axe role/list-item violations.

Eighteen added DOM cases cover reads/retry/failures, pin isolation, delta pages,
membership cancellation, create/confirmation, duplicate/failed sends, account/
session/realtime denial, edits/pins, offline drafts and focus. Three axe structural
audits cover chat/edit/room settings. Contrast is excluded only because JSDOM does
not render; real browser/screen-reader acceptance remains separate.

All 919 tests/128 files pass; strict types pass; lint is 0 errors/25 warnings.
Global coverage remains below 70% at 42.54% lines/40.52% branches; all 17 critical
branch gates pass. Build, public/offline byte budgets and secret scan pass. No
database migration was needed. Actual local suites pass 33 channel checks plus
29 managed team-chat HTTP/WebSocket checks, including the browser follow-up.

Live Chrome uses a fictional current team lead. An independent session's scoped
follow-up arrives without discarding an unsent draft. The DOM has a live log with
a native list. At 375 px the document stays 375 px wide; reply and Send span
18–357 px, with a 44 px Send button. The inspected desktop screenshot is retained.
No browser message was submitted. The draft was cleared, viewport reset, account
signed out and temporary tab closed. Only invocation-owned fictional rooms/team/
accounts were recoverably archived; the ignored mode-0600 review ledger was
removed and browser credential bindings cleared. No real provider/production change.

Evidence: `../phase0/local-channels-integration.json`,
`../phase0/local-team-chat-integration.json`,
`../phase0/channel-recovery-browser-observations.json`,
`../ui-review/channel-draft-recovery.png`. Outage/late-result injection remains DOM-
based; full real browser fault/device/assistive-technology, visual and staging
acceptance remains open. Catalog: 125 unverified logical cases.
