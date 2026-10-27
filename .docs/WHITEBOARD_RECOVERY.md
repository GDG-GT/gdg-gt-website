# Whiteboard interaction recovery — October 27, 2026

Whiteboard private state now remounts on account/role/session changes. Drawing,
metadata, saved export and collaborator reads are abortable and bound to the open
board; late private responses cannot repopulate a discarded context. Version
refreshes apply changed action grants even when the board version is unchanged.
Permission denial clears private drawing and staged access data immediately.

Canvas callbacks carry the selected board and editor generation. A late callback
from a replaced editor cannot change the current scene. Autosave retains a stable
key for an unchanged failed scene, and metadata/access changes have independent
stable keys excluding passwords. Fields freeze synchronously during metadata
writes, duplicate actions are suppressed and sharing passwords clear at request
start. Exact-name archive/restore and scoped create checks also run at submit time.

Drawing can continue while an earlier drawing save is pending. The accepted saved
version becomes the baseline for the next queued scene; unsaved newer input is
retained. Remote revision conflicts lock writes while preserving the unsaved scene
for permitted local export. Offline drawing remains in the open tab and autosave
stays paused after reconnect until an explicit Save now. A committed metadata
write followed by a failed read is reported as saved with refresh required.

Directory, board, capability and collaborator failures remain independent.
Skeletons, meaningful retries, timestamped retained snapshots and filter reset
avoid false empty/loading states. Collaborator reads are ordered and cancelled
when their panel closes or its grant disappears. Saved exports are fenced and
only offered with an export grant. Receipt/error focus is semantic.

Twenty-two DOM interaction cases include three structural axe audits of the shell,
rename and sharing forms. The heavy drawing component is replaced by a controlled
adapter in these tests; they do not claim Excalidraw's own accessibility acceptance.
The full suite passes 980 tests/131 files. Global coverage remains below the PRD's
70% gate at 47.49% lines/44.96% branches; all 17 critical-file branch gates pass.
No threshold or inclusion was changed.
Strict types, lint (zero errors/25 existing warnings), production build, entry
byte budgets and secret scan pass. The resumed local scanner passes its current
database, clean-content and in-memory EICAR checks; local workers run with Mailpit
delivery and provider push disabled.

Thirty-eight actual loopback HTTP/private-WebSocket checks pass with cleanup
completed. The runner uses a fresh fictional officer and independently scoped
collaborators rather than spending the existing officer's confirmation quota.
Browser holds write cleanup-pending interim evidence and an exclusive ignored
mode-0600 credential ledger. All owned boards were recoverably archived, fixture
accounts disabled and sessions revoked; the ledger was removed.

The real browser loaded the actual drawing editor, preserved a staged fictional
rename after a remote protected save and disabled confirmation. At 375 px, document
width is 375 px, canvas width is 339 px and the name field stays between 36 and
339 px. The browser draft was discarded, sign-out verified, tab closed and
viewport reset. Screenshot: `ui-review/whiteboard-conflict-recovery.png`.
See `phase0/whiteboard-recovery-browser-observations.json` and
`phase0/local-whiteboards-integration.json`.

The catalog now has 128 unverified logical acceptance cases. Real drawing gesture,
screen-reader/device, interrupted autosave, hosted concurrency, performance and
visual acceptance remain open. This checkpoint does not complete the full PRD.
