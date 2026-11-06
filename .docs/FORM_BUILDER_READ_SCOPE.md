# Saved Forms reads and builder context isolation — November 5, 2026

Saved-definition reads now retain matching timestamped snapshots after temporary
failure and clear them on 401/403/404 or session invalidation. Explicit current
access recheck is separate from automatic scope loading. Abort/current-scope/
mounted fences reject late results and late reload callbacks after replacement.
Builder and response workspaces remount their private state for account, role,
session and form-route replacement.

Builder draft saves and publication now carry abort signals. Queued autosaves
check the current editor generation before issuing a request and before accepting
its result; context replacement cancels transport and prevents queued old work.
Publication latches double activation and freezes input/modal dismissal. Current
read/permission/offline/revision states pause editing and autosave. Temporary
refresh failure retains proposed fields with timestamped feedback. Denial clears
fields, undo/redo, selected controls and private dialogs before access recheck.

Unknown or failed saves pause automatic writes. The editor keeps the proposed
draft and rechecks saved values read-only. Loading a newer saved definition names
the form, proposed/saved titles and field counts and requires explicit review of
discarding local fields/settings/undo history. Cancel keeps the proposed draft;
confirmation writes nothing and returns focus to the title. Atomic identical
draft/publication retry is deliberately still separate implementation work.

All 16 actual loopback API/DB and Chromium desktop/mobile checks pass: private
access boundaries, accepted-but-lost draft writes paused after one save, read-only
rechecking, reviewed loading, transient read preservation and denial recovery,
measured axe and no extra writes/external requests/page errors/overflow. Populated
axe found field help at 4.26:1; it now uses the existing secondary-text token and
the final measured checks pass. Only fresh fictional unpublished forms/accounts
were used; forms archived/accounts disabled/sessions revoked. No publication,
response, provider send, worker or existing chapter/production change occurred.
Evidence: `phase0/local-form-builder-read-scope.json`.

Complete builder mutation replay, response workspace independent read/write and
runtime/integration edge cases and full role/device/manual/visual/hosted acceptance
remain open. This checkpoint does not certify complete Forms or website PRD.

Twenty new DOM cases cover the saved-read fences, account/role/session/form
replacement, pending/queued-save cancellation, publication latching/cancellation,
late refresh focus, offline pause, stale draft review, validation correction and
denied writes. Together with the existing Forms read cases, all 42 focused checks
pass. A rejected validation draft remains editable for correction; uncertain or
conflicting writes pause until saved values are reviewed. Read-status feedback
uses normal body sizing/insets and distinguishes paused reads from missing edit
permission. Atomic mutation replay and full response recovery remain open.

All 1,577 tests/168 files pass. Full-tree coverage remains below 70%: 65.08%
lines, 64.86% branches, 63.32% statements and 56.40% functions. All 17 critical
branch gates pass. Catalog: 157 unverified logical acceptance cases.

Production build, type checks, lint (25 existing warnings), public-entry byte
budgets, secret scan and traceability pass. All 54 production-build browser
checks pass across the six Chrome/Firefox/WebKit desktop/mobile profiles:
`phase0/form-builder-scope-workspace-browser.json`. These fixtures verify shared
workspace readability and populated builder recovery; they do not replace real
Safari/device, human visual approval or the complete acceptance matrix.
